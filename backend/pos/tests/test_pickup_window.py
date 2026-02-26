import pytest
from django.urls import reverse
from django.utils import timezone

from pos.models import ChannelConfig, Customer, OrderChannel, PosOrder, PriceList, TaxProfile
from pos.services.order_numbers import get_next_order_number


def setup_pickup_channel(branch):
    channel = OrderChannel.objects.create(code=OrderChannel.ChannelCode.PICKUP_WINDOW, display_name="‘»«ﬂ «·«” ·«„")
    price_list = PriceList.objects.create(branch=branch, name="√”«”Ì…", is_default=True)
    tax_profile = TaxProfile.objects.create(branch=branch, name="÷—Ì»…")
    ChannelConfig.objects.create(
        branch=branch,
        channel=channel,
        price_list=price_list,
        tax_profile=tax_profile,
        is_enabled=True,
        allow_new_orders=True,
        config_version=1,
    )
    return channel


def create_pickup_order(branch, device, user, channel, customer, pickup_code, status):
    return PosOrder.objects.create(
        local_id=f"local-{pickup_code}",
        idempotency_key=f"idem-{pickup_code}",
        branch=branch,
        device=device,
        user=user,
        channel=channel,
        customer=customer,
        order_number=get_next_order_number(branch),
        fulfillment_mode=PosOrder.FulfillmentMode.WINDOW,
        pickup_window_status=status,
        pickup_code=pickup_code,
        offline_created_at=timezone.now(),
    )


@pytest.mark.django_db
def test_pickup_window_search_by_number_phone_code(authed_client, branch, device, user):
    channel = setup_pickup_channel(branch)
    customer = Customer.objects.create(branch=branch, name="⁄„Ì·", phone="0551111111")
    order = create_pickup_order(
        branch=branch,
        device=device,
        user=user,
        channel=channel,
        customer=customer,
        pickup_code="1234",
        status=PosOrder.PickupWindowStatus.PENDING,
    )

    url = reverse("pos-pickup-window-orders")
    response_number = authed_client.get(url, {"branch_id": str(branch.id), "q": str(order.order_number)})
    response_phone = authed_client.get(url, {"branch_id": str(branch.id), "q": "0551111111"})
    response_code = authed_client.get(url, {"branch_id": str(branch.id), "q": "1234"})

    assert response_number.status_code == 200
    assert response_phone.status_code == 200
    assert response_code.status_code == 200
    assert any(item["id"] == str(order.id) for item in response_number.data)
    assert any(item["id"] == str(order.id) for item in response_phone.data)
    assert any(item["id"] == str(order.id) for item in response_code.data)


@pytest.mark.django_db
def test_pickup_window_status_transitions(authed_client, branch, device, user):
    channel = setup_pickup_channel(branch)
    customer = Customer.objects.create(branch=branch, name="⁄„Ì·", phone="0552222222")
    order = create_pickup_order(
        branch=branch,
        device=device,
        user=user,
        channel=channel,
        customer=customer,
        pickup_code="5678",
        status=PosOrder.PickupWindowStatus.PENDING,
    )

    arrived_url = reverse("pos-pickup-window-mark-arrived", kwargs={"pk": order.id})
    ready_url = reverse("pos-pickup-window-mark-ready", kwargs={"pk": order.id})
    handed_url = reverse("pos-pickup-window-mark-handed-over", kwargs={"pk": order.id})

    response_arrived = authed_client.post(arrived_url, format="json")
    assert response_arrived.status_code == 200
    assert response_arrived.data["pickup_window_status"] == "arrived"
    assert response_arrived.data["arrival_at"]

    response_ready = authed_client.post(ready_url, format="json")
    assert response_ready.status_code == 200
    assert response_ready.data["pickup_window_status"] == "ready"
    assert response_ready.data["ready_at"]

    response_handed = authed_client.post(handed_url, format="json")
    assert response_handed.status_code == 200
    assert response_handed.data["pickup_window_status"] == "handed_over"
    assert response_handed.data["handed_over_at"]
