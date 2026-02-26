from decimal import Decimal

from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from pos.models import (
    Address,
    Branch,
    CashMovement,
    ChannelConfig,
    ConfigVersion,
    Customer,
    DeliveryAssignment,
    DeliveryProvider,
    Device,
    DiningTable,
    Driver,
    ExternalOrder,
    ExternalOrderEvent,
    ExternalOutboundTask,
    ErpCoupon,
    ErpOffer,
    Floor,
    IdempotencyKey,
    KdsItem,
    ManagerOverride,
    MenuCategory,
    MenuItem,
    ModifierGroup,
    ModifierItem,
    OrderChannel,
    OrderChannelSnapshot,
    Payment,
    Refund,
    RefundItem,
    DeviceHealthCheck,
    PrintJob,
    PosOrder,
    PosOrderItem,
    PreOrderSchedule,
    PriceList,
    PriceListItem,
    ProviderItemMapping,
    ProviderStoreMapping,
    ServiceChargeRule,
    Shift,
    SyncReceipt,
    TaxProfile,
)
from pos.services import (
    OrderRuleError,
    build_order_channel_snapshot,
    ensure_channel_allows_new_orders,
    get_next_order_number,
    refresh_order_snapshot,
    replace_order_items,
    validate_order_channel_requirements,
)
from pos.services.excise import compute_excise_amount, get_excise_rate_percent

ARABIC_DIGIT_TRANSLATION = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹",
    "01234567890123456789",
)


def normalize_pin(value: str) -> str:
    return (value or "").strip().translate(ARABIC_DIGIT_TRANSLATION)


def normalize_phone(value: str) -> str:
    normalized = (value or "").strip().translate(ARABIC_DIGIT_TRANSLATION)
    return "".join(ch for ch in normalized if ch.isdigit())


MOJIBAKE_CUSTOMER_NAME_VARIANTS = {
    "ط¹ظ…ظٹظ„ ظ…ط¨ط§ط´ط±",
    "Ø¹Ù…ÙŠÙ„ Ù…Ø¨Ø§Ø´Ø±",
}


def normalize_customer_name(value: str | None) -> str:
    normalized = (value or "").strip()
    if not normalized:
        return ""
    if normalized in MOJIBAKE_CUSTOMER_NAME_VARIANTS:
        return "عميل مباشر"
    markers = ("ط¹ظ", "Ø", "Ù", "ظ…")
    if sum(marker in normalized for marker in markers) >= 2:
        return "عميل مباشر"
    if "\ufffd" in normalized:
        return "عميل"
    return normalized


class DeviceRegisterSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=128)
    display_name = serializers.CharField(max_length=255)

    def create(self, validated_data):
        branch = Branch.objects.get(id=validated_data["branch_id"])
        token = f"dev_{validated_data['device_id']}_{timezone.now().timestamp()}"
        device, created = Device.objects.get_or_create(
            device_id=validated_data["device_id"],
            defaults={
                "branch": branch,
                "display_name": validated_data["display_name"],
                "token": token,
            },
        )
        if not created:
            device.branch = branch
            device.display_name = validated_data["display_name"]
            if not device.token:
                device.token = token
            device.is_active = True
            device.save()
        return device


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "branch", "name", "phone", "notes", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id",
            "customer",
            "label",
            "line1",
            "city",
            "latitude",
            "longitude",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class AuthLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(required=False, allow_blank=True, default="")
    device_token = serializers.CharField(required=False, allow_blank=True)
    pin = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        username = attrs["username"]
        pin = normalize_pin(attrs.get("pin", ""))
        password = attrs.get("password", "")

        if pin:
            user = get_user_model().objects.filter(username=username).first()
            if user and ManagerOverride.objects.filter(user=user, pin=pin, is_active=True).exists():
                attrs["user"] = user
                return attrs

        user = authenticate(username=username, password=password)
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
        attrs["user"] = user
        return attrs


class OrderChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderChannel
        fields = ["id", "code", "display_name"]


class TaxRuleLiteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.CharField()
    rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    is_inclusive = serializers.BooleanField()


class TaxProfileSerializer(serializers.ModelSerializer):
    rules = serializers.SerializerMethodField()

    class Meta:
        model = TaxProfile
        fields = ["id", "name", "rules", "updated_at"]

    def get_rules(self, obj):
        return TaxRuleLiteSerializer(obj.rules.order_by("code"), many=True).data


class ServiceChargeRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceChargeRule
        fields = ["id", "name", "charge_type", "value", "updated_at"]


class PriceListItemSerializer(serializers.ModelSerializer):
    menu_item_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = PriceListItem
        fields = ["id", "menu_item_id", "price", "updated_at"]


