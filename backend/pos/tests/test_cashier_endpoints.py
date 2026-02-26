from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from pos.models import PosOrder, Refund, Shift


@pytest.mark.django_db
def test_hold_resume_order(pos_context, order_payload):
    client = pos_context["client"]
    create_url = reverse("pos-order-list")
    created = client.post(create_url, order_payload(), format="json")
    assert created.status_code == 201
    order_id = created.data["id"]

    hold_url = reverse("pos-order-hold", kwargs={"pk": order_id})
    held = client.post(hold_url, format="json")
    assert held.status_code == 200
    assert held.data["is_held"] is True

    resume_url = reverse("pos-order-resume", kwargs={"pk": order_id})
    resumed = client.post(resume_url, format="json")
    assert resumed.status_code == 200
    assert resumed.data["is_held"] is False


@pytest.mark.django_db
def test_attach_customer(pos_context, order_payload):
    client = pos_context["client"]
    create_url = reverse("pos-order-list")
    created = client.post(create_url, order_payload(), format="json")
    order_id = created.data["id"]

    attach_url = reverse("pos-order-attach-customer", kwargs={"pk": order_id})
    response = client.post(
        attach_url,
        {"customer_id": str(pos_context["customer"].id)},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["customer"] == str(pos_context["customer"].id)


@pytest.mark.django_db
def test_update_order_items_recalculates_totals(pos_context, order_payload):
    client = pos_context["client"]
    create_url = reverse("pos-order-list")
    created = client.post(create_url, order_payload(), format="json")
    order_id = created.data["id"]

    patch_url = reverse("pos-order-detail", kwargs={"pk": order_id})
    response = client.patch(
        patch_url,
        {
            "items": [
                {
                    "menu_item_id": str(pos_context["item"].id),
                    "quantity": "2.000",
                    "unit_price_snapshot": "25.00",
                    "tax_amount_snapshot": "7.50",
                    "discount_amount_snapshot": "0.00",
                    "modifiers_snapshot_json": [],
                }
            ]
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["subtotal"] == "50.00"


@pytest.mark.django_db
def test_excise_tax_applies_to_excisable_items(pos_context, order_payload):
    client = pos_context["client"]
    pos_context["item"].excise_category = "carbonated_drinks"
    pos_context["item"].save(update_fields=["excise_category", "updated_at"])

    create_url = reverse("pos-order-list")
    created = client.post(
        create_url,
        order_payload(
            items=[
                {
                    "menu_item_id": str(pos_context["item"].id),
                    "quantity": "1.000",
                    "unit_price_snapshot": "25.00",
                    "tax_amount_snapshot": "0.00",
                    "discount_amount_snapshot": "0.00",
                    "modifiers_snapshot_json": [],
                }
            ]
        ),
        format="json",
    )
    assert created.status_code == 201

    order = PosOrder.objects.get(id=created.data["id"])
    assert str(order.excise_total) == "12.50"
    assert str(order.tax_total) == "5.63"
    assert str(order.service_charge_total) == "2.50"
    assert str(order.grand_total) == "45.63"


@pytest.mark.django_db
def test_cannot_create_new_dine_in_order_on_table_with_unpaid_order(pos_context, order_payload):
    client = pos_context["client"]
    create_url = reverse("pos-order-list")

    first = client.post(create_url, order_payload(), format="json")
    assert first.status_code == 201

    second = client.post(
        create_url,
        order_payload(local_id="new-local", idempotency_key="new-idem"),
        format="json",
    )
    assert second.status_code == 400
    assert "unpaid order" in str(second.data).lower()


@pytest.mark.django_db
def test_payments_list_endpoint(pos_context, order_payload):
    client = pos_context["client"]
    create_url = reverse("pos-order-list")
    created = client.post(create_url, order_payload(), format="json")
    order_id = created.data["id"]

    payments_url = reverse("pos-order-payments", kwargs={"pk": order_id})
    created_payment = client.post(
        payments_url,
        {"idempotency_key": "idem-1", "method": "cash", "amount": "25.00"},
        format="json",
    )
    assert created_payment.status_code == 201

    listed = client.get(payments_url, format="json")
    assert listed.status_code == 200
    assert len(listed.data) == 1


@pytest.mark.django_db
def test_partial_refund_by_amount_creates_refund_record(pos_context, order_payload):
    client = pos_context["client"]
    created = client.post(reverse("pos-order-list"), order_payload(), format="json")
    assert created.status_code == 201
    order_id = created.data["id"]

    payments_url = reverse("pos-order-payments", kwargs={"pk": order_id})
    paid = client.post(
        payments_url,
        {"idempotency_key": "pay-1", "method": "cash", "amount": "10.00"},
        format="json",
    )
    assert paid.status_code == 201

    refunds_url = reverse("pos-order-refunds", kwargs={"pk": order_id})
    refunded = client.post(
        refunds_url,
        {
            "idempotency_key": "refund-1",
            "refund_type": "partial",
            "method": "cash",
            "amount": "5.00",
            "reason": "Customer requested partial return",
            "manager_pin": "1111",
        },
        format="json",
    )
    assert refunded.status_code == 201
    assert refunded.data["amount"] == "5.00"
    assert Refund.objects.filter(order_id=order_id).count() == 1


@pytest.mark.django_db
def test_full_refund_marks_order_refunded(pos_context, order_payload):
    client = pos_context["client"]
    created = client.post(reverse("pos-order-list"), order_payload(), format="json")
    assert created.status_code == 201
    order_id = created.data["id"]

    order = PosOrder.objects.get(id=order_id)
    payments_url = reverse("pos-order-payments", kwargs={"pk": order_id})
    paid = client.post(
        payments_url,
        {"idempotency_key": "pay-full-1", "method": "cash", "amount": str(order.grand_total)},
        format="json",
    )
    assert paid.status_code == 201

    refunded = client.post(
        reverse("pos-order-refund", kwargs={"pk": order_id}),
        {
            "idempotency_key": "refund-full-1",
            "reason": "Full return",
            "manager_pin": "1111",
        },
        format="json",
    )
    assert refunded.status_code == 200
    order.refresh_from_db()
    assert order.status == PosOrder.OrderStatus.REFUNDED


@pytest.mark.django_db
def test_print_receipt_creates_job(pos_context, order_payload):
    client = pos_context["client"]
    create_url = reverse("pos-order-list")
    created = client.post(create_url, order_payload(), format="json")
    order_id = created.data["id"]

    print_url = reverse("pos-print-receipt")
    response = client.post(print_url, {"order_id": order_id}, format="json")
    assert response.status_code == 201
    assert response.data["job_type"] == "receipt"


@pytest.mark.django_db
def test_cash_movement_requires_open_shift_and_staff(pos_context):
    client = pos_context["client"]
    user = pos_context["user"]
    user.is_staff = True
    user.save(update_fields=["is_staff"])

    shift = Shift.objects.create(
        branch=pos_context["branch"],
        device=pos_context["device"],
        user=user,
        opening_cash=Decimal("100.00"),
        opened_at=timezone.now(),
    )

    response = client.post(
        reverse("pos-cash-movement"),
        {"shift_id": str(shift.id), "movement_type": "paid_in", "amount": "50.00", "reason": "نقدية إضافية"},
        format="json",
    )
    assert response.status_code == 201

    listed = client.get(reverse("pos-cash-movement"), {"branch_id": str(pos_context["branch"].id)})
    assert listed.status_code == 200
    assert len(listed.data) == 1
