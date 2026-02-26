from decimal import Decimal
from types import SimpleNamespace
import sys

import pytest
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from pos.models import PosOrder, Shift, WhatsAppMessageLog


class _DummyResponse:
    def __init__(self, status_code=200, data=None):
        self.status_code = status_code
        self._data = data or {}
        self.text = ""

    def json(self):
        return self._data


@pytest.mark.django_db(transaction=True)
@override_settings(
    WHATSAPP_ENABLED=True,
    WHATSAPP_ACCESS_TOKEN="test-token",
    WHATSAPP_PHONE_NUMBER_ID="123456",
    WHATSAPP_API_URL="https://graph.facebook.com/v19.0",
    WHATSAPP_TEMPLATE_ORDER_CREATED="order_created_tpl",
    WHATSAPP_TEMPLATE_ORDER_STATUS="order_status_tpl",
    WHATSAPP_DEFAULT_COUNTRY_CODE="966",
)
def test_create_order_sends_whatsapp_notification(pos_context, order_payload, monkeypatch):
    Shift.objects.create(
        branch=pos_context["branch"],
        device=pos_context["device"],
        user=pos_context["user"],
        opening_cash=Decimal("100.00"),
    )

    monkeypatch.setitem(
        sys.modules,
        "requests",
        SimpleNamespace(post=lambda *args, **kwargs: _DummyResponse(200, {"messages": [{"id": "wamid.001"}]})),
    )

    payload = order_payload(customer_id=str(pos_context["customer"].id))
    response = pos_context["client"].post(reverse("pos-order-list"), payload, format="json")
    assert response.status_code == 201

    order = PosOrder.objects.get(id=response.data["id"])
    log = WhatsAppMessageLog.objects.filter(order=order).order_by("-created_at").first()
    assert log is not None
    assert log.event_type == WhatsAppMessageLog.EventType.ORDER_CREATED
    assert log.status == WhatsAppMessageLog.DeliveryStatus.SENT
    assert log.provider_message_id == "wamid.001"


@pytest.mark.django_db(transaction=True)
@override_settings(
    WHATSAPP_ENABLED=True,
    WHATSAPP_ACCESS_TOKEN="test-token",
    WHATSAPP_PHONE_NUMBER_ID="123456",
    WHATSAPP_API_URL="https://graph.facebook.com/v19.0",
    WHATSAPP_TEMPLATE_ORDER_CREATED="order_created_tpl",
    WHATSAPP_TEMPLATE_ORDER_STATUS="order_status_tpl",
    WHATSAPP_DEFAULT_COUNTRY_CODE="966",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN="verify-me",
)
def test_status_update_and_webhook_update_log(pos_context, order_payload, monkeypatch):
    Shift.objects.create(
        branch=pos_context["branch"],
        device=pos_context["device"],
        user=pos_context["user"],
        opening_cash=Decimal("100.00"),
    )

    monkeypatch.setitem(
        sys.modules,
        "requests",
        SimpleNamespace(post=lambda *args, **kwargs: _DummyResponse(200, {"messages": [{"id": "wamid.002"}]})),
    )

    create_response = pos_context["client"].post(
        reverse("pos-order-list"),
        order_payload(customer_id=str(pos_context["customer"].id)),
        format="json",
    )
    assert create_response.status_code == 201
    order_id = create_response.data["id"]

    status_response = pos_context["client"].post(
        reverse("pos-order-status-update", kwargs={"pk": order_id}),
        {"status": "submitted"},
        format="json",
    )
    assert status_response.status_code == 200

    status_log = (
        WhatsAppMessageLog.objects.filter(order_id=order_id, event_type=WhatsAppMessageLog.EventType.ORDER_STATUS_CHANGED)
        .order_by("-created_at")
        .first()
    )
    assert status_log is not None
    assert status_log.status == WhatsAppMessageLog.DeliveryStatus.SENT

    verify_response = pos_context["client"].get(
        reverse("integration-whatsapp-webhook"),
        {"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "abc123"},
    )
    assert verify_response.status_code == 200

    webhook_payload = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "statuses": [
                                {
                                    "id": status_log.provider_message_id or "wamid.002",
                                    "status": "delivered",
                                    "timestamp": str(int(timezone.now().timestamp())),
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    webhook_response = pos_context["client"].post(
        reverse("integration-whatsapp-webhook"),
        webhook_payload,
        format="json",
    )
    assert webhook_response.status_code == 200
    status_log.refresh_from_db()
    assert status_log.status == WhatsAppMessageLog.DeliveryStatus.DELIVERED
