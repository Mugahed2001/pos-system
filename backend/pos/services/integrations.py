import hashlib
import hmac
import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from pos.models import (
    AuditLog,
    Branch,
    ChannelConfig,
    DeliveryProvider,
    Device,
    ExternalOrder,
    ExternalOrderEvent,
    ExternalOutboundTask,
    KdsItem,
    OrderChannel,
    OrderChannelSnapshot,
    PosOrder,
    PosOrderItem,
    ProviderItemMapping,
    ProviderStoreMapping,
)
from pos.services.order_numbers import get_next_order_number


class IntegrationError(ValueError):
    pass


DEFAULT_SIGNATURE_HEADER = "X-Provider-Signature"
DEFAULT_TIMESTAMP_HEADER = "X-Provider-Timestamp"
DEFAULT_API_KEY_HEADER = "X-Provider-ApiKey"


def _safe_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0.00")


def _get_header(request, key: str) -> str:
    return (request.headers.get(key) or "").strip()


def verify_webhook(provider: DeliveryProvider, request) -> None:
    secrets = provider.secrets_json or {}
    if provider.auth_type == DeliveryProvider.AuthType.API_KEY:
        header_name = secrets.get("api_key_header", DEFAULT_API_KEY_HEADER)
        expected = (secrets.get("api_key") or "").strip()
        received = _get_header(request, header_name)
        if not expected or not received or received != expected:
            raise IntegrationError("Invalid API key.")
        return

    if provider.auth_type == DeliveryProvider.AuthType.HMAC:
        header_name = secrets.get("signature_header", DEFAULT_SIGNATURE_HEADER)
        ts_header = secrets.get("timestamp_header", DEFAULT_TIMESTAMP_HEADER)
        secret = (secrets.get("hmac_secret") or "").encode("utf-8")
        signature = _get_header(request, header_name)
        timestamp = _get_header(request, ts_header)
        if not secret or not signature or not timestamp:
            raise IntegrationError("Missing HMAC signature.")
        raw_body = request.body or b""
        signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
        expected = hmac.new(secret, signed_payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise IntegrationError("Invalid HMAC signature.")
        return

    raise IntegrationError("Unsupported auth type.")


def parse_external_payload(payload: dict) -> dict[str, Any]:
    required = ["provider_order_id", "provider_store_id", "status", "items"]
    for key in required:
        if key not in payload:
            raise IntegrationError(f"Missing field: {key}")
    if not isinstance(payload.get("items"), list) or not payload["items"]:
        raise IntegrationError("Items must be a non-empty list.")
    return payload


def _parse_iso_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if timezone.is_aware(value) else timezone.make_aware(value)
    if not value:
        return timezone.now()
    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)
    except Exception:
        return timezone.now()


def _resolve_branch(provider: DeliveryProvider, provider_store_id: str) -> Branch:
    mapping = ProviderStoreMapping.objects.select_related("branch").filter(
        provider=provider,
        provider_store_id=provider_store_id,
    ).first()
    if not mapping:
        raise IntegrationError("Unknown provider store mapping.")
    return mapping.branch


def _resolve_items(provider: DeliveryProvider, items: list[dict]) -> list[dict[str, Any]]:
    provider_ids = [item.get("provider_item_id") for item in items]
    mappings = ProviderItemMapping.objects.select_related("menu_item").filter(
        provider=provider,
        provider_item_id__in=provider_ids,
    )
    map_by_provider_id = {m.provider_item_id: m.menu_item for m in mappings}

    resolved = []
    for item in items:
        provider_item_id = item.get("provider_item_id")
        menu_item = map_by_provider_id.get(provider_item_id)
        if not menu_item:
            raise IntegrationError(f"Missing item mapping for provider_item_id={provider_item_id}")
        resolved.append(
            {
                "menu_item": menu_item,
                "name": item.get("name") or menu_item.name,
                "quantity": _safe_decimal(item.get("quantity", "1")),
                "unit_price": _safe_decimal(item.get("unit_price", menu_item.base_price)),
            }
        )
    return resolved


def _get_integration_device(branch: Branch):
    device_id = f"INT-{branch.code}"
    token = f"int_{branch.code}_{uuid4().hex}"
    device = Device.objects.filter(device_id=device_id).first()
    if not device:
        device = Device.objects.create(
            device_id=device_id,
            token=token,
            branch=branch,
            display_name=f"Integration ({branch.code})",
        )
    else:
        if not device.token:
            device.token = token
        device.branch = branch
        device.is_active = True
        device.save(update_fields=["token", "branch", "is_active", "updated_at"])
    return device


