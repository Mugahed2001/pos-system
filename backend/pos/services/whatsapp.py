from __future__ import annotations

from datetime import datetime, timezone as dt_timezone
from typing import Any

from django.conf import settings
from django.utils import timezone

from pos.models import PosOrder, WhatsAppMessageLog


def _normalize_phone(raw_phone: str) -> str:
    digits = "".join(ch for ch in (raw_phone or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("00"):
        return digits[2:]
    if digits.startswith("0"):
        default_country = (getattr(settings, "WHATSAPP_DEFAULT_COUNTRY_CODE", "") or "").strip()
        if default_country:
            return f"{default_country}{digits[1:]}"
    return digits


def _is_enabled() -> bool:
    return bool(getattr(settings, "WHATSAPP_ENABLED", False))


def _api_url() -> str:
    base_url = (getattr(settings, "WHATSAPP_API_URL", "") or "").strip().rstrip("/")
    phone_number_id = (getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "") or "").strip()
    return f"{base_url}/{phone_number_id}/messages"


def _message_template_for_event(event_type: str) -> str:
    if event_type == WhatsAppMessageLog.EventType.ORDER_CREATED:
        return (getattr(settings, "WHATSAPP_TEMPLATE_ORDER_CREATED", "") or "").strip()
    if event_type == WhatsAppMessageLog.EventType.ORDER_STATUS_CHANGED:
        return (getattr(settings, "WHATSAPP_TEMPLATE_ORDER_STATUS", "") or "").strip()
    return ""


def _message_payload(order: PosOrder, phone_number: str, event_type: str, template_name: str) -> dict[str, Any]:
    language_code = (getattr(settings, "WHATSAPP_TEMPLATE_LANGUAGE", "ar") or "ar").strip()
    template: dict[str, Any] = {
        "name": template_name,
        "language": {"code": language_code},
    }
    # Meta's default "hello_world" template has no variables.
    if template_name != "hello_world":
        template["components"] = [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": str(order.order_number or order.local_id or order.id)},
                    {"type": "text", "text": order.get_status_display() if hasattr(order, "get_status_display") else order.status},
                    {"type": "text", "text": str(order.grand_total)},
                    {"type": "text", "text": event_type},
                ],
            }
        ]

    return {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "template",
        "template": template,
    }