class PriceListSerializer(serializers.ModelSerializer):
    items = PriceListItemSerializer(many=True, read_only=True)

    class Meta:
        model = PriceList
        fields = ["id", "name", "is_default", "items", "updated_at"]


class ChannelConfigSerializer(serializers.ModelSerializer):
    channel = serializers.UUIDField(source="channel_id", read_only=True)
    channel_code = serializers.CharField(source="channel.code", read_only=True)
    price_list_id = serializers.UUIDField(read_only=True)
    tax_profile_id = serializers.UUIDField(read_only=True)
    service_charge_rule_id = serializers.UUIDField(read_only=True, allow_null=True)
    discount_policy_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = ChannelConfig
        fields = [
            "id",
            "channel",
            "channel_code",
            "price_list_id",
            "tax_profile_id",
            "service_charge_rule_id",
            "discount_policy_id",
            "is_enabled",
            "allow_new_orders",
            "availability_rules",
            "printing_routing",
            "config_version",
            "updated_at",
        ]


class FloorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Floor
        fields = ["id", "name", "sort_order", "floor_plan", "updated_at"]


class TableSerializer(serializers.ModelSerializer):
    floor = serializers.UUIDField(source="floor_id", read_only=True)

    class Meta:
        model = DiningTable
        fields = ["id", "floor", "code", "seats_count", "status", "updated_at"]


class MenuCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuCategory
        fields = ["id", "name", "sort_order", "is_active", "updated_at"]


class MenuItemSerializer(serializers.ModelSerializer):
    category = serializers.UUIDField(source="category_id", read_only=True, allow_null=True)
    excise_category = serializers.CharField(read_only=True)
    excise_rate_percent = serializers.SerializerMethodField()

    def get_excise_rate_percent(self, obj: MenuItem) -> str:
        return str(get_excise_rate_percent(obj.excise_category))

    class Meta:
        model = MenuItem
        fields = [
            "id",
            "category",
            "code",
            "name",
            "base_price",
            "excise_category",
            "excise_rate_percent",
            "kitchen_station",
            "is_active",
            "updated_at",
        ]


class ModifierItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModifierItem
        fields = ["id", "name", "price_delta", "is_active", "updated_at"]


class ModifierGroupSerializer(serializers.ModelSerializer):
    items = ModifierItemSerializer(many=True, read_only=True)

    class Meta:
        model = ModifierGroup
        fields = ["id", "name", "required", "min_select", "max_select", "items", "updated_at"]


class PosConfigDeltaSerializer(serializers.Serializer):
    version = serializers.IntegerField()
    branch = serializers.UUIDField()
    channels = OrderChannelSerializer(many=True)
    channel_configs = ChannelConfigSerializer(many=True)
    floors = FloorSerializer(many=True)
    tables = TableSerializer(many=True)
    menu_categories = MenuCategorySerializer(many=True)
    menu_items = MenuItemSerializer(many=True)
    modifiers = ModifierGroupSerializer(many=True)
    price_lists = PriceListSerializer(many=True)
    taxes = TaxProfileSerializer(many=True)
    service_charges = ServiceChargeRuleSerializer(many=True)
    discount_policies = serializers.ListField(child=serializers.JSONField())


class OrderItemInputSerializer(serializers.Serializer):
    menu_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3)
    unit_price_snapshot = serializers.DecimalField(max_digits=12, decimal_places=2)
    tax_amount_snapshot = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_amount_snapshot = serializers.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    modifiers_snapshot_json = serializers.JSONField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("quantity must be > 0.")
        return value


