import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Company(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64, unique=True)

    def __str__(self) -> str:
        return self.name


class Branch(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="branches")
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=64, unique=True)
    timezone_name = models.CharField(max_length=64, default="UTC")
    requires_opening_cash = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.name


class Device(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_id = models.CharField(max_length=128, unique=True)
    token = models.CharField(max_length=255, unique=True, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="devices")
    display_name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    config_version = models.BigIntegerField(default=0)
    last_seen = models.DateTimeField(blank=True, null=True)

    def touch(self) -> None:
        self.last_seen = timezone.now()
        self.save(update_fields=["last_seen", "updated_at"])

    def __str__(self) -> str:
        return f"{self.display_name} ({self.device_id})"


class Role(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=64, unique=True)
    permissions = models.JSONField(default=list, blank=True)

    def __str__(self) -> str:
        return self.name


class ManagerOverride(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="manager_overrides")
    pin = models.CharField(max_length=16)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "pin")


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True)
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=128)
    entity = models.CharField(max_length=128)
    entity_id = models.CharField(max_length=128)
    reason = models.CharField(max_length=512, blank=True, default="")
    before_data = models.JSONField(default=dict, blank=True)
    after_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at"]


class MenuCategory(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="menu_categories")
    name = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("branch", "name")
        ordering = ["sort_order", "name"]


class MenuItem(TimestampedModel):
    class ExciseCategory(models.TextChoices):
        CARBONATED_DRINKS = "carbonated_drinks", "carbonated_drinks"
        SWEETENED_DRINKS = "sweetened_drinks", "sweetened_drinks"
        ENERGY_DRINKS = "energy_drinks", "energy_drinks"
        TOBACCO_PRODUCTS = "tobacco_products", "tobacco_products"
        SHISHA = "shisha", "shisha"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="menu_items")
    category = models.ForeignKey(MenuCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name="items")
    code = models.CharField(max_length=64)
    name = models.CharField(max_length=255)
    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    excise_category = models.CharField(max_length=32, choices=ExciseCategory.choices, blank=True, default="")
    is_active = models.BooleanField(default=True)
    kitchen_station = models.CharField(max_length=64, default="kitchen")

    class Meta:
        unique_together = ("branch", "code")
        ordering = ["name"]


class ModifierGroup(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="modifier_groups")
    name = models.CharField(max_length=255)
    required = models.BooleanField(default=False)
    min_select = models.PositiveIntegerField(default=0)
    max_select = models.PositiveIntegerField(default=1)


class ModifierItem(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(ModifierGroup, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=255)
    price_delta = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    is_active = models.BooleanField(default=True)


class ComboBundle(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="combos")
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)


class ComboBundleItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    combo = models.ForeignKey(ComboBundle, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="combo_links")
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("combo", "menu_item")


class PriceList(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="price_lists")
    name = models.CharField(max_length=255)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("branch", "name")


class PriceListItem(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    price_list = models.ForeignKey(PriceList, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="price_list_items")
    price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = ("price_list", "menu_item")


class TaxProfile(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="tax_profiles")
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("branch", "name")


class TaxRule(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tax_profile = models.ForeignKey(TaxProfile, on_delete=models.CASCADE, related_name="rules")
    code = models.CharField(max_length=32)
    rate_percent = models.DecimalField(max_digits=5, decimal_places=2)
    is_inclusive = models.BooleanField(default=False)

    class Meta:
        unique_together = ("tax_profile", "code")


class ServiceChargeRule(TimestampedModel):
    class ChargeType(models.TextChoices):
        PERCENTAGE = "percentage", "percentage"
        FIXED = "fixed", "fixed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="service_charge_rules")
    name = models.CharField(max_length=255)
    charge_type = models.CharField(max_length=16, choices=ChargeType.choices, default=ChargeType.PERCENTAGE)
    value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("branch", "name")


class DiscountPolicy(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="discount_policies")
    name = models.CharField(max_length=255)
    max_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    requires_manager_override = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("branch", "name")


class OrderChannel(TimestampedModel):
    class ChannelCode(models.TextChoices):
        DINE_IN = "dine_in", "dine_in"
        TAKEAWAY = "takeaway", "takeaway"
        PICKUP = "pickup", "pickup"
        PICKUP_WINDOW = "pickup_window", "pickup_window"
        DELIVERY = "delivery", "delivery"
        PREORDER = "preorder", "preorder"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=32, choices=ChannelCode.choices, unique=True)
    display_name = models.CharField(max_length=255)

    def __str__(self) -> str:
        return self.display_name


class ChannelConfig(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="channel_configs")
    channel = models.ForeignKey(OrderChannel, on_delete=models.CASCADE, related_name="configs")
    price_list = models.ForeignKey(PriceList, on_delete=models.PROTECT, related_name="channel_configs")
    tax_profile = models.ForeignKey(TaxProfile, on_delete=models.PROTECT, related_name="channel_configs")
    service_charge_rule = models.ForeignKey(
        ServiceChargeRule,
        on_delete=models.PROTECT,
        related_name="channel_configs",
        null=True,
        blank=True,
    )
    discount_policy = models.ForeignKey(
        DiscountPolicy,
        on_delete=models.PROTECT,
        related_name="channel_configs",
        null=True,
        blank=True,
    )
    is_enabled = models.BooleanField(default=True)
    allow_new_orders = models.BooleanField(default=True)
    availability_rules = models.JSONField(default=dict, blank=True)
    printing_routing = models.JSONField(default=dict, blank=True)
    config_version = models.BigIntegerField(default=1)

    class Meta:
        unique_together = ("branch", "channel")


class Floor(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="floors")
    name = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)
    floor_plan = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("branch", "name")
        ordering = ["sort_order", "name"]