def send_order_whatsapp_notification(order_id: str, event_type: str) -> WhatsAppMessageLog | None:
    order = (
        PosOrder.objects.select_related("customer")
        .only("id", "local_id", "order_number", "status", "grand_total", "customer_id", "customer__phone")
        .filter(id=order_id)
        .first()
    )
    if not order:
        return None

    template_name = _message_template_for_event(event_type)
    phone_number = _normalize_phone(getattr(order.customer, "phone", ""))
    log_entry = WhatsAppMessageLog.objects.create(
        order=order,
        customer=getattr(order, "customer", None),
        phone_number=phone_number,
        event_type=event_type,
        template_name=template_name,
        status=WhatsAppMessageLog.DeliveryStatus.PENDING,
    )

    if not _is_enabled():
        log_entry.status = WhatsAppMessageLog.DeliveryStatus.SKIPPED
        log_entry.error_message = "WhatsApp notifications are disabled."
        log_entry.save(update_fields=["status", "error_message", "updated_at"])
        return log_entry

    access_token = (getattr(settings, "WHATSAPP_ACCESS_TOKEN", "") or "").strip()
    phone_number_id = (getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "") or "").strip()
    api_base = (getattr(settings, "WHATSAPP_API_URL", "") or "").strip()
    if not access_token or not phone_number_id or not api_base:
        log_entry.status = WhatsAppMessageLog.DeliveryStatus.FAILED
        log_entry.error_message = "Missing WhatsApp API configuration."
        log_entry.save(update_fields=["status", "error_message", "updated_at"])
        return log_entry

    if not template_name:
        log_entry.status = WhatsAppMessageLog.DeliveryStatus.SKIPPED
        log_entry.error_message = "Missing WhatsApp template for event."
        log_entry.save(update_fields=["status", "error_message", "updated_at"])
        return log_entry

    if not phone_number:
        log_entry.status = WhatsAppMessageLog.DeliveryStatus.SKIPPED
        log_entry.error_message = "Customer phone number not found."
        log_entry.save(update_fields=["status", "error_message", "updated_at"])
        return log_entry

    try:
        import requests
    except Exception as exc:  # pragma: no cover
        log_entry.status = WhatsAppMessageLog.DeliveryStatus.FAILED
        log_entry.error_message = f"requests package is unavailable: {exc}"
        log_entry.save(update_fields=["status", "error_message", "updated_at"])
        return log_entry

    payload = _message_payload(order, phone_number, event_type, template_name)
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    response_body: dict[str, Any]
    response_code: int | None = None
    try:
        response = requests.post(_api_url(), headers=headers, json=payload, timeout=15)
        response_code = response.status_code
        try:
            response_body = response.json() if response.text else {}
        except ValueError:
            response_body = {"raw": response.text[:1000]}
    except Exception as exc:
        log_entry.status = WhatsAppMessageLog.DeliveryStatus.FAILED
        log_entry.payload = payload
        log_entry.error_message = str(exc)
        log_entry.save(update_fields=["status", "payload", "error_message", "updated_at"])
        return log_entry

    provider_message_id = ""
    messages = response_body.get("messages") if isinstance(response_body, dict) else None
    if isinstance(messages, list) and messages:
        provider_message_id = str(messages[0].get("id", "")).strip()

    log_entry.payload = payload
    log_entry.response_code = response_code
    log_entry.response_body = response_body if isinstance(response_body, dict) else {"raw": str(response_body)}
    log_entry.provider_message_id = provider_message_id
    if 200 <= (response_code or 0) < 300:
        log_entry.status = WhatsAppMessageLog.DeliveryStatus.SENT
        log_entry.sent_at = timezone.now()
        log_entry.error_message = ""
        log_entry.save(
            update_fields=[
                "payload",
                "response_code",
                "response_body",
                "provider_message_id",
                "status",
                "sent_at",
                "error_message",
                "updated_at",
            ]
        )
        return log_entry

    log_entry.status = WhatsAppMessageLog.DeliveryStatus.FAILED
    log_entry.error_message = str(response_body)[:1000]
    log_entry.save(
        update_fields=[
            "payload",
            "response_code",
            "response_body",
            "provider_message_id",
            "status",
            "error_message",
            "updated_at",
        ]
    )
    return log_entry


def sync_whatsapp_delivery_status(payload: dict[str, Any]) -> int:
    if not isinstance(payload, dict):
        return 0

    updates = 0
    entries = payload.get("entry") or []
    for entry in entries:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            statuses = value.get("statuses") or []
            for item in statuses:
                message_id = str(item.get("id") or "").strip()
                status = str(item.get("status") or "").strip().lower()
                if not message_id or not status:
                    continue
                log = WhatsAppMessageLog.objects.filter(provider_message_id=message_id).first()
                if not log:
                    continue
                mapped = {
                    "sent": WhatsAppMessageLog.DeliveryStatus.SENT,
                    "delivered": WhatsAppMessageLog.DeliveryStatus.DELIVERED,
                    "read": WhatsAppMessageLog.DeliveryStatus.READ,
                    "failed": WhatsAppMessageLog.DeliveryStatus.FAILED,
                }.get(status)
                if not mapped:
                    continue

                sent_at = log.sent_at
                timestamp_raw = item.get("timestamp")
                if timestamp_raw:
                    try:
                        sent_at = datetime.fromtimestamp(int(timestamp_raw), tz=dt_timezone.utc)
                    except Exception:
                        sent_at = sent_at or timezone.now()
                elif not sent_at:
                    sent_at = timezone.now()

                error_items = item.get("errors") or []
                error_message = ""
                if isinstance(error_items, list) and error_items:
                    error_message = str(error_items[0].get("title") or error_items[0].get("message") or "")[:1000]

                log.status = mapped
                log.sent_at = sent_at
                if mapped == WhatsAppMessageLog.DeliveryStatus.FAILED and error_message:
                    log.error_message = error_message
                existing_response = log.response_body if isinstance(log.response_body, dict) else {}
                existing_response["webhook_status"] = item
                log.response_body = existing_response
                log.save(update_fields=["status", "sent_at", "error_message", "response_body", "updated_at"])
                updates += 1
    return updates