class OrderCreateSerializer(serializers.Serializer):
    local_id = serializers.CharField(max_length=128)
    idempotency_key = serializers.CharField(max_length=128)
    branch_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=128)
    channel = serializers.ChoiceField(choices=OrderChannel.ChannelCode.choices)
    kitchen_priority = serializers.ChoiceField(
        required=False,
        choices=PosOrder.KitchenPriority.choices,
        default=PosOrder.KitchenPriority.NORMAL,
    )
    table_id = serializers.UUIDField(required=False, allow_null=True)
    seats_count = serializers.IntegerField(required=False, default=0)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    address_id = serializers.UUIDField(required=False, allow_null=True)
    customer_phone = serializers.CharField(required=False, allow_blank=True, default="")
    scheduled_at = serializers.DateTimeField(required=False, allow_null=True)
    fulfillment_mode = serializers.ChoiceField(
        required=False,
        choices=PosOrder.FulfillmentMode.choices,
        default=PosOrder.FulfillmentMode.COUNTER,
    )
    pickup_window_status = serializers.ChoiceField(
        required=False,
        choices=PosOrder.PickupWindowStatus.choices,
        default=PosOrder.PickupWindowStatus.PENDING,
    )
    pickup_code = serializers.CharField(required=False, allow_blank=True, default="")
    car_info = serializers.JSONField(required=False)
    channel_for_preorder = serializers.ChoiceField(
        required=False,
        choices=[
            OrderChannel.ChannelCode.PICKUP,
            OrderChannel.ChannelCode.DELIVERY,
        ],
    )
    offline_created_at = serializers.DateTimeField()
    items = OrderItemInputSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        request = self.context.get("request")
        branch = Branch.objects.filter(id=attrs["branch_id"]).first()
        if not branch:
            raise serializers.ValidationError("Invalid branch_id.")
        attrs["branch"] = branch

        device = Device.objects.filter(device_id=attrs["device_id"], branch=branch, is_active=True).first()
        if not device:
            raise serializers.ValidationError("Invalid device for branch.")
        attrs["device"] = device

        if request and request.user and request.user.is_authenticated:
            open_shift = (
                Shift.objects.filter(
                    branch=branch,
                    device=device,
                    user=request.user,
                    status=Shift.ShiftStatus.OPEN,
                )
                .order_by("-opened_at")
                .first()
            )
            if not open_shift:
                raise serializers.ValidationError("Open shift is required before creating sales orders.")
            attrs["shift"] = open_shift
        else:
            attrs["shift"] = None

        channel = OrderChannel.objects.filter(code=attrs["channel"]).first()
        if not channel:
            raise serializers.ValidationError("Invalid channel.")
        attrs["channel_obj"] = channel

        channel_config = (
            ChannelConfig.objects.select_related(
                "price_list",
                "tax_profile",
                "service_charge_rule",
                "discount_policy",
                "channel",
            )
            .prefetch_related("tax_profile__rules")
            .filter(branch=branch, channel=channel)
            .first()
        )
        if not channel_config:
            raise serializers.ValidationError("Missing channel config for branch.")
        ensure_channel_allows_new_orders(channel_config)
        attrs["channel_config"] = channel_config

        if attrs.get("table_id"):
            attrs["table"] = DiningTable.objects.filter(id=attrs["table_id"], branch=branch).first()
            if not attrs["table"]:
                raise serializers.ValidationError("Invalid table_id.")
            has_unpaid_order = PosOrder.objects.filter(
                branch=branch,
                table=attrs["table"],
                channel__code=OrderChannel.ChannelCode.DINE_IN,
            ).exclude(
                status__in=[
                    PosOrder.OrderStatus.PAID,
                    PosOrder.OrderStatus.CANCELED,
                    PosOrder.OrderStatus.REFUNDED,
                    PosOrder.OrderStatus.COMPLETED,
                ]
            ).exists()
            if has_unpaid_order:
                raise serializers.ValidationError("Selected table has an unpaid order. Settle the previous order first.")
        else:
            attrs["table"] = None

        attrs["customer"] = (
            Customer.objects.filter(id=attrs.get("customer_id"), branch=branch).first()
            if attrs.get("customer_id")
            else None
        )
        if attrs.get("customer_id") and not attrs["customer"]:
            raise serializers.ValidationError("Invalid customer_id.")

        attrs["address"] = (
            Address.objects.filter(id=attrs.get("address_id"), customer=attrs["customer"]).first()
            if attrs.get("address_id")
            else None
        )
        if attrs.get("address_id") and not attrs["address"]:
            raise serializers.ValidationError("Invalid address_id.")

        if attrs["channel"] == OrderChannel.ChannelCode.DELIVERY:
            phone = normalize_phone(attrs.get("customer_phone", ""))
            attrs["delivery_customer_phone"] = phone
            if not attrs["customer"] and phone:
                attrs["customer"] = Customer.objects.filter(branch=branch, phone=phone).order_by("-updated_at").first()
                if not attrs["customer"]:
                    attrs["customer"] = Customer.objects.create(
                        branch=branch,
                        name="عميل مباشر",
                        phone=phone,
                    )
            if not attrs["customer"] and not phone:
                raise serializers.ValidationError("Delivery orders require customer_phone.")

        try:
            validate_order_channel_requirements(
                {
                    "table": attrs.get("table"),
                    "customer": attrs.get("customer"),
                    "address": attrs.get("address"),
                    "scheduled_at": attrs.get("scheduled_at"),
                    "channel_for_preorder": attrs.get("channel_for_preorder"),
                },
                attrs["channel"],
            )
        except OrderRuleError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        request = self.context["request"]
        fulfillment_mode = validated_data.get("fulfillment_mode", PosOrder.FulfillmentMode.COUNTER)
        pickup_status = validated_data.get("pickup_window_status", PosOrder.PickupWindowStatus.PENDING)
        if validated_data["channel"] == OrderChannel.ChannelCode.PICKUP_WINDOW:
            fulfillment_mode = PosOrder.FulfillmentMode.WINDOW
            pickup_status = PosOrder.PickupWindowStatus.PENDING

        delivery_phone = validated_data.get("delivery_customer_phone", "")
        customer = validated_data["customer"]
        if validated_data["channel"] == OrderChannel.ChannelCode.DELIVERY and not customer and delivery_phone:
            customer = (
                Customer.objects.filter(branch=validated_data["branch"], phone=delivery_phone).order_by("-updated_at").first()
            )
            if not customer:
                customer = Customer.objects.create(
                    branch=validated_data["branch"],
                    name="عميل مباشر",
                    phone=delivery_phone,
                )

        order = PosOrder.objects.create(
            local_id=validated_data["local_id"],
            idempotency_key=validated_data["idempotency_key"],
            branch=validated_data["branch"],
            device=validated_data["device"],
            shift=validated_data.get("shift"),
            user=request.user,
            channel=validated_data["channel_obj"],
            kitchen_priority=validated_data.get("kitchen_priority", PosOrder.KitchenPriority.NORMAL),
            channel_config=validated_data["channel_config"],
            table=validated_data["table"],
            seats_count=validated_data.get("seats_count", 0),
            customer=customer,
            address=validated_data["address"],
            offline_created_at=validated_data["offline_created_at"],
            notes=validated_data.get("notes", ""),
            order_number=get_next_order_number(validated_data["branch"]),
            fulfillment_mode=fulfillment_mode,
            pickup_window_status=pickup_status,
            pickup_code=validated_data.get("pickup_code", ""),
            car_info=validated_data.get("car_info", {}) or {},
        )

        tax_rate_percent = sum(
            (rule.rate_percent for rule in validated_data["channel_config"].tax_profile.rules.all()),
            Decimal("0.00"),
        )

        subtotal = Decimal("0.00")
        tax_total = Decimal("0.00")
        excise_total = Decimal("0.00")
        discount_total = Decimal("0.00")
        excise_breakdown: dict[str, Decimal] = {}
        pos_items = []
        for item in validated_data["items"]:
            menu_item = MenuItem.objects.get(id=item["menu_item_id"])
            line_subtotal = item["quantity"] * item["unit_price_snapshot"]
            line_excise = compute_excise_amount(line_subtotal, menu_item.excise_category)
            line_tax = ((line_subtotal + line_excise) * tax_rate_percent / Decimal("100")).quantize(Decimal("0.01"))
            subtotal += line_subtotal
            tax_total += line_tax
            excise_total += line_excise
            if menu_item.excise_category and line_excise > 0:
                excise_breakdown[menu_item.excise_category] = (
                    excise_breakdown.get(menu_item.excise_category, Decimal("0.00")) + line_excise
                )
            discount_total += item.get("discount_amount_snapshot") or Decimal("0.00")
            pos_items.append(
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
        PosOrderItem.objects.bulk_create(pos_items)

        snapshot = build_order_channel_snapshot(
            order=order,
            channel_config=validated_data["channel_config"],
            subtotal=subtotal,
            tax_total=tax_total,
            excise_total=excise_total,
            discount_total=discount_total,
            excise_breakdown={key: str(value.quantize(Decimal("0.01"))) for key, value in excise_breakdown.items()},
        )
        OrderChannelSnapshot.objects.create(
            order=order,
            payload=snapshot,
            config_version=validated_data["channel_config"].config_version,
        )

        order.subtotal = Decimal(snapshot["totals"]["subtotal"])
        order.tax_total = Decimal(snapshot["totals"]["tax_total"])
        order.excise_total = Decimal(snapshot["totals"]["excise_total"])
        order.service_charge_total = Decimal(snapshot["totals"]["service_charge_total"])
        order.discount_total = Decimal(snapshot["totals"]["discount_total"])
        order.grand_total = Decimal(snapshot["totals"]["grand_total"])
        order.save(
            update_fields=[
                "subtotal",
                "tax_total",
                "excise_total",
                "service_charge_total",
                "discount_total",
                "grand_total",
                "updated_at",
            ]
        )

        if validated_data["channel"] == OrderChannel.ChannelCode.PREORDER and validated_data.get("scheduled_at"):
            PreOrderSchedule.objects.create(
                order=order,
                scheduled_at=validated_data["scheduled_at"],
                window_minutes=30,
            )

        SyncReceipt.objects.update_or_create(
            device=validated_data["device"],
            entity_type="order",
            local_id=validated_data["local_id"],
            defaults={"server_id": str(order.id)},
        )
        return order


class OrderUpdateSerializer(serializers.Serializer):
    table_id = serializers.UUIDField(required=False, allow_null=True)
    seats_count = serializers.IntegerField(required=False)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    address_id = serializers.UUIDField(required=False, allow_null=True)
    fulfillment_mode = serializers.ChoiceField(required=False, choices=PosOrder.FulfillmentMode.choices)
    pickup_window_status = serializers.ChoiceField(required=False, choices=PosOrder.PickupWindowStatus.choices)
    kitchen_priority = serializers.ChoiceField(required=False, choices=PosOrder.KitchenPriority.choices)
    pickup_code = serializers.CharField(required=False, allow_blank=True)
    car_info = serializers.JSONField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    items = OrderItemInputSerializer(many=True, required=False)

    def validate(self, attrs):
        order: PosOrder = self.instance
        if order.status != PosOrder.OrderStatus.DRAFT:
            raise serializers.ValidationError("Only draft orders can be updated.")
        branch = order.branch

        if "table_id" in attrs:
            if attrs["table_id"]:
                attrs["table"] = DiningTable.objects.filter(id=attrs["table_id"], branch=branch).first()
                if not attrs["table"]:
                    raise serializers.ValidationError("Invalid table_id.")
            else:
                attrs["table"] = None

        if "customer_id" in attrs:
            attrs["customer"] = (
                Customer.objects.filter(id=attrs["customer_id"], branch=branch).first()
                if attrs.get("customer_id")
                else None
            )
            if attrs.get("customer_id") and not attrs["customer"]:
                raise serializers.ValidationError("Invalid customer_id.")

        if "address_id" in attrs:
            attrs["address"] = (
                Address.objects.filter(id=attrs.get("address_id"), customer=attrs.get("customer")).first()
                if attrs.get("address_id")
                else None
            )
            if attrs.get("address_id") and not attrs["address"]:
                raise serializers.ValidationError("Invalid address_id.")

        order_data = {
            "table": attrs.get("table", order.table),
            "customer": attrs.get("customer", order.customer),
            "address": attrs.get("address", order.address),
            "scheduled_at": getattr(order, "preorder_schedule", None).scheduled_at if hasattr(order, "preorder_schedule") else None,
            "channel_for_preorder": OrderChannel.ChannelCode.PICKUP if order.channel.code == OrderChannel.ChannelCode.PREORDER else None,
        }
        try:
            validate_order_channel_requirements(order_data, order.channel.code)
        except OrderRuleError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return attrs

    def update(self, instance: PosOrder, validated_data):
        if "table" in validated_data:
            instance.table = validated_data["table"]
        if "seats_count" in validated_data:
            instance.seats_count = validated_data["seats_count"]
        if "customer" in validated_data:
            instance.customer = validated_data["customer"]
        if "address" in validated_data:
            instance.address = validated_data["address"]
        if "fulfillment_mode" in validated_data:
            instance.fulfillment_mode = validated_data["fulfillment_mode"]
        if "pickup_window_status" in validated_data:
            instance.pickup_window_status = validated_data["pickup_window_status"]
        if "kitchen_priority" in validated_data:
            instance.kitchen_priority = validated_data["kitchen_priority"]
        if "pickup_code" in validated_data:
            instance.pickup_code = validated_data["pickup_code"] or ""
        if "car_info" in validated_data:
            instance.car_info = validated_data["car_info"] or {}
        if "notes" in validated_data:
            instance.notes = validated_data["notes"]

        if "items" in validated_data:
            replace_order_items(instance, validated_data["items"])

        instance.save(update_fields=[
            "table",
            "seats_count",
            "customer",
            "address",
            "fulfillment_mode",
            "pickup_window_status",
            "kitchen_priority",
            "pickup_code",
            "car_info",
            "notes",
            "updated_at",
        ])
        refresh_order_snapshot(instance)
        return instance


class OrderListSerializer(serializers.ModelSerializer):
    channel_code = serializers.CharField(source="channel.code", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    def get_customer_name(self, obj: PosOrder) -> str:
        return normalize_customer_name(getattr(obj.customer, "name", ""))

    class Meta:
        model = PosOrder
        fields = [
            "id",
            "local_id",
            "branch",
            "device",
            "shift",
            "channel_code",
            "status",
            "kitchen_priority",
            "is_held",
            "held_at",
            "order_number",
            "fulfillment_mode",
            "pickup_window_status",
            "arrival_at",
            "ready_at",
            "handed_over_at",
            "pickup_code",
            "table",
            "seats_count",
            "customer_name",
            "customer_phone",
            "subtotal",
            "tax_total",
            "excise_total",
            "service_charge_total",
            "discount_total",
            "grand_total",
            "offline_created_at",
            "created_at",
        ]


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source="menu_item.name", read_only=True)

    class Meta:
        model = PosOrderItem
        fields = [
            "id",
            "menu_item",
            "menu_item_name",
            "quantity",
            "unit_price_snapshot",
            "tax_amount_snapshot",
            "excise_amount_snapshot",
            "discount_amount_snapshot",
            "modifiers_snapshot_json",
            "notes",
        ]


class OrderDetailSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    channel_snapshot = serializers.JSONField(source="channel_snapshot.payload", read_only=True)
    channel_code = serializers.CharField(source="channel.code", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    def get_customer_name(self, obj: PosOrder) -> str:
        return normalize_customer_name(getattr(obj.customer, "name", ""))

    class Meta:
        model = PosOrder
        fields = [
            "id",
            "local_id",
            "idempotency_key",
            "branch",
            "device",
            "shift",
            "channel",
            "channel_code",
            "status",
            "kitchen_priority",
            "is_held",
            "held_at",
            "order_number",
            "fulfillment_mode",
            "pickup_window_status",
            "arrival_at",
            "ready_at",
            "handed_over_at",
            "pickup_code",
            "car_info",
            "table",
            "seats_count",
            "customer",
            "customer_name",
            "customer_phone",
            "address",
            "subtotal",
            "tax_total",
            "excise_total",
            "service_charge_total",
            "discount_total",
            "grand_total",
            "offline_created_at",
            "submitted_at",
            "notes",
            "items",
            "channel_snapshot",
        ]


class OrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PosOrder.OrderStatus.choices)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    manager_pin = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        request = self.context["request"]
        new_status = attrs["status"]
        if new_status in {PosOrder.OrderStatus.CANCELED, PosOrder.OrderStatus.REFUNDED}:
            if not attrs.get("reason"):
                raise serializers.ValidationError("reason is required for cancel/refund.")
            manager_pin = normalize_pin(attrs.get("manager_pin"))
            validate_manager_pin(manager_pin, request.user, "cancel/refund")
        return attrs


class OrderPrioritySerializer(serializers.Serializer):
    kitchen_priority = serializers.ChoiceField(choices=PosOrder.KitchenPriority.choices)


def validate_manager_pin(manager_pin: str, actor, action_label: str) -> None:
    if not manager_pin:
        raise serializers.ValidationError(f"manager_pin is required for {action_label}.")
    # Backward-compatible: still accepts current user's PIN, and also accepts
    # an active staff/superuser override PIN for manager-authorized actions.
    valid_override = ManagerOverride.objects.filter(
        pin=manager_pin,
        is_active=True,
    ).filter(
        Q(user=actor) | Q(user__is_staff=True) | Q(user__is_superuser=True)
    ).exists()
    if not valid_override:
        raise serializers.ValidationError("Invalid manager PIN.")


class PaymentCreateSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(max_length=128)
    method = serializers.ChoiceField(choices=Payment.PaymentMethod.choices)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    reference_no = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("amount must be greater than zero.")
        return value


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "order", "shift", "method", "amount", "paid_at", "reference_no"]


