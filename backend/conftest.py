from decimal import Decimal
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from pos.models import (
    Address,
    Branch,
    ChannelConfig,
    Company,
    Customer,
    Device,
    DiningTable,
    Floor,
    ManagerOverride,
    MenuCategory,
    MenuItem,
    OrderChannel,
    PriceList,
    PriceListItem,
    ServiceChargeRule,
    TaxProfile,
    TaxRule,
)


@pytest.fixture
def pos_context(db):
    user_model = get_user_model()
    user = user_model.objects.create_user(username="cashier", password="cashier123")
    token = Token.objects.create(user=user)

    company = Company.objects.create(name="Demo Foods", code="DEMO")
    branch = Branch.objects.create(company=company, name="Main Branch", code="BR001")
    device = Device.objects.create(
        device_id="POS-DEVICE-001",
        token="device-demo-token",
        branch=branch,
        display_name="Front Counter",
    )
    ManagerOverride.objects.create(user=user, pin="1111", is_active=True)

    channel_dinein = OrderChannel.objects.create(
        code=OrderChannel.ChannelCode.DINE_IN,
        display_name="Dine-in",
    )
    price_list = PriceList.objects.create(branch=branch, name="Default", is_default=True)
    tax_profile = TaxProfile.objects.create(branch=branch, name="VAT")
    TaxRule.objects.create(tax_profile=tax_profile, code="VAT15", rate_percent=Decimal("15.00"))
    service_rule = ServiceChargeRule.objects.create(
        branch=branch,
        name="Service 10%",
        charge_type=ServiceChargeRule.ChargeType.PERCENTAGE,
        value=Decimal("10.00"),
    )
    category = MenuCategory.objects.create(branch=branch, name="Main", sort_order=1)
    item = MenuItem.objects.create(
        branch=branch,
        category=category,
        code="ITEM-1",
        name="Burger",
        base_price=Decimal("25.00"),
    )
    PriceListItem.objects.create(price_list=price_list, menu_item=item, price=Decimal("25.00"))
    ChannelConfig.objects.create(
        branch=branch,
        channel=channel_dinein,
        price_list=price_list,
        tax_profile=tax_profile,
        service_charge_rule=service_rule,
        is_enabled=True,
        allow_new_orders=True,
        config_version=3,
    )

    floor = Floor.objects.create(branch=branch, name="Hall", sort_order=1)
    table = DiningTable.objects.create(branch=branch, floor=floor, code="T1", seats_count=4)
    customer = Customer.objects.create(branch=branch, name="John", phone="0550001111")
    address = Address.objects.create(customer=customer, line1="Main Street")

    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Token {token.key}",
        HTTP_X_DEVICE_TOKEN=device.token,
    )

    return {
        "user": user,
        "token": token,
        "company": company,
        "branch": branch,
        "device": device,
        "channel": channel_dinein,
        "price_list": price_list,
        "tax_profile": tax_profile,
        "service_rule": service_rule,
        "category": category,
        "item": item,
        "floor": floor,
        "table": table,
        "customer": customer,
        "address": address,
        "client": client,
    }


@pytest.fixture
def order_payload(pos_context):
    def build(**overrides):
        payload = {
            "local_id": f"local-{uuid4()}",
            "idempotency_key": f"idem-{uuid4()}",
            "branch_id": str(pos_context["branch"].id),
            "device_id": pos_context["device"].device_id,
            "channel": "dine_in",
            "offline_created_at": timezone.now().isoformat(),
            "table_id": str(pos_context["table"].id),
            "items": [
                {
                    "menu_item_id": str(pos_context["item"].id),
                    "quantity": "1.000",
                    "unit_price_snapshot": "25.00",
                    "tax_amount_snapshot": "3.75",
                    "discount_amount_snapshot": "0.00",
                    "modifiers_snapshot_json": [],
                }
            ],
        }
        payload.update(overrides)
        return payload

    return build