class DiningTable(TimestampedModel):
    class TableStatus(models.TextChoices):
        AVAILABLE = "available", "available"
        OCCUPIED = "occupied", "occupied"
        RESERVED = "reserved", "reserved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="tables")
    floor = models.ForeignKey(Floor, on_delete=models.CASCADE, related_name="tables")
    code = models.CharField(max_length=64)
    seats_count = models.PositiveIntegerField(default=2)
    status = models.CharField(max_length=16, choices=TableStatus.choices, default=TableStatus.AVAILABLE)
    local_lock_device = models.CharField(max_length=128, blank=True, default="")

    class Meta:
        unique_together = ("branch", "code")
        ordering = ["code"]


class Seat(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    table = models.ForeignKey(DiningTable, on_delete=models.CASCADE, related_name="seats")
    seat_no = models.PositiveIntegerField()

    class Meta:
        unique_together = ("table", "seat_no")
        ordering = ["seat_no"]


class Customer(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="customers")
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True, default="")
    notes = models.CharField(max_length=512, blank=True, default="")


class Address(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(max_length=255, blank=True, default="")
    line1 = models.CharField(max_length=255)
    city = models.CharField(max_length=255, blank=True, default="")
    latitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, blank=True, null=True)


class Driver(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="drivers")
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, blank=True, default="")
    is_active = models.BooleanField(default=True)