def _get_integration_user():
    user_model = get_user_model()
    user = user_model.objects.filter(username="integration").first()
    if user:
        return user
    user = user_model.objects.create(username="integration", is_active=True, is_staff=False)
    user.set_unusable_password()
    user.save(update_fields=["password"])
    return user


def _resolve_channel_config(branch: Branch, provider: DeliveryProvider) -> ChannelConfig:
    channel_code = (provider.secrets_json or {}).get("default_channel", OrderChannel.ChannelCode.DELIVERY)
    channel = OrderChannel.objects.filter(code=channel_code).first()
    if not channel:
        raise IntegrationError("Missing delivery channel.")
    channel_config = ChannelConfig.objects.select_related(
        "price_list",
        "tax_profile",
        "service_charge_rule",
        "discount_policy",
        "channel",
    ).prefetch_related("tax_profile__rules").filter(branch=branch, channel=channel).first()
    if not channel_config:
        raise IntegrationError("Missing channel config for branch.")
    return channel_config


def _map_external_status(status: str) -> tuple[str, str]:
    normalized = status.upper()
    if normalized in {"RECEIVED"}:
        return PosOrder.OrderStatus.DRAFT, KdsItem.KdsStatus.NEW
    if normalized in {"ACCEPTED", "IN_PREP"}:
        return PosOrder.OrderStatus.SUBMITTED, KdsItem.KdsStatus.PREPARING
    if normalized in {"READY"}:
        return PosOrder.OrderStatus.SUBMITTED, KdsItem.KdsStatus.READY
    if normalized in {"PICKED_UP", "DELIVERED"}:
        return PosOrder.OrderStatus.COMPLETED, KdsItem.KdsStatus.SERVED
    if normalized in {"CANCELLED"}:
        return PosOrder.OrderStatus.CANCELED, KdsItem.KdsStatus.NEW
    return PosOrder.OrderStatus.SUBMITTED, KdsItem.KdsStatus.NEW


def _build_external_order_snapshot(
    order: PosOrder,
    channel_config: ChannelConfig,
    subtotal: Decimal,
    tax_total: Decimal,
    discount_total: Decimal,
    service_charge_total: Decimal,
    excise_total: Decimal = Decimal("0.00"),
) -> dict[str, Any]:
    grand_total = (subtotal + tax_total + excise_total + service_charge_total - discount_total).quantize(Decimal("0.01"))
    return {
        "captured_at": timezone.now().isoformat(),
        "channel": channel_config.channel.code,
        "config_version": channel_config.config_version,
        "price_list": {
            "id": str(channel_config.price_list_id),
            "name": channel_config.price_list.name,
        },
        "tax_profile": {
            "id": str(channel_config.tax_profile_id),
            "name": channel_config.tax_profile.name,
            "rules": [
                {
                    "id": str(rule.id),
                    "code": rule.code,
                    "rate_percent": str(rule.rate_percent),
                    "is_inclusive": rule.is_inclusive,
                }
                for rule in channel_config.tax_profile.rules.all()
            ],
        },
        "service_charge": {
            "rule_id": str(channel_config.service_charge_rule_id) if channel_config.service_charge_rule_id else None,
            "value": str(service_charge_total),
            "charge_type": channel_config.service_charge_rule.charge_type if channel_config.service_charge_rule_id else None,
        },
        "excise_tax": {
            "total": str(excise_total),
            "breakdown": {},
        },
        "discount_policy": {
            "id": str(channel_config.discount_policy_id) if channel_config.discount_policy_id else None,
            "name": channel_config.discount_policy.name if channel_config.discount_policy_id else None,
            "max_discount_percent": (
                str(channel_config.discount_policy.max_discount_percent)
                if channel_config.discount_policy_id
                else None
            ),
            "requires_manager_override": (
                channel_config.discount_policy.requires_manager_override
                if channel_config.discount_policy_id
                else False
            ),
        },
        "printing_routing": channel_config.printing_routing,
        "totals": {
            "subtotal": str(subtotal),
            "tax_total": str(tax_total),
            "excise_total": str(excise_total),
            "service_charge_total": str(service_charge_total),
            "discount_total": str(discount_total),
            "grand_total": str(grand_total),
        },
        "order_id": str(order.id),
        "offline_created_at": order.offline_created_at.isoformat(),
    }


