import copy
import hashlib
import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

from asgiref.sync import async_to_sync
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from config_engine.models import ConfigDraft, ConfigRelease, EffectiveConfigSnapshot, FeatureFlag, RuleDefinition
from pos.models import (
    Branch,
    ChannelConfig,
    ConfigVersion,
    Floor,
    MenuCategory,
    MenuItem,
    ModifierGroup,
    OrderChannel,
    PriceList,
    ServiceChargeRule,
    TaxProfile,
)
from pos.serializers import (
    ChannelConfigSerializer,
    FloorSerializer,
    MenuCategorySerializer,
    MenuItemSerializer,
    ModifierGroupSerializer,
    OrderChannelSerializer,
    PriceListSerializer,
    ServiceChargeRuleSerializer,
    TaxProfileSerializer,
    TableSerializer,
)

try:
    from channels.layers import get_channel_layer
except Exception:  # pragma: no cover
    def get_channel_layer():  # type: ignore[override]
        return None


WS_GROUP_CONFIG_PREFIX = "config"
WS_GROUP_PERMISSION_PREFIX = "permissions"
WS_GROUP_ORDER_PREFIX = "orders"
WS_GROUP_KDS_PREFIX = "kds"
logger = logging.getLogger(__name__)


def compute_checksum(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload or {},
        cls=DjangoJSONEncoder,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _json_safe(payload: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(payload or {}, cls=DjangoJSONEncoder))


def _qs_to_data(serializer_cls, queryset: QuerySet):
    return serializer_cls(queryset, many=True).data


def build_base_config_payload(branch: Branch, version: int) -> dict[str, Any]:
    channels = OrderChannel.objects.order_by("code")
    channel_configs = (
        ChannelConfig.objects.filter(branch=branch)
        .select_related("channel", "price_list", "tax_profile", "service_charge_rule", "discount_policy")
        .order_by("channel__code")
    )
    floors = Floor.objects.filter(branch=branch).order_by("sort_order", "name")
    tables = branch.tables.select_related("floor").order_by("code")
    menu_categories = MenuCategory.objects.filter(branch=branch).order_by("sort_order", "name")
    menu_items = MenuItem.objects.filter(branch=branch).order_by("name")
    modifiers = ModifierGroup.objects.filter(branch=branch).prefetch_related("items").order_by("name")
    price_lists = PriceList.objects.filter(branch=branch).prefetch_related("items").order_by("name")
    taxes = TaxProfile.objects.filter(branch=branch).prefetch_related("rules").order_by("name")
    service_charges = ServiceChargeRule.objects.filter(branch=branch).order_by("name")
    discount_policies = list(
        branch.discount_policies.order_by("name").values(
            "id",
            "name",
            "max_discount_percent",
            "requires_manager_override",
            "is_active",
            "updated_at",
        )
    )

    payload = {
        "version": int(version),
        "branch": str(branch.id),
        "channels": _qs_to_data(OrderChannelSerializer, channels),
        "channel_configs": _qs_to_data(ChannelConfigSerializer, channel_configs),
        "floors": _qs_to_data(FloorSerializer, floors),
        "tables": _qs_to_data(TableSerializer, tables),
        "menu_categories": _qs_to_data(MenuCategorySerializer, menu_categories),
        "menu_items": _qs_to_data(MenuItemSerializer, menu_items),
        "modifiers": _qs_to_data(ModifierGroupSerializer, modifiers),
        "price_lists": _qs_to_data(PriceListSerializer, price_lists),
        "taxes": _qs_to_data(TaxProfileSerializer, taxes),
        "service_charges": _qs_to_data(ServiceChargeRuleSerializer, service_charges),
        "discount_policies": discount_policies,
    }
    return payload


def _is_match(expected: Any, actual: Any) -> bool:
    if isinstance(expected, list):
        return actual in expected
    return expected == actual


def _rule_matches(condition: dict[str, Any], context: dict[str, Any]) -> bool:
    if not condition:
        return True

    now = context.get("now")
    if "channel" in condition and not _is_match(condition["channel"], context.get("channel")):
        return False
    if "payment_method" in condition and not _is_match(condition["payment_method"], context.get("payment_method")):
        return False
    if "customer_type" in condition and not _is_match(condition["customer_type"], context.get("customer_type")):
        return False

    cart_total = Decimal(str(context.get("cart_total") or 0))
    if "cart_total_gte" in condition and cart_total < Decimal(str(condition["cart_total_gte"])):
        return False
    if "cart_total_lte" in condition and cart_total > Decimal(str(condition["cart_total_lte"])):
        return False

    distance = Decimal(str(context.get("distance") or 0))
    if "distance_km_lte" in condition and distance > Decimal(str(condition["distance_km_lte"])):
        return False

    if "time_between" in condition and now:
        start_str, end_str = condition["time_between"]
        hh_mm = now.strftime("%H:%M")
        if not (start_str <= hh_mm <= end_str):
            return False

    return True


def _apply_action(config: dict[str, Any], action: dict[str, Any]) -> None:
    action_type = action.get("type")
    if action_type == "disable_channel":
        channel_code = action.get("channel")
        config["channels"] = [ch for ch in config.get("channels", []) if ch.get("code") != channel_code]
        config["channel_configs"] = [
            cfg for cfg in config.get("channel_configs", []) if cfg.get("channel_code") != channel_code
        ]
    elif action_type == "hide_menu_items":
        hidden_ids = set(action.get("item_ids", []))
        if not hidden_ids:
            return
        config["menu_items"] = [item for item in config.get("menu_items", []) if item.get("id") not in hidden_ids]
    elif action_type == "append_fee":
        value = action.get("value", 0)
        config.setdefault("runtime_fees", []).append(
            {
                "name": action.get("name", "dynamic_fee"),
                "charge_type": action.get("charge_type", "fixed"),
                "value": value,
            }
        )
    elif action_type == "set_kitchen_route":
        config.setdefault("routing", {})[action.get("channel", "default")] = action.get("station", "kitchen")
    elif action_type == "enforce_payment":
        allowed = action.get("allowed_methods", [])
        config.setdefault("runtime_constraints", {})["allowed_payment_methods"] = allowed


def _merge_overrides(config: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    overrides = payload.get("overrides") if isinstance(payload, dict) else {}
    if not isinstance(overrides, dict):
        overrides = {}

    # Backward-compatible shape: allow override keys at payload root.
    if not overrides and isinstance(payload, dict):
        override_keys = {
            "enabled_channels",
            "hidden_menu_item_ids",
            "ui_toggles",
            "allowed_payment_methods",
            "allowed_fulfillment_methods",
        }
        if any(key in payload for key in override_keys):
            overrides = payload

    if "enabled_channels" in overrides:
        enabled_channels = set(overrides.get("enabled_channels") or [])
        config["channels"] = [ch for ch in config.get("channels", []) if ch.get("code") in enabled_channels]
        config["channel_configs"] = [
            cfg for cfg in config.get("channel_configs", []) if cfg.get("channel_code") in enabled_channels
        ]

    hidden_items = set(overrides.get("hidden_menu_item_ids") or [])
    if hidden_items:
        config["menu_items"] = [item for item in config.get("menu_items", []) if item.get("id") not in hidden_items]

    if "ui_toggles" in overrides:
        ui_toggles = overrides.get("ui_toggles") or {}
        config["ui_toggles"] = ui_toggles

    if "allowed_payment_methods" in overrides:
        allowed_payments = overrides.get("allowed_payment_methods") or []
        config["allowed_payment_methods"] = allowed_payments

    if "allowed_fulfillment_methods" in overrides:
        allowed_fulfillment = overrides.get("allowed_fulfillment_methods") or []
        config["allowed_fulfillment_methods"] = allowed_fulfillment

    return config


def _apply_feature_flags(config: dict[str, Any], company_id: str, branch_id: str, role_code: str) -> dict[str, Any]:
    flags = FeatureFlag.objects.filter(company_id=company_id).filter(branch_id__in=[None, branch_id]).order_by("-priority")
    result: dict[str, bool] = {}
    for flag in flags:
        if flag.scope_type == "role" and flag.scope_value and flag.scope_value != role_code:
            continue
        result[flag.key] = bool(flag.enabled)
    if result:
        config["feature_flags"] = result
    return config


def _apply_rules(config: dict[str, Any], company_id: str, branch_id: str, context: dict[str, Any]) -> dict[str, Any]:
    rules = (
        RuleDefinition.objects.filter(company_id=company_id, enabled=True)
        .filter(branch_id__in=[None, branch_id])
        .order_by("-priority", "created_at")
    )
    for rule in rules:
        if _rule_matches(rule.condition or {}, context):
            _apply_action(config, rule.action or {})
    return config


def materialize_effective_config(branch: Branch, role_code: str = "", channel_code: str = "", context: dict[str, Any] | None = None) -> dict[str, Any]:
    config_version, _ = ConfigVersion.objects.get_or_create(branch=branch, defaults={"version": 1})
    base_payload = build_base_config_payload(branch, int(config_version.version))
    active_release = ConfigRelease.objects.filter(branch=branch, is_active=True).order_by("-version").first()

    working = copy.deepcopy(base_payload)
    if active_release:
        working = _merge_overrides(working, active_release.payload or {})

    rule_context = {
        "channel": channel_code,
        "payment_method": (context or {}).get("payment_method", ""),
        "customer_type": (context or {}).get("customer_type", ""),
        "cart_total": (context or {}).get("cart_total", 0),
        "distance": (context or {}).get("distance", 0),
        "now": (context or {}).get("now", timezone.localtime()),
    }

    working = _apply_feature_flags(working, str(branch.company_id), str(branch.id), role_code)
    working = _apply_rules(working, str(branch.company_id), str(branch.id), rule_context)

    serializable_working = _json_safe(working)
    checksum = compute_checksum(serializable_working)
    EffectiveConfigSnapshot.objects.update_or_create(
        branch=branch,
        role_code=role_code or "",
        channel_code=channel_code or "",
        config_version=int(config_version.version),
        defaults={
            "company": branch.company,
            "checksum": checksum,
            "payload": serializable_working,
        },
    )
    serializable_working["checksum"] = checksum
    return serializable_working


def publish_draft(draft: ConfigDraft, actor) -> ConfigRelease:
    if draft.status != "draft":
        raise ValueError("Only draft status can be published.")
    if not draft.branch:
        raise ValueError("Branch-scoped draft is required for publishing.")

    with transaction.atomic():
        version_state, _ = ConfigVersion.objects.select_for_update().get_or_create(branch=draft.branch, defaults={"version": 1})
        version_state.version += 1
        version_state.save(update_fields=["version", "updated_at"])

        ConfigRelease.objects.filter(branch=draft.branch, is_active=True).update(is_active=False)

        release = ConfigRelease.objects.create(
            company=draft.company,
            branch=draft.branch,
            draft=draft,
            version=version_state.version,
            checksum=draft.checksum,
            payload=draft.payload,
            is_active=True,
            created_by=actor,
        )

        draft.status = "published"
        draft.published_at = timezone.now()
        draft.published_by = actor
        draft.save(update_fields=["status", "published_at", "published_by", "updated_at", "checksum"])

    broadcast_config_event(
        branch_id=str(draft.branch_id),
        message_type="CONFIG_PATCH",
        payload={
            "config_version": int(release.version),
            "checksum": release.checksum,
            "draft_id": str(draft.id),
            "release_id": str(release.id),
        },
    )
    return release


def rollback_release(target_release: ConfigRelease, actor) -> ConfigRelease:
    if not target_release.branch_id:
        raise ValueError("Invalid target release.")

    with transaction.atomic():
        version_state, _ = ConfigVersion.objects.select_for_update().get_or_create(
            branch=target_release.branch,
            defaults={"version": 1},
        )
        version_state.version += 1
        version_state.save(update_fields=["version", "updated_at"])

        ConfigRelease.objects.filter(branch=target_release.branch, is_active=True).update(is_active=False)
        rollback_release_obj = ConfigRelease.objects.create(
            company=target_release.company,
            branch=target_release.branch,
            draft=target_release.draft,
            version=version_state.version,
            checksum=target_release.checksum,
            payload=target_release.payload,
            is_active=True,
            rolled_back_from=target_release,
            created_by=actor,
        )

    broadcast_config_event(
        branch_id=str(target_release.branch_id),
        message_type="CONFIG_PATCH",
        payload={
            "config_version": int(rollback_release_obj.version),
            "checksum": rollback_release_obj.checksum,
            "rollback_from_release_id": str(target_release.id),
            "release_id": str(rollback_release_obj.id),
        },
    )
    return rollback_release_obj


def broadcast_config_event(branch_id: str, message_type: str, payload: dict[str, Any]) -> None:
    from pos.models import Branch

    try:
        branch = Branch.objects.select_related("company").get(id=branch_id)
        from sync_engine.services import queue_outbound_event

        queue_outbound_event(
            branch=branch,
            event_type=message_type,
            entity_type="config",
            entity_id=branch_id,
            operation="patch",
            payload=payload,
            stream="config",
        )
    except Exception:
        pass

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    group_name = f"{WS_GROUP_CONFIG_PREFIX}_{branch_id}"
    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "config.event",
                "message": {
                    "type": message_type,
                    "branch_id": branch_id,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "payload": payload,
                },
            },
        )
    except Exception:
        logger.warning("Config WS broadcast skipped for branch %s: channel layer unavailable.", branch_id, exc_info=True)