class ConfigVersion(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.OneToOneField(Branch, on_delete=models.CASCADE, related_name="config_version_state")
    version = models.BigIntegerField(default=1)


class OrderNumberSequence(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.OneToOneField(Branch, on_delete=models.CASCADE, related_name="order_number_sequence")
    next_number = models.PositiveBigIntegerField(default=1)


class PosOrder(TimestampedModel):
    class OrderStatus(models.TextChoices):
        DRAFT = "draft", "draft"
        SUBMITTED = "submitted", "submitted"
        CANCELED = "canceled", "canceled"
        PAID = "paid", "paid"
        REFUNDED = "refunded", "refunded"
        COMPLETED = "completed", "completed"

    class FulfillmentMode(models.TextChoices):
        COUNTER = "counter", "counter"
        WINDOW = "window", "window"

    class PickupWindowStatus(models.TextChoices):
        PENDING = "pending", "pending"
        ARRIVED = "arrived", "arrived"
        READY = "ready", "ready"
        HANDED_OVER = "handed_over", "handed_over"

    class KitchenPriority(models.TextChoices):
        LOW = "low", "low"
        NORMAL = "normal", "normal"
        HIGH = "high", "high"
        URGENT = "urgent", "urgent"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    local_id = models.CharField(max_length=128, db_index=True)
    idempotency_key = models.CharField(max_length=128, db_index=True)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="orders")
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="orders")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")
    channel = models.ForeignKey(OrderChannel, on_delete=models.PROTECT, related_name="orders")
    shift = models.ForeignKey("Shift", on_delete=models.SET_NULL, null=True, blank=True, related_name="orders")
    channel_config = models.ForeignKey(
        ChannelConfig,
        on_delete=models.PROTECT,
        related_name="orders",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=16, choices=OrderStatus.choices, default=OrderStatus.DRAFT)
    kitchen_priority = models.CharField(
        max_length=16,
        choices=KitchenPriority.choices,
        default=KitchenPriority.NORMAL,
        db_index=True,
    )
    is_held = models.BooleanField(default=False)
    held_at = models.DateTimeField(blank=True, null=True)
    order_number = models.PositiveBigIntegerField(blank=True, null=True)
    fulfillment_mode = models.CharField(
        max_length=16,
        choices=FulfillmentMode.choices,
        default=FulfillmentMode.COUNTER,
    )
    pickup_window_status = models.CharField(
        max_length=16,
        choices=PickupWindowStatus.choices,
        default=PickupWindowStatus.PENDING,
    )
    arrival_at = models.DateTimeField(blank=True, null=True)
    ready_at = models.DateTimeField(blank=True, null=True)
    handed_over_at = models.DateTimeField(blank=True, null=True)
    pickup_code = models.CharField(max_length=16, blank=True, default="")
    car_info = models.JSONField(default=dict, blank=True)
    table = models.ForeignKey(DiningTable, on_delete=models.PROTECT, related_name="orders", null=True, blank=True)
    seats_count = models.PositiveIntegerField(default=0)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="orders", null=True, blank=True)
    address = models.ForeignKey(Address, on_delete=models.PROTECT, related_name="orders", null=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    excise_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    service_charge_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    offline_created_at = models.DateTimeField()
    submitted_at = models.DateTimeField(blank=True, null=True)
    notes = models.CharField(max_length=512, blank=True, default="")

    class Meta:
        unique_together = ("device", "local_id")
        indexes = [
            models.Index(fields=["branch", "status"]),
            models.Index(fields=["branch", "created_at"]),
            models.Index(fields=["branch", "pickup_window_status"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["branch", "order_number"], name="uniq_pos_order_number_per_branch"),
        ]


class OrderChannelSnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(PosOrder, on_delete=models.CASCADE, related_name="channel_snapshot")
    payload = models.JSONField(default=dict)
    config_version = models.BigIntegerField(default=0)


class PosOrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(PosOrder, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT, related_name="order_items")
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    unit_price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    excise_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_amount_snapshot = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    modifiers_snapshot_json = models.JSONField(default=list, blank=True)
    notes = models.CharField(max_length=512, blank=True, default="")


class PreOrderSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(PosOrder, on_delete=models.CASCADE, related_name="preorder_schedule")
    scheduled_at = models.DateTimeField()
    window_minutes = models.PositiveIntegerField(default=15)


class DeliveryAssignment(TimestampedModel):
    class DeliveryStatus(models.TextChoices):
        ASSIGNED = "assigned", "assigned"
        PICKED = "picked", "picked"
        DELIVERED = "delivered", "delivered"
        RETURNED = "returned", "returned"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.OneToOneField(PosOrder, on_delete=models.CASCADE, related_name="delivery_assignment")
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="assignments")
    status = models.CharField(max_length=16, choices=DeliveryStatus.choices, default=DeliveryStatus.ASSIGNED)
    assigned_at = models.DateTimeField(default=timezone.now)


class DeliveryProvider(TimestampedModel):
    class AuthType(models.TextChoices):
        API_KEY = "api_key", "api_key"
        HMAC = "hmac", "hmac"
        OAUTH = "oauth", "oauth"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    auth_type = models.CharField(max_length=16, choices=AuthType.choices, default=AuthType.API_KEY)
    base_url = models.CharField(max_length=512, blank=True, default="")
    endpoints_json = models.JSONField(default=dict, blank=True)
    secrets_json = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.name


class ProviderStoreMapping(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(DeliveryProvider, on_delete=models.CASCADE, related_name="store_mappings")
    provider_store_id = models.CharField(max_length=128)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="provider_store_mappings")

    class Meta:
        unique_together = ("provider", "provider_store_id")


class ProviderItemMapping(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(DeliveryProvider, on_delete=models.CASCADE, related_name="item_mappings")
    provider_item_id = models.CharField(max_length=128)
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE, related_name="provider_item_mappings")

    class Meta:
        unique_together = ("provider", "provider_item_id")


class ExternalOrder(TimestampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.ForeignKey(DeliveryProvider, on_delete=models.PROTECT, related_name="external_orders")
    provider_order_id = models.CharField(max_length=128)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="external_orders")
    status_external = models.CharField(max_length=32, default="")
    raw_payload = models.JSONField(default=dict, blank=True)
    mapped_order = models.OneToOneField(
        PosOrder,
        on_delete=models.SET_NULL,
        related_name="external_order",
        null=True,
        blank=True,
    )
    last_error = models.TextField(blank=True, default="")
    last_synced_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        unique_together = ("provider", "provider_order_id")
        indexes = [
            models.Index(fields=["branch", "created_at"]),
            models.Index(fields=["branch", "status_external"]),
        ]


class ExternalOrderEvent(models.Model):
    class EventType(models.TextChoices):
        WEBHOOK_RECEIVED = "webhook_received", "webhook_received"
        OUTBOUND_READY_SENT = "outbound_ready_sent", "outbound_ready_sent"
        FAILED = "failed", "failed"
        RETRY = "retry", "retry"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    external_order = models.ForeignKey(ExternalOrder, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=32, choices=EventType.choices)
    payload = models.JSONField(default=dict, blank=True)
    response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]


