from decimal import Decimal
from typing import Any

from django.utils import timezone

from pos.models import ChannelConfig, OrderChannel, PosOrder


class OrderRuleError(ValueError):
    pass


def ensure_channel_allows_new_orders(channel_config: ChannelConfig) -> None:
    if not channel_config.is_enabled or not channel_config.allow_new_orders:
        raise OrderRuleError("Selected channel is disabled for new orders.")


def validate_order_channel_requirements(order_data: dict[str, Any], channel_code: str) -> None:
    table_id = order_data.get("table")
    customer = order_data.get("customer")
    address = order_data.get("address")
    scheduled_at = order_data.get("scheduled_at")

    if channel_code == OrderChannel.ChannelCode.DINE_IN:
        if not table_id:
            raise OrderRuleError("Dine-in orders require table_id.")
    else:
        if table_id:
            raise OrderRuleError("table_id is allowed only for dine-in.")

    if channel_code in {
        OrderChannel.ChannelCode.TAKEAWAY,
        OrderChannel.ChannelCode.PICKUP,
        OrderChannel.ChannelCode.PICKUP_WINDOW,
    }:
        if table_id:
            raise OrderRuleError("Takeaway and pickup orders cannot include table_id.")

    if channel_code == OrderChannel.ChannelCode.DELIVERY:
        if not customer:
            raise OrderRuleError("Delivery orders require customer.")

    if channel_code == OrderChannel.ChannelCode.PREORDER:
        if not scheduled_at:
            raise OrderRuleError("Pre-order requires scheduled_at.")
        if order_data.get("channel_for_preorder") not in {
            OrderChannel.ChannelCode.PICKUP,
            OrderChannel.ChannelCode.DELIVERY,
        }:
            raise OrderRuleError("Pre-order must target pickup or delivery.")


def _compute_service_charge(channel_config: ChannelConfig, subtotal: Decimal) -> Decimal:
    rule = channel_config.service_charge_rule
    if not rule or not rule.is_active:
        return Decimal("0.00")
    if rule.charge_type == "fixed":
        return Decimal(rule.value)
    return (subtotal * Decimal(rule.value) / Decimal("100")).quantize(Decimal("0.01"))


def build_order_channel_snapshot(
    order: PosOrder,
    channel_config: ChannelConfig,
    subtotal: Decimal,
    tax_total: Decimal,
    excise_total: Decimal,
    discount_total: Decimal,
    excise_breakdown: dict[str, str] | None = None,
) -> dict[str, Any]:
    service_charge = _compute_service_charge(channel_config, subtotal)
    grand_total = (subtotal + tax_total + excise_total + service_charge - discount_total).quantize(Decimal("0.01"))
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
            "value": str(service_charge),
            "charge_type": channel_config.service_charge_rule.charge_type if channel_config.service_charge_rule_id else None,
        },
        "excise_tax": {
            "total": str(excise_total),
            "breakdown": excise_breakdown or {},
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
            "service_charge_total": str(service_charge),
            "discount_total": str(discount_total),
            "grand_total": str(grand_total),
        },
        "order_id": str(order.id),
        "offline_created_at": order.offline_created_at.isoformat(),
    }