class RefundItemInputSerializer(serializers.Serializer):
    order_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=10, decimal_places=3)

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("quantity must be greater than zero.")
        return value


class RefundCreateSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(max_length=128)
    reason = serializers.CharField(max_length=512)
    manager_pin = serializers.CharField(max_length=16)
    refund_type = serializers.ChoiceField(choices=Refund.RefundType.choices, default=Refund.RefundType.PARTIAL)
    method = serializers.ChoiceField(choices=Refund.RefundMethod.choices, default=Refund.RefundMethod.CASH)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    reference_no = serializers.CharField(required=False, allow_blank=True, default="")
    items = RefundItemInputSerializer(many=True, required=False)

    def validate(self, attrs):
        manager_pin = normalize_pin(attrs.get("manager_pin", ""))
        validate_manager_pin(manager_pin, self.context["request"].user, "refund")
        attrs["manager_pin"] = manager_pin

        if attrs["refund_type"] == Refund.RefundType.PARTIAL:
            amount = attrs.get("amount")
            has_items = bool(attrs.get("items"))
            if amount is None and not has_items:
                raise serializers.ValidationError("partial refund requires amount or items.")
            if amount is not None and amount <= 0:
                raise serializers.ValidationError("amount must be greater than zero.")
        return attrs


class RefundItemSerializer(serializers.ModelSerializer):
    order_item_id = serializers.UUIDField(source="order_item.id", read_only=True)
    menu_item_id = serializers.UUIDField(source="order_item.menu_item.id", read_only=True)
    menu_item_name = serializers.CharField(source="order_item.menu_item.name", read_only=True)

    class Meta:
        model = RefundItem
        fields = [
            "id",
            "order_item_id",
            "menu_item_id",
            "menu_item_name",
            "quantity",
            "subtotal_amount",
            "excise_amount",
            "tax_amount",
            "total_amount",
        ]