def create_or_update_external_order(provider: DeliveryProvider, payload: dict, raw_payload: dict) -> ExternalOrder:
    payload = parse_external_payload(payload)
    branch = _resolve_branch(provider, payload["provider_store_id"])
    status_external = payload.get("status", "")

    with transaction.atomic():
        external = (
            ExternalOrder.objects.select_for_update()
            .filter(provider=provider, provider_order_id=payload["provider_order_id"])
            .first()
        )
        if not external:
            external = ExternalOrder.objects.create(
                provider=provider,
                provider_order_id=payload["provider_order_id"],
                branch=branch,
                status_external=status_external,
                raw_payload=raw_payload,
                last_synced_at=timezone.now(),
            )
        else:
            external.status_external = status_external
            external.raw_payload = raw_payload
            external.last_error = ""
            external.last_synced_at = timezone.now()
            external.save(update_fields=["status_external", "raw_payload", "last_error", "last_synced_at", "updated_at"])

        ExternalOrderEvent.objects.create(
            external_order=external,
            event_type=ExternalOrderEvent.EventType.WEBHOOK_RECEIVED,
            payload=raw_payload,
        )

        if external.mapped_order_id:
            _sync_external_status(external)
            return external

        resolved_items = _resolve_items(provider, payload["items"])
        channel_config = _resolve_channel_config(branch, provider)
        integration_device = _get_integration_device(branch)
        integration_user = _get_integration_user()
        order_status, kds_status = _map_external_status(status_external)
        placed_at = _parse_iso_datetime(payload.get("placed_at"))
        totals = payload.get("totals") or {}

        order = PosOrder.objects.create(
            local_id=f"external-{external.provider_order_id}",
            idempotency_key=f"external-{external.provider_order_id}",
            branch=branch,
            device=integration_device,
            user=integration_user,
            channel=channel_config.channel,
            channel_config=channel_config,
            status=order_status,
            order_number=get_next_order_number(branch),
            fulfillment_mode=PosOrder.FulfillmentMode.COUNTER,
            pickup_window_status=PosOrder.PickupWindowStatus.PENDING,
            offline_created_at=placed_at,
            notes=payload.get("notes", ""),
        )

        subtotal = Decimal("0.00")
        for item in resolved_items:
            subtotal += item["unit_price"] * item["quantity"]

        tax_total = _safe_decimal(totals.get("tax"))
        excise_total = _safe_decimal(totals.get("excise"))
        discount_total = _safe_decimal(totals.get("discount"))
        service_total = _safe_decimal(totals.get("service"))

        items = []
        for item in resolved_items:
            line_subtotal = item["unit_price"] * item["quantity"]
            ratio = line_subtotal / subtotal if subtotal > 0 else Decimal("0")
            line_tax = (tax_total * ratio).quantize(Decimal("0.01")) if tax_total else Decimal("0.00")
            line_discount = (discount_total * ratio).quantize(Decimal("0.01")) if discount_total else Decimal("0.00")
            items.append(
                PosOrderItem(
                    order=order,
                    menu_item=item["menu_item"],
                    quantity=item["quantity"],
                    unit_price_snapshot=item["unit_price"],
                    tax_amount_snapshot=line_tax,
                    excise_amount_snapshot=Decimal("0.00"),
                    discount_amount_snapshot=line_discount,
                    modifiers_snapshot_json=[],
                )
            )
        PosOrderItem.objects.bulk_create(items)

        snapshot = _build_external_order_snapshot(
            order,
            channel_config,
            subtotal,
            tax_total,
            discount_total,
            service_total,
            excise_total=excise_total,
        )
        OrderChannelSnapshot.objects.create(order=order, payload=snapshot, config_version=channel_config.config_version)

        order.subtotal = subtotal
        order.tax_total = tax_total
        order.excise_total = excise_total
        order.service_charge_total = service_total
        order.discount_total = discount_total
        grand_total = _safe_decimal(totals.get("grand_total"))
        if grand_total <= 0:
            grand_total = _safe_decimal(snapshot["totals"]["grand_total"])
        order.grand_total = grand_total
        order.submitted_at = timezone.now() if order_status == PosOrder.OrderStatus.SUBMITTED else None
        order.save(
            update_fields=[
                "subtotal",
                "tax_total",
                "excise_total",
                "service_charge_total",
                "discount_total",
                "grand_total",
                "submitted_at",
                "updated_at",
            ]
        )

        for order_item in order.items.select_related("menu_item"):
            KdsItem.objects.get_or_create(
                order=order,
                order_item=order_item,
                defaults={"station": order_item.menu_item.kitchen_station, "status": kds_status},
            )

        external.mapped_order = order
        external.save(update_fields=["mapped_order", "updated_at"])
        AuditLog.objects.create(
            actor=integration_user,
            device=integration_device,
            branch=branch,
            action="external_order_created",
            entity="ExternalOrder",
            entity_id=str(external.id),
            after_data={"provider_order_id": external.provider_order_id, "order_id": str(order.id)},
        )

        return external


