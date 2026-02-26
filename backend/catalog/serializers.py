from rest_framework import serializers

from .models import Item, ItemCategory, Uom


class ItemCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCategory
        fields = [
            "category_id",
            "subsidiary",
            "name",
            "parent_category",
        ]


class UomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Uom
        fields = [
            "uom_id",
            "name",
            "code",
        ]


class ItemSerializer(serializers.ModelSerializer):
    current_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, allow_null=True)
    base_price = serializers.DecimalField(
        source="current_price",
        max_digits=12,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Item
        fields = [
            "item_id",
            "subsidiary",
            "category",
            "uom",
            "item_code",
            "item_name",
            "barcode",
            "description",
            "is_taxable",
            "created_at",
            "current_price",
            "base_price",
        ]
        read_only_fields = ["item_id", "created_at"]
