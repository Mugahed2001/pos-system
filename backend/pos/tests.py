from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from pos.models import (
    Address,
    Branch,
    ChannelConfig,
    Company,
    ConfigVersion,
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
    Shift,
    TaxProfile,
    TaxRule,
)


class PosApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="cashier", password="cashier123")
        self.token = Token.objects.create(user=self.user)

        self.company = Company.objects.create(name="Demo Foods", code="DEMO")
        self.branch = Branch.objects.create(company=self.company, name="Main Branch", code="BR001")
        self.device = Device.objects.create(
            device_id="POS-01",
            token="dev_token_1",
            branch=self.branch,
            display_name="Front Counter",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
            HTTP_X_DEVICE_TOKEN=self.device.token,
        )

        self.channel_dinein = OrderChannel.objects.create(
            code=OrderChannel.ChannelCode.DINE_IN,
            display_name="Dine-in",
        )
        self.channel_delivery = OrderChannel.objects.create(
            code=OrderChannel.ChannelCode.DELIVERY,
            display_name="Delivery",
        )

        self.price_list = PriceList.objects.create(branch=self.branch, name="Default", is_default=True)
        self.tax_profile = TaxProfile.objects.create(branch=self.branch, name="VAT")
        TaxRule.objects.create(tax_profile=self.tax_profile, code="VAT15", rate_percent=Decimal("15.00"))
        self.service_rule = ServiceChargeRule.objects.create(
            branch=self.branch,
            name="Service 10%",
            charge_type=ServiceChargeRule.ChargeType.PERCENTAGE,
            value=Decimal("10.00"),
        )
        self.category = MenuCategory.objects.create(branch=self.branch, name="Main", sort_order=1)
        self.item = MenuItem.objects.create(
            branch=self.branch,
            category=self.category,
            code="ITEM-1",
            name="Burger",
            base_price=Decimal("25.00"),
        )
        PriceListItem.objects.create(price_list=self.price_list, menu_item=self.item, price=Decimal("25.00"))

        self.config_dinein = ChannelConfig.objects.create(
            branch=self.branch,
            channel=self.channel_dinein,
            price_list=self.price_list,
            tax_profile=self.tax_profile,
            service_charge_rule=self.service_rule,
            is_enabled=True,
            allow_new_orders=True,
            config_version=5,
        )
        self.config_delivery = ChannelConfig.objects.create(
            branch=self.branch,
            channel=self.channel_delivery,
            price_list=self.price_list,
            tax_profile=self.tax_profile,
            service_charge_rule=self.service_rule,
            is_enabled=True,
            allow_new_orders=True,
            config_version=5,
        )
        ConfigVersion.objects.create(branch=self.branch, version=5)
        ManagerOverride.objects.create(user=self.user, pin="1111", is_active=True)
        self.floor = Floor.objects.create(branch=self.branch, name="Hall", sort_order=1)
        self.table = DiningTable.objects.create(
            branch=self.branch,
            floor=self.floor,
            code="T1",
            seats_count=4,
        )
        self.customer = Customer.objects.create(branch=self.branch, name="John")
        self.address = Address.objects.create(customer=self.customer, line1="Main Street")
        self.open_shift = Shift.objects.create(
            branch=self.branch,
            device=self.device,
            user=self.user,
            opening_cash=Decimal("100.00"),
        )

    def _order_payload(self, **overrides):
        payload = {
            "local_id": f"local-{uuid4()}",
            "idempotency_key": f"idem-{uuid4()}",
            "branch_id": str(self.branch.id),
            "device_id": self.device.device_id,
            "channel": "dine_in",
            "offline_created_at": timezone.now().isoformat(),
            "table_id": str(self.table.id),
            "items": [
                {
                    "menu_item_id": str(self.item.id),
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

    def test_config_delta_sync_returns_data(self):
        url = reverse("pos-config")
        response = self.client.get(url, {"branch_id": str(self.branch.id), "since_version": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["version"], 5)
        self.assertGreaterEqual(len(response.data["channels"]), 2)
        self.assertGreaterEqual(len(response.data["channel_configs"]), 2)
        self.assertGreaterEqual(len(response.data["menu_items"]), 1)

    def test_order_idempotency_replay_returns_same_mapping(self):
        url = reverse("pos-order-list")
        payload = self._order_payload(channel="dine_in")
        response_a = self.client.post(url, payload, format="json")
        self.assertEqual(response_a.status_code, 201)

        response_b = self.client.post(url, payload, format="json")
        self.assertEqual(response_b.status_code, 201)
        self.assertEqual(response_a.data["id"], response_b.data["id"])
        self.assertEqual(response_a.data["mapping"]["local_id"], payload["local_id"])

    def test_order_rule_delivery_requires_customer_and_address(self):
        url = reverse("pos-order-list")
        payload = self._order_payload(channel="delivery", table_id=None)
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Delivery orders require customer", str(response.data))

    def test_delivery_order_success_with_customer_and_address(self):
        url = reverse("pos-order-list")
        payload = self._order_payload(
            channel="delivery",
            table_id=None,
            customer_id=str(self.customer.id),
            address_id=str(self.address.id),
        )
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "draft")

    def test_manager_override_required_for_cancel(self):
        create_url = reverse("pos-order-list")
        payload = self._order_payload(channel="dine_in")
        created = self.client.post(create_url, payload, format="json")
        self.assertEqual(created.status_code, 201)
        order_id = created.data["id"]

        cancel_url = reverse("pos-order-cancel", kwargs={"pk": order_id})
        denied = self.client.post(cancel_url, {"reason": "mistake"}, format="json")
        self.assertEqual(denied.status_code, 400)

        allowed = self.client.post(
            cancel_url,
            {"reason": "mistake", "manager_pin": "1111"},
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data["status"], "canceled")
        self.assertFalse(allowed.data["is_held"])

    def test_cancel_accepts_staff_manager_pin(self):
        manager = get_user_model().objects.create_user(
            username="manager_user",
            password="manager123",
            is_staff=True,
        )
        ManagerOverride.objects.create(user=manager, pin="2222", is_active=True)

        created = self.client.post(reverse("pos-order-list"), self._order_payload(channel="dine_in"), format="json")
        self.assertEqual(created.status_code, 201)
        order_id = created.data["id"]

        cancel_url = reverse("pos-order-cancel", kwargs={"pk": order_id})
        allowed = self.client.post(
            cancel_url,
            {"reason": "manager-approved", "manager_pin": "2222"},
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data["status"], "canceled")

    def test_cancel_unholds_order(self):
        created = self.client.post(reverse("pos-order-list"), self._order_payload(channel="dine_in"), format="json")
        self.assertEqual(created.status_code, 201)
        order_id = created.data["id"]

        hold_url = reverse("pos-order-hold", kwargs={"pk": order_id})
        held = self.client.post(hold_url, {}, format="json")
        self.assertEqual(held.status_code, 200)
        self.assertTrue(held.data["is_held"])

        cancel_url = reverse("pos-order-cancel", kwargs={"pk": order_id})
        canceled = self.client.post(cancel_url, {"reason": "mistake", "manager_pin": "1111"}, format="json")
        self.assertEqual(canceled.status_code, 200)
        self.assertEqual(canceled.data["status"], "canceled")
        self.assertFalse(canceled.data["is_held"])

    def test_close_shift_sets_closed_status_and_variance(self):
        open_response = self.client.post(
            reverse("pos-shift-open"),
            {
                "branch_id": str(self.branch.id),
                "device_id": self.device.device_id,
                "opening_cash": "120.00",
            },
            format="json",
        )
        self.assertIn(open_response.status_code, {200, 201})
        shift_id = open_response.data["id"]

        close_response = self.client.post(
            reverse("pos-shift-close", kwargs={"pk": shift_id}),
            {"closing_cash": "150.00"},
            format="json",
        )
        self.assertEqual(close_response.status_code, 200)
        self.assertEqual(close_response.data["status"], "closed")
        self.assertEqual(close_response.data["variance"], "50.00")

    def test_close_shift_requires_closing_cash(self):
        open_response = self.client.post(
            reverse("pos-shift-open"),
            {
                "branch_id": str(self.branch.id),
                "device_id": self.device.device_id,
                "opening_cash": "80.00",
            },
            format="json",
        )
        self.assertIn(open_response.status_code, {200, 201})
        shift_id = open_response.data["id"]

        close_response = self.client.post(
            reverse("pos-shift-close", kwargs={"pk": shift_id}),
            {},
            format="json",
        )
        self.assertEqual(close_response.status_code, 400)

    def test_create_order_requires_open_shift(self):
        self.open_shift.status = Shift.ShiftStatus.CLOSED
        self.open_shift.closing_cash = Decimal("100.00")
        self.open_shift.closed_at = timezone.now()
        self.open_shift.save(update_fields=["status", "closing_cash", "closed_at", "updated_at"])

        response = self.client.post(reverse("pos-order-list"), self._order_payload(channel="dine_in"), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Open shift is required", str(response.data))

    def test_add_payment_requires_open_shift(self):
        created = self.client.post(reverse("pos-order-list"), self._order_payload(channel="dine_in"), format="json")
        self.assertEqual(created.status_code, 201)
        order_id = created.data["id"]

        self.open_shift.status = Shift.ShiftStatus.CLOSED
        self.open_shift.closing_cash = Decimal("100.00")
        self.open_shift.closed_at = timezone.now()
        self.open_shift.save(update_fields=["status", "closing_cash", "closed_at", "updated_at"])

        payment_response = self.client.post(
            reverse("pos-order-payments", kwargs={"pk": order_id}),
            {"idempotency_key": "no-shift-payment", "method": "cash", "amount": "25.00"},
            format="json",
        )
        self.assertEqual(payment_response.status_code, 400)
        self.assertIn("Open shift is required", str(payment_response.data))

    @override_settings(POS_ERP_API_KEY="erp-secret")
    def test_erp_sync_promotions_and_fetch_active(self):
        sync_url = reverse("integration-erp-promotions-sync")
        payload = {
            "branch_code": self.branch.code,
            "offers": [
                {
                    "external_id": "offer-001",
                    "title": "Happy Hour",
                    "description": "10% off beverages",
                    "discount_type": "percent",
                    "discount_value": "10.00",
                    "is_active": True,
                }
            ],
            "coupons": [
                {
                    "external_id": "coupon-001",
                    "code": "SAVE20",
                    "title": "Save 20",
                    "discount_type": "fixed",
                    "discount_value": "20.00",
                    "is_active": True,
                }
            ],
        }
        sync_response = self.client.post(
            sync_url,
            payload,
            format="json",
            HTTP_X_ERP_API_KEY="erp-secret",
        )
        self.assertEqual(sync_response.status_code, 200)
        self.assertEqual(sync_response.data["summary"]["offers_created"], 1)
        self.assertEqual(sync_response.data["summary"]["coupons_created"], 1)

        promotions_response = self.client.get(reverse("pos-promotions"), {"branch_id": str(self.branch.id)})
        self.assertEqual(promotions_response.status_code, 200)
        self.assertEqual(len(promotions_response.data["offers"]), 1)
        self.assertEqual(len(promotions_response.data["coupons"]), 1)
        self.assertEqual(promotions_response.data["coupons"][0]["code"], "SAVE20")

    @override_settings(POS_ERP_API_KEY="erp-secret")
    def test_erp_sync_rejects_invalid_key(self):
        sync_url = reverse("integration-erp-promotions-sync")
        response = self.client.post(
            sync_url,
            {
                "branch_code": self.branch.code,
                "offers": [
                    {
                        "external_id": "offer-unauthorized",
                        "title": "Blocked",
                        "discount_type": "percent",
                        "discount_value": "5.00",
                    }
                ],
            },
            format="json",
            HTTP_X_ERP_API_KEY="wrong-key",
        )
        self.assertEqual(response.status_code, 401)
