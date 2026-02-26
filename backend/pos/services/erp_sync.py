from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from pos.models import Branch, ErpCoupon, ErpOffer


def _parse_datetime(value: Any):
    if isinstance(value, datetime):
        return value if timezone.is_aware(value) else timezone.make_aware(value)
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed if timezone.is_aware(parsed) else timezone.make_aware(parsed)
    except Exception:
        return None


@transaction.atomic
def sync_erp_promotions(
    *,
    branch: Branch,
    offers: list[dict[str, Any]],
    coupons: list[dict[str, Any]],
    purge_missing: bool = False,
) -> dict[str, int]:
    now = timezone.now()
    offers_seen: set[str] = set()
    coupons_seen: set[str] = set()
    offers_created = 0
    offers_updated = 0
    coupons_created = 0
    coupons_updated = 0

    for item in offers:
        external_id = str(item["external_id"]).strip()
        offers_seen.add(external_id)
        _, created = ErpOffer.objects.update_or_create(
            branch=branch,
            external_id=external_id,
            defaults={
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                "discount_type": item.get("discount_type", ErpOffer.DiscountType.PERCENT),
                "discount_value": item.get("discount_value", "0"),
                "min_order_amount": item.get("min_order_amount", "0"),
                "max_discount_amount": item.get("max_discount_amount"),
                "starts_at": _parse_datetime(item.get("starts_at")),
                "ends_at": _parse_datetime(item.get("ends_at")),
                "is_active": bool(item.get("is_active", True)),
                "stackable": bool(item.get("stackable", False)),
                "applies_to": item.get("applies_to") or {},
                "metadata": item.get("metadata") or {},
                "raw_payload": item,
                "last_synced_at": now,
            },
        )
        if created:
            offers_created += 1
        else:
            offers_updated += 1

    for item in coupons:
        external_id = str(item["external_id"]).strip()
        coupons_seen.add(external_id)
        _, created = ErpCoupon.objects.update_or_create(
            branch=branch,
            external_id=external_id,
            defaults={
                "code": str(item.get("code", "")).strip(),
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                "discount_type": item.get("discount_type", ErpCoupon.DiscountType.PERCENT),
                "discount_value": item.get("discount_value", "0"),
                "min_order_amount": item.get("min_order_amount", "0"),
                "max_discount_amount": item.get("max_discount_amount"),
                "usage_limit": item.get("usage_limit", 0) or 0,
                "per_customer_limit": item.get("per_customer_limit", 0) or 0,
                "starts_at": _parse_datetime(item.get("starts_at")),
                "ends_at": _parse_datetime(item.get("ends_at")),
                "is_active": bool(item.get("is_active", True)),
                "metadata": item.get("metadata") or {},
                "raw_payload": item,
                "last_synced_at": now,
            },
        )
        if created:
            coupons_created += 1
        else:
            coupons_updated += 1

    if purge_missing:
        if offers_seen:
            ErpOffer.objects.filter(branch=branch).exclude(external_id__in=offers_seen).update(is_active=False, updated_at=now)
        if coupons_seen:
            ErpCoupon.objects.filter(branch=branch).exclude(external_id__in=coupons_seen).update(is_active=False, updated_at=now)

    return {
        "offers_created": offers_created,
        "offers_updated": offers_updated,
        "coupons_created": coupons_created,
        "coupons_updated": coupons_updated,
    }


def get_active_promotions(branch: Branch, *, at_time=None) -> tuple[list[ErpOffer], list[ErpCoupon]]:
    now = at_time or timezone.now()
    active_window = (Q(starts_at__isnull=True) | Q(starts_at__lte=now)) & (Q(ends_at__isnull=True) | Q(ends_at__gte=now))

    offers = list(
        ErpOffer.objects.filter(branch=branch, is_active=True)
        .filter(active_window)
        .order_by("title")
    )
    coupons = list(
        ErpCoupon.objects.filter(branch=branch, is_active=True)
        .filter(active_window)
        .order_by("code")
    )
    return offers, coupons