def broadcast_permission_event(branch_id: str, payload: dict[str, Any]) -> None:
    from pos.models import Branch

    try:
        branch = Branch.objects.select_related("company").get(id=branch_id)
        from sync_engine.services import queue_outbound_event

        queue_outbound_event(
            branch=branch,
            event_type="PERMISSION_PATCH",
            entity_type="permission",
            entity_id=branch_id,
            operation="patch",
            payload=payload,
            stream="permissions",
        )
    except Exception:
        pass

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    group_name = f"{WS_GROUP_PERMISSION_PREFIX}_{branch_id}"
    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "permission.event",
                "message": {
                    "type": "PERMISSION_PATCH",
                    "branch_id": branch_id,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "payload": payload,
                },
            },
        )
    except Exception:
        logger.warning("Permission WS broadcast skipped for branch %s: channel layer unavailable.", branch_id, exc_info=True)


def broadcast_order_event(branch_id: str, payload: dict[str, Any]) -> None:
    from pos.models import Branch

    try:
        branch = Branch.objects.select_related("company").get(id=branch_id)
        from sync_engine.services import queue_outbound_event

        queue_outbound_event(
            branch=branch,
            event_type="ORDER_UPDATE",
            entity_type="order",
            entity_id=str(payload.get("order_id") or ""),
            operation="patch",
            payload=payload,
            stream="orders",
        )
    except Exception:
        pass

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    group_name = f"{WS_GROUP_ORDER_PREFIX}_{branch_id}"
    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "order.event",
                "message": {
                    "type": "ORDER_UPDATE",
                    "branch_id": branch_id,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "payload": payload,
                },
            },
        )
    except Exception:
        logger.warning("Order WS broadcast skipped for branch %s: channel layer unavailable.", branch_id, exc_info=True)


def broadcast_kds_event(branch_id: str, payload: dict[str, Any]) -> None:
    from pos.models import Branch

    try:
        branch = Branch.objects.select_related("company").get(id=branch_id)
        from sync_engine.services import queue_outbound_event

        queue_outbound_event(
            branch=branch,
            event_type="KDS_UPDATE",
            entity_type="kds",
            entity_id=str(payload.get("item_id") or payload.get("order_id") or ""),
            operation="patch",
            payload=payload,
            stream="kds",
        )
    except Exception:
        pass

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    group_name = f"{WS_GROUP_KDS_PREFIX}_{branch_id}"
    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "kds.event",
                "message": {
                    "type": "KDS_UPDATE",
                    "branch_id": branch_id,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "payload": payload,
                },
            },
        )
    except Exception:
        logger.warning("KDS WS broadcast skipped for branch %s: channel layer unavailable.", branch_id, exc_info=True)