class RefundSerializer(serializers.ModelSerializer):
    items = RefundItemSerializer(many=True, read_only=True)

    class Meta:
        model = Refund
        fields = [
            "id",
            "order",
            "shift",
            "processed_by",
            "idempotency_key",
            "refund_type",
            "method",
            "amount",
            "reason",
            "reference_no",
            "created_at",
            "items",
        ]


class OrderAttachCustomerSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    address_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        order: PosOrder = self.context["order"]
        customer = Customer.objects.filter(id=attrs["customer_id"], branch=order.branch).first()
        if not customer:
            raise serializers.ValidationError("Invalid customer_id.")
        attrs["customer"] = customer
        if attrs.get("address_id"):
            address = Address.objects.filter(id=attrs["address_id"], customer=customer).first()
            if not address:
                raise serializers.ValidationError("Invalid address_id.")
            attrs["address"] = address
        else:
            attrs["address"] = None
        return attrs


class PrintJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrintJob
        fields = [
            "id",
            "order",
            "device",
            "job_type",
            "payload",
            "status",
            "attempts",
            "last_error",
            "sent_at",
            "created_at",
        ]


class ShiftOpenSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=128)
    opening_cash = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    opened_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        branch = Branch.objects.filter(id=attrs["branch_id"]).first()
        if not branch:
            raise serializers.ValidationError("Invalid branch_id.")
        requires_cash = branch.requires_opening_cash
        if requires_cash and "opening_cash" not in attrs:
            raise serializers.ValidationError("opening_cash is required.")
        if "opening_cash" not in attrs:
            attrs["opening_cash"] = Decimal("0.00")
        return attrs


