import pytest
from django.urls import reverse
from django.utils import timezone

from pos.models import (
    ChannelConfig,
    DeliveryProvider,
    ExternalOrder,
    ExternalOrderEvent,
    ExternalOutboundTask,
    MenuCategory,
    MenuItem,
    OrderChannel,
    PosOrder,
    PriceList,
    PriceListItem,
    ProviderItemMapping,
    ProviderStoreMapping,
    TaxProfile,
)


def setup_provider(branch, include_item_mapping=True):
    channel = OrderChannel.objects.create(code=OrderChannel.ChannelCode.DELIVERY, display_name=" Ê’Ì·")
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
    category = MenuCategory.objects.create(branch=branch, name="√’‰«›", sort_order=1)
    menu_item = MenuItem.objects.create(
        branch=branch,
        category=category,
        code="ITEM-1",
        name="ÊÃ»… «Œ »«—",
        base_price="12.50",
    )
    PriceListItem.objects.create(price_list=price_list, menu_item=menu_item, price="12.50")

    provider = DeliveryProvider.objects.create(
        code="provider-x",
        name="„“Êœ  Ã—Ì»Ì",
        auth_type=DeliveryProvider.AuthType.API_KEY,
        secrets_json={"api_key": "secret", "api_key_header": "X-Provider-Api-Key"},
    )
    ProviderStoreMapping.objects.create(provider=provider, provider_store_id="STORE-1", branch=branch)
    if include_item_mapping:
        ProviderItemMapping.objects.create(provider=provider, provider_item_id="ITEM-1", menu_item=menu_item)

    return provider


@pytest.mark.django_db
def test_webhook_idempotency(api_client, branch):
    provider = setup_provider(branch)
    url = reverse("integration-webhook-orders", kwargs={"provider_code": provider.code})
    payload = {
        "provider_order_id": "EXT-100",
        "provider_store_id": "STORE-1",
        "status": "RECEIVED",
        "placed_at": timezone.now().isoformat(),
        "customer": {"name": "Test", "phone": "050", "notes": ""},
        "items": [
            {
                "provider_item_id": "ITEM-1",
                "name": "ÊÃ»… «Œ »«—",
                "quantity": 1,
                "unit_price": "12.50",
            }
        ],
        "totals": {"subtotal": "12.50", "tax": "0", "service": "0", "discount": "0", "grand_total": "12.50"},
        "notes": "",
    }
    headers = {"HTTP_X_PROVIDER_API_KEY": "secret"}
    response_a = api_client.post(url, payload, format="json", **headers)
    response_b = api_client.post(url, payload, format="json", **headers)

    assert response_a.status_code == 201
    assert response_b.status_code == 201
    assert ExternalOrder.objects.count() == 1
    assert PosOrder.objects.count() == 1


@pytest.mark.django_db
def test_webhook_mapping_failure_logs_event(api_client, branch):
    provider = setup_provider(branch, include_item_mapping=False)
    url = reverse("integration-webhook-orders", kwargs={"provider_code": provider.code})
    payload = {
        "provider_order_id": "EXT-200",
        "provider_store_id": "STORE-1",
        "status": "RECEIVED",
        "items": [
            {
                "provider_item_id": "MISSING",
                "name": "Unknown",
                "quantity": 1,
                "unit_price": "10.00",
            }
        ],
        "totals": {"subtotal": "10.00", "tax": "0", "service": "0", "discount": "0", "grand_total": "10.00"},
    }
    headers = {"HTTP_X_PROVIDER_API_KEY": "secret"}
    response = api_client.post(url, payload, format="json", **headers)

    assert response.status_code == 400
    assert ExternalOrder.objects.count() == 1
    assert PosOrder.objects.count() == 0
    assert ExternalOrderEvent.objects.filter(event_type="failed").exists()


@pytest.mark.django_db
def test_mark_ready_failure_enqueues_task(authed_client, branch, device, user):
    provider = DeliveryProvider.objects.create(code="provider-y", name="„“Êœ »œÊ‰ „”«—")
    channel = OrderChannel.objects.create(code=OrderChannel.ChannelCode.DELIVERY, display_name=" Ê’Ì·")
    order = PosOrder.objects.create(
        local_id="local-1",
        idempotency_key="idem-1",
        branch=branch,
        device=device,
        user=user,
        channel=channel,
        offline_created_at=timezone.now(),
    )
    external = ExternalOrder.objects.create(
        provider=provider,
        provider_order_id="EXT-300",
        branch=branch,
        status_external="RECEIVED",
        mapped_order=order,
    )

    url = reverse("external-order-mark-ready", kwargs={"external_order_id": external.id})
    response = authed_client.post(url, format="json")

    assert response.status_code == 400
    assert ExternalOutboundTask.objects.count() == 1
