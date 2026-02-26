from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.authtoken.models import Token

from pos.models import Shift


@pytest.mark.django_db
def test_open_shift_requires_opening_cash_when_policy_enabled(pos_context):
    client = pos_context["client"]
    branch = pos_context["branch"]
    branch.requires_opening_cash = True
    branch.save(update_fields=["requires_opening_cash"])

    response = client.post(
        reverse("pos-shift-open"),
        {"branch_id": str(branch.id), "device_id": pos_context["device"].device_id},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_open_shift_reuses_existing_active_shift_when_exists(pos_context):
    client = pos_context["client"]
    branch = pos_context["branch"]
    device = pos_context["device"]
    user = pos_context["user"]

    existing = Shift.objects.create(
        branch=branch,
        device=device,
        user=user,
        opening_cash=Decimal("100.00"),
    )

    response = client.post(
        reverse("pos-shift-open"),
        {"branch_id": str(branch.id), "device_id": device.device_id, "opening_cash": "50.00"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["id"] == str(existing.id)
    assert response.data.get("reused") is True


@pytest.mark.django_db
def test_device_checks_create_and_list(pos_context):
    client = pos_context["client"]
    branch = pos_context["branch"]
    device = pos_context["device"]

    open_shift = client.post(
        reverse("pos-shift-open"),
        {"branch_id": str(branch.id), "device_id": device.device_id, "opening_cash": "10.00"},
        format="json",
    )
    assert open_shift.status_code in {200, 201}
    shift_id = open_shift.data["id"]

    create = client.post(
        reverse("pos-device-checks"),
        {
            "branch_id": str(branch.id),
            "device_id": device.device_id,
            "shift_id": shift_id,
            "checks": [
                {"type": "network", "status": "pass", "details": {"latency_ms": 42}},
                {"type": "receipt_printer", "status": "warn", "details": {"message": "slow"}},
            ],
        },
        format="json",
    )
    assert create.status_code == 201

    listed = client.get(
        reverse("pos-device-checks"),
        {"branch_id": str(branch.id), "device_id": device.device_id},
    )
    assert listed.status_code == 200
    assert len(listed.data) == 1


@pytest.mark.django_db
def test_sync_status_endpoint(pos_context):
    client = pos_context["client"]
    device = pos_context["device"]
    response = client.get(reverse("pos-sync-status"), {"device_id": device.device_id})
    assert response.status_code == 200
    assert "device_id" in response.data
    assert "pending_idempotency" in response.data
    assert "mapped_orders" in response.data


@pytest.mark.django_db
def test_close_shift_sets_closed_status_and_variance(pos_context):
    client = pos_context["client"]
    branch = pos_context["branch"]
    device = pos_context["device"]

    opened = client.post(
        reverse("pos-shift-open"),
        {"branch_id": str(branch.id), "device_id": device.device_id, "opening_cash": "120.00"},
        format="json",
    )
    assert opened.status_code in {200, 201}
    shift_id = opened.data["id"]

    closed = client.post(
        reverse("pos-shift-close", kwargs={"pk": shift_id}),
        {"closing_cash": "150.00"},
        format="json",
    )
    assert closed.status_code == 200
    assert closed.data["status"] == "closed"
    assert closed.data["variance"] == "30.00"


@pytest.mark.django_db
def test_close_shift_requires_closing_cash(pos_context):
    client = pos_context["client"]
    branch = pos_context["branch"]
    device = pos_context["device"]

    opened = client.post(
        reverse("pos-shift-open"),
        {"branch_id": str(branch.id), "device_id": device.device_id, "opening_cash": "80.00"},
        format="json",
    )
    shift_id = opened.data["id"]

    closed = client.post(reverse("pos-shift-close", kwargs={"pk": shift_id}), {}, format="json")
    assert closed.status_code == 400


@pytest.mark.django_db
def test_cashier_cannot_close_other_user_shift(pos_context):
    client = pos_context["client"]
    branch = pos_context["branch"]
    device = pos_context["device"]

    opened = client.post(
        reverse("pos-shift-open"),
        {"branch_id": str(branch.id), "device_id": device.device_id, "opening_cash": "50.00"},
        format="json",
    )
    assert opened.status_code in {200, 201}

    user_model = get_user_model()
    other_user = user_model.objects.create_user(username="cashier2", password="cashier123")
    other_token = Token.objects.create(user=other_user)

    other_client = client.__class__()
    other_client.credentials(
        HTTP_AUTHORIZATION=f"Token {other_token.key}",
        HTTP_X_DEVICE_TOKEN=device.token,
    )

    denied = other_client.post(
        reverse("pos-shift-close", kwargs={"pk": opened.data["id"]}),
        {"closing_cash": "60.00"},
        format="json",
    )
    assert denied.status_code == 403