class ShiftCloseSerializer(serializers.Serializer):
    closing_cash = serializers.DecimalField(max_digits=12, decimal_places=2)
    closed_at = serializers.DateTimeField(required=False)


class CashMovementSerializer(serializers.Serializer):
    shift_id = serializers.UUIDField()
    movement_type = serializers.ChoiceField(choices=CashMovement.MovementType.choices)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    reason = serializers.CharField(max_length=255)

    def validate(self, attrs):
        shift = Shift.objects.filter(id=attrs["shift_id"]).first()
        if not shift:
            raise serializers.ValidationError("Invalid shift_id.")
        if shift.status != Shift.ShiftStatus.OPEN:
            raise serializers.ValidationError("Shift must be open.")
        return attrs


class DeliveryAssignmentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    driver_id = serializers.UUIDField()

    def create(self, validated_data):
        order = PosOrder.objects.get(id=validated_data["order_id"])
        driver = Driver.objects.get(id=validated_data["driver_id"], branch=order.branch)
        assignment, _ = DeliveryAssignment.objects.update_or_create(
            order=order,
            defaults={"driver": driver},
        )
        return assignment


class DriverSerializer(serializers.ModelSerializer):
    class Meta:
        model = Driver
        fields = ["id", "branch", "name", "phone", "is_active", "created_at", "updated_at"]


class DeliveryProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryProvider
        fields = [
            "id",
            "code",
            "name",
            "is_active",
            "auth_type",
            "base_url",
            "endpoints_json",
            "secrets_json",
            "created_at",
            "updated_at",
        ]


class ErpOfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = ErpOffer
        fields = [
            "id",
            "external_id",
            "title",
            "description",
            "discount_type",
            "discount_value",
            "min_order_amount",
            "max_discount_amount",
            "starts_at",
            "ends_at",
            "is_active",
            "stackable",
            "applies_to",
            "metadata",
            "last_synced_at",
            "updated_at",
        ]


class ErpCouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = ErpCoupon
        fields = [
            "id",
            "external_id",
            "code",
            "title",
            "description",
            "discount_type",
            "discount_value",
            "min_order_amount",
            "max_discount_amount",
            "usage_limit",
            "per_customer_limit",
            "starts_at",
            "ends_at",
            "is_active",
            "metadata",
            "last_synced_at",
            "updated_at",
        ]


class ErpOfferSyncItemSerializer(serializers.Serializer):
    external_id = serializers.CharField(max_length=128)
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    discount_type = serializers.ChoiceField(choices=ErpOffer.DiscountType.choices)
    discount_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    min_order_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0.00"))
    max_discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)
    stackable = serializers.BooleanField(required=False, default=False)
    applies_to = serializers.JSONField(required=False)
    metadata = serializers.JSONField(required=False)