def _sync_external_status(external: ExternalOrder) -> None:
    if not external.mapped_order:
        return
    order_status, kds_status = _map_external_status(external.status_external)
    if external.mapped_order.status != order_status:
        external.mapped_order.status = order_status
        if order_status == PosOrder.OrderStatus.SUBMITTED and not external.mapped_order.submitted_at:
            external.mapped_order.submitted_at = timezone.now()
        external.mapped_order.save(update_fields=["status", "submitted_at", "updated_at"])

    for item in external.mapped_order.kds_items.all():
        if item.status != kds_status:
            item.status = kds_status
            item.status_at = timezone.now()
            item.save(update_fields=["status", "status_at", "updated_at"])


def _build_outbound_headers(provider: DeliveryProvider) -> dict[str, str]:
    secrets = provider.secrets_json or {}
    headers = {"Content-Type": "application/json"}
    if provider.auth_type == DeliveryProvider.AuthType.API_KEY:
        header_name = secrets.get("api_key_header", DEFAULT_API_KEY_HEADER)
        api_key = secrets.get("api_key")
        if api_key:
            headers[header_name] = api_key
    if provider.auth_type == DeliveryProvider.AuthType.HMAC:
        ts_header = secrets.get("timestamp_header", DEFAULT_TIMESTAMP_HEADER)
        sig_header = secrets.get("signature_header", DEFAULT_SIGNATURE_HEADER)
        secret = (secrets.get("hmac_secret") or "").encode("utf-8")
        timestamp = str(int(timezone.now().timestamp()))
        payload = f"{timestamp}.".encode("utf-8")
        signature = hmac.new(secret, payload, hashlib.sha256).hexdigest() if secret else ""
        headers[ts_header] = timestamp
        headers[sig_header] = signature
    return headers


def send_ready_to_provider(external: ExternalOrder) -> dict[str, Any]:
    try:
        import requests
    except Exception as exc:
        raise IntegrationError("مكتبة requests غير مثبتة.") from exc
    provider = external.provider
    endpoint = (provider.endpoints_json or {}).get("mark_ready")
    if not endpoint:
        raise IntegrationError("Provider mark_ready endpoint not configured.")
    url = f"{provider.base_url}{endpoint}".format(provider_order_id=external.provider_order_id)
    payload = {"status": "READY", "provider_order_id": external.provider_order_id}
    headers = _build_outbound_headers(provider)

    response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
    if response.status_code >= 400:
        raise IntegrationError(f"Provider responded with {response.status_code}.")

    ExternalOrderEvent.objects.create(
        external_order=external,
        event_type=ExternalOrderEvent.EventType.OUTBOUND_READY_SENT,
        payload=payload,
        response={"status_code": response.status_code, "body": response.text[:1000]},
    )
    external.last_error = ""
    external.last_synced_at = timezone.now()
    external.save(update_fields=["last_error", "last_synced_at", "updated_at"])
    return {"status_code": response.status_code}


def enqueue_outbound_task(external: ExternalOrder, action: str, payload: dict, error: str) -> ExternalOutboundTask:
    next_attempt = timezone.now() + timedelta(seconds=15)
    task = ExternalOutboundTask.objects.create(
        external_order=external,
        action=action,
        payload=payload,
        attempts=1,
        next_attempt_at=next_attempt,
        last_error=error,
        status=ExternalOutboundTask.TaskStatus.PENDING,
    )
    ExternalOrderEvent.objects.create(
        external_order=external,
        event_type=ExternalOrderEvent.EventType.FAILED,
        payload=payload,
        response={"error": error},
    )
    external.last_error = error
    external.save(update_fields=["last_error", "updated_at"])
    return task


def retry_outbound_task(task: ExternalOutboundTask) -> ExternalOutboundTask:
    if task.status != ExternalOutboundTask.TaskStatus.PENDING:
        return task
    try:
        send_ready_to_provider(task.external_order)
        task.status = ExternalOutboundTask.TaskStatus.SUCCEEDED
        task.save(update_fields=["status", "updated_at"])
        return task
    except IntegrationError as exc:
        attempts = task.attempts + 1
        delay = min(300, 2 ** attempts)
        task.attempts = attempts
        task.next_attempt_at = timezone.now() + timedelta(seconds=delay)
        task.last_error = str(exc)
        task.status = ExternalOutboundTask.TaskStatus.PENDING
        task.save(update_fields=["attempts", "next_attempt_at", "last_error", "status", "updated_at"])
        ExternalOrderEvent.objects.create(
            external_order=task.external_order,
            event_type=ExternalOrderEvent.EventType.RETRY,
            payload=task.payload,
            response={"error": str(exc)},
        )
        return task
