from decimal import Decimal
from typing import Iterable

from django.db import transaction

from pos.models import ChannelConfig, MenuItem, OrderChannelSnapshot, PosOrder, PosOrderItem
from pos.services.excise import compute_excise_amount
from pos.services.order_rules import build_order_channel_snapshot


def _sum_decimal(values: Iterable[Decimal]) -> Decimal:
    total = Decimal("0.00")
    for value in values:
        total += value
    return total


def compute_totals_from_items(
    items: Iterable[PosOrderItem],
    tax_rate_percent: Decimal,
) -> tuple[Decimal, Decimal, Decimal, Decimal, dict[str, str]]:
    subtotal = Decimal("0.00")
    tax_total = Decimal("0.00")
    excise_total = Decimal("0.00")
    discount_total = Decimal("0.00")
    excise_breakdown: dict[str, Decimal] = {}
    for item in items:
        line_subtotal = item.quantity * item.unit_price_snapshot
        subtotal += line_subtotal
        line_excise = item.excise_amount_snapshot or compute_excise_amount(line_subtotal, item.menu_item.excise_category)
        excise_total += line_excise
        line_tax = ((line_subtotal + line_excise) * tax_rate_percent / Decimal("100")).quantize(Decimal("0.01"))
        tax_total += line_tax
        category = item.menu_item.excise_category or ""
        if category and line_excise > 0:
            excise_breakdown[category] = excise_breakdown.get(category, Decimal("0.00")) + line_excise
        discount_total += item.discount_amount_snapshot or Decimal("0.00")
    return (
        subtotal,
        tax_total,
        excise_total,
        discount_total,
        {key: str(value.quantize(Decimal("0.01"))) for key, value in excise_breakdown.items()},
    )


@transaction.atomic
def replace_order_items(order: PosOrder, items_payload: list[dict]) -> list[PosOrderItem]:
    PosOrderItem.objects.filter(order=order).delete()
    channel_config = order.channel_config or ChannelConfig.objects.select_related("tax_profile").prefetch_related("tax_profile__rules").filter(
        branch=order.branch,
        channel=order.channel,
    ).first()
    tax_rate_percent = Decimal("0.00")
    if channel_config:
        tax_rate_percent = sum((rule.rate_percent for rule in channel_config.tax_profile.rules.all()), Decimal("0.00"))
    items = []
    for item in items_payload:
        menu_item = MenuItem.objects.get(id=item["menu_item_id"])
        line_subtotal = item["quantity"] * item["unit_price_snapshot"]
        line_excise = compute_excise_amount(line_subtotal, menu_item.excise_category)
        line_tax = ((line_subtotal + line_excise) * tax_rate_percent / Decimal("100")).quantize(Decimal("0.01"))
        items.append(
            PosOrderItem(
                order=order,
                menu_item=menu_item,
                quantity=item["quantity"],
                unit_price_snapshot=item["unit_price_snapshot"],
                tax_amount_snapshot=line_tax,
                excise_amount_snapshot=line_excise,
                discount_amount_snapshot=item.get("discount_amount_snapshot") or Decimal("0.00"),
                modifiers_snapshot_json=item.get("modifiers_snapshot_json") or [],
                notes=item.get("notes", ""),
            )
        )
    PosOrderItem.objects.bulk_create(items)
    return items


@transaction.atomic
def refresh_order_snapshot(order: PosOrder) -> None:
    channel_config = order.channel_config or ChannelConfig.objects.select_related("tax_profile").prefetch_related("tax_profile__rules").filter(
        branch=order.branch,
        channel=order.channel,
    ).first()
    if not channel_config:
        return

    items = list(order.items.select_related("menu_item").all())
    tax_rate_percent = sum((rule.rate_percent for rule in channel_config.tax_profile.rules.all()), Decimal("0.00"))
    subtotal, tax_total, excise_total, discount_total, excise_breakdown = compute_totals_from_items(items, tax_rate_percent)
    snapshot = build_order_channel_snapshot(
        order=order,
        channel_config=channel_config,
        subtotal=subtotal,
        tax_total=tax_total,
        excise_total=excise_total,
        discount_total=discount_total,
        excise_breakdown=excise_breakdown,
    )
    OrderChannelSnapshot.objects.update_or_create(
        order=order,
        defaults={
            "payload": snapshot,
            "config_version": channel_config.config_version,
        },
    )
    order.subtotal = Decimal(snapshot["totals"]["subtotal"])
    order.tax_total = Decimal(snapshot["totals"]["tax_total"])
    order.excise_total = Decimal(snapshot["totals"]["excise_total"])
    order.service_charge_total = Decimal(snapshot["totals"]["service_charge_total"])
    order.discount_total = Decimal(snapshot["totals"]["discount_total"])
    order.grand_total = Decimal(snapshot["totals"]["grand_total"])
    order.channel_config = channel_config
    order.save(
        update_fields=[
            "subtotal",
            "tax_total",
            "excise_total",
            "service_charge_total",
            "discount_total",
            "grand_total",
            "channel_config",
            "updated_at",
        ]
    )