class ErpCouponSyncItemSerializer(serializers.Serializer):
    external_id = serializers.CharField(max_length=128)
    code = serializers.CharField(max_length=64)
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    discount_type = serializers.ChoiceField(choices=ErpCoupon.DiscountType.choices)
    discount_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    min_order_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0.00"))
    max_discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    usage_limit = serializers.IntegerField(required=False, min_value=0, default=0)
    per_customer_limit = serializers.IntegerField(required=False, min_value=0, default=0)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False, default=True)
    metadata = serializers.JSONField(required=False)


class ErpPromotionSyncSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField(required=False)
    branch_code = serializers.CharField(required=False, allow_blank=True)
    purge_missing = serializers.BooleanField(required=False, default=False)
    offers = ErpOfferSyncItemSerializer(many=True, required=False)
    coupons = ErpCouponSyncItemSerializer(many=True, required=False)

    def validate(self, attrs):
        if not attrs.get("branch_id") and not (attrs.get("branch_code") or "").strip():
            raise serializers.ValidationError("branch_id or branch_code is required.")
        if not attrs.get("offers") and not attrs.get("coupons"):
            raise serializers.ValidationError("At least one of offers/coupons is required.")
        return attrs


class ProviderStoreMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProviderStoreMapping
        fields = ["id", "provider", "provider_store_id", "branch", "created_at", "updated_at"]


class ProviderItemMappingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProviderItemMapping
        fields = ["id", "provider", "provider_item_id", "menu_item", "created_at", "updated_at"]


class ExternalOrderSerializer(serializers.ModelSerializer):
    provider_code = serializers.CharField(source="provider.code", read_only=True)
    provider_name = serializers.CharField(source="provider.name", read_only=True)
    mapped_order_status = serializers.CharField(source="mapped_order.status", read_only=True)

    class Meta:
        model = ExternalOrder
        fields = [
            "id",
            "provider",
            "provider_code",
            "provider_name",
            "provider_order_id",
            "branch",
            "status_external",
            "mapped_order",
            "mapped_order_status",
            "last_error",
            "last_synced_at",
            "created_at",
            "updated_at",
        ]


class ExternalOrderEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExternalOrderEvent
        fields = ["id", "external_order", "event_type", "payload", "response", "created_at"]


class ExternalOutboundTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExternalOutboundTask
        fields = [
            "id",
            "external_order",
            "action",
            "payload",
            "attempts",
            "next_attempt_at",
            "last_error",
            "status",
            "created_at",
            "updated_at",
        ]


class PickupWindowOrderSerializer(serializers.ModelSerializer):
    channel_code = serializers.CharField(source="channel.code", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    def get_customer_name(self, obj: PosOrder) -> str:
        return normalize_customer_name(getattr(obj.customer, "name", ""))

    class Meta:
        model = PosOrder
        fields = [
            "id",
            "order_number",
            "channel_code",
            "status",
            "pickup_window_status",
            "arrival_at",
            "ready_at",
            "handed_over_at",
            "pickup_code",
            "customer_name",
            "customer_phone",
            "grand_total",
            "created_at",
        ]


class KdsStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=KdsItem.KdsStatus.choices)


class SyncStatusSerializer(serializers.Serializer):
    device_id = serializers.CharField(max_length=128)
    pending_idempotency = serializers.IntegerField()
    mapped_orders = serializers.IntegerField()
    last_sync = serializers.DateTimeField(allow_null=True)


class DeviceCheckItemSerializer(serializers.Serializer):
    type = serializers.CharField()
    status = serializers.ChoiceField(choices=["pass", "warn", "fail"])
    details = serializers.JSONField(required=False)


class DeviceHealthCheckSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceHealthCheck
        fields = [
            "id",
            "branch",
            "device",
            "shift",
            "user",
            "overall_status",
            "checks",
            "created_at",
        ]


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    is_staff = serializers.BooleanField()
    roles = serializers.ListField(child=serializers.CharField(), required=False)
    token = serializers.CharField()
    branch_id = serializers.UUIDField(allow_null=True, required=False)


def build_login_response(user):
    token, _ = Token.objects.get_or_create(user=user)
    default_branch = Branch.objects.order_by("created_at").only("id").first()
    return {
        "id": user.id,
        "username": user.username,
        "is_staff": user.is_staff,
        "roles": list(user.groups.values_list("name", flat=True)),
        "token": token.key,
        "branch_id": str(default_branch.id) if default_branch else None,
    }