class WhatsAppMessageLog(TimestampedModel):
    class EventType(models.TextChoices):
        ORDER_CREATED = "order_created", "order_created"
        ORDER_STATUS_CHANGED = "order_status_changed", "order_status_changed"

    class DeliveryStatus(models.TextChoices):
        PENDING = "pending", "pending"
        SENT = "sent", "sent"
        FAILED = "failed", "failed"
        SKIPPED = "skipped", "skipped"
        DELIVERED = "delivered", "delivered"
        READ = "read", "read"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(PosOrder, on_delete=models.CASCADE, related_name="whatsapp_logs")
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="whatsapp_logs")
    phone_number = models.CharField(max_length=32, blank=True, default="", db_index=True)
    event_type = models.CharField(max_length=32, choices=EventType.choices, db_index=True)
    template_name = models.CharField(max_length=128, blank=True, default="")
    status = models.CharField(max_length=16, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    response_code = models.PositiveIntegerField(blank=True, null=True)
    response_body = models.JSONField(default=dict, blank=True)
    provider_message_id = models.CharField(max_length=255, blank=True, default="", db_index=True)
    error_message = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["order", "event_type", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]
        ordering = ["-created_at"]


class ExternalOutboundTask(TimestampedModel):
    class TaskStatus(models.TextChoices):
        PENDING = "pending", "pending"
        SUCCEEDED = "succeeded", "succeeded"
        FAILED = "failed", "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    external_order = models.ForeignKey(ExternalOrder, on_delete=models.CASCADE, related_name="outbound_tasks")
    action = models.CharField(max_length=64)
    payload = models.JSONField(default=dict, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    last_error = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=TaskStatus.choices, default=TaskStatus.PENDING)

    class Meta:
        indexes = [
            models.Index(fields=["status", "next_attempt_at"]),
        ]


class ErpOffer(TimestampedModel):
    class DiscountType(models.TextChoices):
        PERCENT = "percent", "percent"
        FIXED = "fixed", "fixed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="erp_offers")
    external_id = models.CharField(max_length=128)
    title = models.CharField(max_length=255)
    description = models.CharField(max_length=512, blank=True, default="")
    discount_type = models.CharField(max_length=16, choices=DiscountType.choices, default=DiscountType.PERCENT)
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    min_order_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    max_discount_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    starts_at = models.DateTimeField(blank=True, null=True)
    ends_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    stackable = models.BooleanField(default=False)
    applies_to = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    last_synced_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ("branch", "external_id")
        indexes = [
            models.Index(fields=["branch", "is_active"]),
            models.Index(fields=["branch", "last_synced_at"]),
        ]


class ErpCoupon(TimestampedModel):
    class DiscountType(models.TextChoices):
        PERCENT = "percent", "percent"
        FIXED = "fixed", "fixed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="erp_coupons")
    external_id = models.CharField(max_length=128)
    code = models.CharField(max_length=64)
    title = models.CharField(max_length=255)
    description = models.CharField(max_length=512, blank=True, default="")
    discount_type = models.CharField(max_length=16, choices=DiscountType.choices, default=DiscountType.PERCENT)
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    min_order_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    max_discount_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    usage_limit = models.PositiveIntegerField(default=0)
    per_customer_limit = models.PositiveIntegerField(default=0)
    starts_at = models.DateTimeField(blank=True, null=True)
    ends_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    last_synced_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = (
            ("branch", "external_id"),
            ("branch", "code"),
        )
        indexes = [
            models.Index(fields=["branch", "is_active"]),
            models.Index(fields=["branch", "code"]),
            models.Index(fields=["branch", "last_synced_at"]),
        ]


class Payment(TimestampedModel):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "cash"
        CARD = "card", "card"
        WALLET = "wallet", "wallet"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(PosOrder, on_delete=models.CASCADE, related_name="payments")
    shift = models.ForeignKey("Shift", on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    idempotency_key = models.CharField(max_length=128, db_index=True)
    method = models.CharField(max_length=16, choices=PaymentMethod.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateTimeField(default=timezone.now)
    reference_no = models.CharField(max_length=128, blank=True, default="")

    class Meta:
        unique_together = ("order", "idempotency_key")


class Refund(TimestampedModel):
    class RefundType(models.TextChoices):
        FULL = "full", "full"
        PARTIAL = "partial", "partial"

    class RefundMethod(models.TextChoices):
        CASH = "cash", "cash"
        CARD = "card", "card"
        WALLET = "wallet", "wallet"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(PosOrder, on_delete=models.CASCADE, related_name="refunds")
    shift = models.ForeignKey("Shift", on_delete=models.SET_NULL, null=True, blank=True, related_name="refunds")
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="processed_refunds")
    idempotency_key = models.CharField(max_length=128, db_index=True)
    refund_type = models.CharField(max_length=16, choices=RefundType.choices, default=RefundType.PARTIAL)
    method = models.CharField(max_length=16, choices=RefundMethod.choices, default=RefundMethod.CASH)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=512, blank=True, default="")
    reference_no = models.CharField(max_length=128, blank=True, default="")
    manager_pin_last4 = models.CharField(max_length=4, blank=True, default="")

    class Meta:
        unique_together = ("order", "idempotency_key")


class RefundItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    refund = models.ForeignKey(Refund, on_delete=models.CASCADE, related_name="items")
    order_item = models.ForeignKey(PosOrderItem, on_delete=models.PROTECT, related_name="refund_items")
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    subtotal_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    excise_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))


