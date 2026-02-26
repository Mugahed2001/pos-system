from django.contrib import admin

from . import models


@admin.register(models.Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "created_at")
    search_fields = ("name", "code")


@admin.register(models.Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "company", "timezone_name")
    search_fields = ("name", "code")
    list_filter = ("company",)


@admin.register(models.Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("display_name", "device_id", "branch", "is_active", "config_version", "last_seen")
    search_fields = ("display_name", "device_id", "token")
    list_filter = ("branch", "is_active")


@admin.register(models.OrderChannel)
class OrderChannelAdmin(admin.ModelAdmin):
    list_display = ("code", "display_name", "created_at")
    search_fields = ("code", "display_name")


@admin.register(models.ChannelConfig)
class ChannelConfigAdmin(admin.ModelAdmin):
    list_display = ("branch", "channel", "price_list", "tax_profile", "is_enabled", "allow_new_orders", "config_version")
    list_filter = ("branch", "channel", "is_enabled", "allow_new_orders")


@admin.register(models.Floor)
class FloorAdmin(admin.ModelAdmin):
    list_display = ("name", "branch", "sort_order")
    list_filter = ("branch",)


@admin.register(models.DiningTable)
class DiningTableAdmin(admin.ModelAdmin):
    list_display = ("code", "branch", "floor", "seats_count", "status")
    list_filter = ("branch", "floor", "status")


@admin.register(models.PosOrder)
class PosOrderAdmin(admin.ModelAdmin):
    list_display = ("id", "branch", "channel", "status", "grand_total", "offline_created_at", "created_at")
    search_fields = ("id", "local_id", "idempotency_key")
    list_filter = ("branch", "channel", "status")


@admin.register(models.Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("id", "order", "method", "amount", "paid_at")
    list_filter = ("method", "paid_at")


@admin.register(models.Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("id", "branch", "device", "user", "status", "opening_cash", "closing_cash", "opened_at", "closed_at")
    list_filter = ("branch", "status")


@admin.register(models.DeliveryProvider)
class DeliveryProviderAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active", "auth_type", "created_at")
    list_filter = ("is_active", "auth_type")
    search_fields = ("code", "name")


@admin.register(models.ProviderStoreMapping)
class ProviderStoreMappingAdmin(admin.ModelAdmin):
    list_display = ("provider", "provider_store_id", "branch", "created_at")
    list_filter = ("provider", "branch")
    search_fields = ("provider_store_id",)


@admin.register(models.ProviderItemMapping)
class ProviderItemMappingAdmin(admin.ModelAdmin):
    list_display = ("provider", "provider_item_id", "menu_item", "created_at")
    list_filter = ("provider",)
    search_fields = ("provider_item_id",)


@admin.register(models.ExternalOrder)
class ExternalOrderAdmin(admin.ModelAdmin):
    list_display = ("provider", "provider_order_id", "branch", "status_external", "mapped_order", "created_at")
    list_filter = ("provider", "branch", "status_external")
    search_fields = ("provider_order_id",)


@admin.register(models.ExternalOrderEvent)
class ExternalOrderEventAdmin(admin.ModelAdmin):
    list_display = ("external_order", "event_type", "created_at")
    list_filter = ("event_type",)


@admin.register(models.ExternalOutboundTask)
class ExternalOutboundTaskAdmin(admin.ModelAdmin):
    list_display = ("external_order", "action", "status", "attempts", "next_attempt_at")
    list_filter = ("status", "action")


@admin.register(models.WhatsAppMessageLog)
class WhatsAppMessageLogAdmin(admin.ModelAdmin):
    list_display = ("order", "event_type", "phone_number", "status", "template_name", "provider_message_id", "created_at")
    list_filter = ("event_type", "status")
    search_fields = ("order__id", "phone_number", "provider_message_id", "error_message")


@admin.register(models.ErpOffer)
class ErpOfferAdmin(admin.ModelAdmin):
    list_display = ("branch", "external_id", "title", "discount_type", "discount_value", "is_active", "last_synced_at")
    list_filter = ("branch", "is_active", "discount_type")
    search_fields = ("external_id", "title")


@admin.register(models.ErpCoupon)
class ErpCouponAdmin(admin.ModelAdmin):
    list_display = ("branch", "code", "title", "discount_type", "discount_value", "is_active", "last_synced_at")
    list_filter = ("branch", "is_active", "discount_type")
    search_fields = ("external_id", "code", "title")


@admin.register(models.AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "action", "entity", "entity_id", "actor", "device", "branch")
    search_fields = ("action", "entity", "entity_id", "reason")
    list_filter = ("branch", "action")
