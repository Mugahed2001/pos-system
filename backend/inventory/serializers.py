from rest_framework import serializers

from .models import (
    Bin,
    TransactionInventoryBatch,
    TransactionInventoryDetail,
    XxItemSerialNumber,
)


class BinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bin
        fields = [
            "bin_id",
            "location",
            "bin_code",
        ]
        read_only_fields = ["bin_id"]


class TransactionInventoryDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionInventoryDetail
        fields = [
            "detail_id",
            "location",
            "item",
            "quantity_on_hand",
            "reserved_quantity",
            "last_updated",
        ]
        read_only_fields = ["detail_id", "last_updated"]


class TransactionInventoryBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionInventoryBatch
        fields = [
            "batch_id",
            "item",
            "location",
            "batch_number",
            "expiry_date",
            "quantity",
        ]
        read_only_fields = ["batch_id"]


class XxItemSerialNumberSerializer(serializers.ModelSerializer):
    class Meta:
        model = XxItemSerialNumber
        fields = [
            "serial_id",
            "item",
            "serial_number",
            "status",
        ]
        read_only_fields = ["serial_id"]