class PrintJob(TimestampedModel):
    class JobType(models.TextChoices):
        RECEIPT = "receipt", "receipt"
        KITCHEN = "kitchen", "kitchen"

    class JobStatus(models.TextChoices):
        PENDING = "pending", "pending"
        SENT = "sent", "sent"
        FAILED = "failed", "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        PosOrder,
        on_delete=models.CASCADE,
        related_name="print_jobs",
        null=True,
        blank=True,
    )
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="print_jobs")
    job_type = models.CharField(max_length=32, choices=JobType.choices, default=JobType.RECEIPT)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=JobStatus.choices, default=JobStatus.PENDING)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(blank=True, null=True)


class DeviceHealthCheck(TimestampedModel):
    class OverallStatus(models.TextChoices):
        PASS = "pass", "pass"
        WARN = "warn", "warn"
        FAIL = "fail", "fail"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="device_checks")
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="device_checks")
    shift = models.ForeignKey("Shift", on_delete=models.SET_NULL, null=True, blank=True, related_name="device_checks")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    overall_status = models.CharField(max_length=8, choices=OverallStatus.choices, default=OverallStatus.PASS)
    checks = models.JSONField(default=list, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "created_at"]),
            models.Index(fields=["device", "created_at"]),
        ]


class Shift(TimestampedModel):
    class ShiftStatus(models.TextChoices):
        OPEN = "open", "open"
        CLOSED = "closed", "closed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="shifts")
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="shifts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="shifts")
    status = models.CharField(max_length=16, choices=ShiftStatus.choices, default=ShiftStatus.OPEN)
    shift_number = models.CharField(max_length=32, blank=True, default="", db_index=True)
    opening_cash = models.DecimalField(max_digits=12, decimal_places=2)
    closing_cash = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    variance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    opened_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(blank=True, null=True)


class CashMovement(TimestampedModel):
    class MovementType(models.TextChoices):
        PAID_IN = "paid_in", "paid_in"
        PAID_OUT = "paid_out", "paid_out"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE, related_name="cash_movements")
    movement_type = models.CharField(max_length=16, choices=MovementType.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255)


class IdempotencyKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    endpoint = models.CharField(max_length=128)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="idempotency_keys")
    key = models.CharField(max_length=128)
    request_hash = models.CharField(max_length=128, blank=True, default="")
    response_code = models.PositiveIntegerField(default=200)
    response_body = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        unique_together = ("endpoint", "device", "key")


class SyncReceipt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="sync_receipts")
    entity_type = models.CharField(max_length=64)
    local_id = models.CharField(max_length=128)
    server_id = models.CharField(max_length=128)
    synced_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ("device", "entity_type", "local_id")
        indexes = [models.Index(fields=["device", "synced_at"])]


class KdsItem(TimestampedModel):
    class KdsStatus(models.TextChoices):
        NEW = "new", "new"
        PREPARING = "preparing", "preparing"
        READY = "ready", "ready"
        SERVED = "served", "served"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(PosOrder, on_delete=models.CASCADE, related_name="kds_items")
    order_item = models.ForeignKey(PosOrderItem, on_delete=models.CASCADE, related_name="kds_entries")
    station = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=KdsStatus.choices, default=KdsStatus.NEW)
    status_at = models.DateTimeField(default=timezone.now)
