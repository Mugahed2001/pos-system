from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Sum
from django.utils import timezone
from rest_framework import serializers

from .models import (
    PaymentMethod,
    Transaction,
    TransactionComment,
    TransactionLine,
    TransactionStatus,
    TransactionTaxDetail,
)


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = [
            "method_id",
            "name",
        ]


class TransactionStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionStatus
        fields = [
            "status_id",
            "code",
            "name",
        ]


class TransactionLineSerializer(serializers.ModelSerializer):
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = TransactionLine
        fields = [
            "line_id",
            "transaction",
            "item",
            "uom",
            "quantity",
            "unit_price",
            "discount_amount",
            "tax_amount",
            "line_total",
        ]
        read_only_fields = [
            "line_id",
        ]

    def get_line_total(self, obj):
        if obj.line_total is not None:
            return obj.line_total
        qty = Decimal(obj.quantity or 0)
        unit_price = Decimal(obj.unit_price or 0)
        discount = Decimal(obj.discount_amount or 0)
        tax = Decimal(obj.tax_amount or 0)
        return (qty * unit_price) - discount + tax


class TransactionLineCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionLine
        fields = [
            "item",
            "uom",
            "quantity",
            "unit_price",
            "discount_amount",
            "tax_amount",
        ]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative.")
        return value

    def validate_discount_amount(self, value):
        if value is None:
            return value
        if value < 0:
            raise serializers.ValidationError("Discount amount cannot be negative.")
        return value

    def validate_tax_amount(self, value):
        if value is None:
            return value
        if value < 0:
            raise serializers.ValidationError("Tax amount cannot be negative.")
        return value


class TransactionTaxDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionTaxDetail
        fields = [
            "tax_detail_id",
            "transaction",
            "tax_type",
            "taxable_amount",
            "tax_amount",
        ]
        read_only_fields = ["tax_detail_id"]


class TransactionCommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionComment
        fields = [
            "comment_id",
            "transaction",
            "comment_text",
            "created_by",
        ]
        read_only_fields = ["comment_id"]


class TransactionListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "transaction_id",
            "subsidiary",
            "location",
            "station",
            "user",
            "customer",
            "trx_number",
            "trx_date",
            "status",
            "total_amount",
            "total_tax",
            "total_discount",
            "notes",
        ]


class TransactionDetailSerializer(serializers.ModelSerializer):
    lines = TransactionLineSerializer(many=True, read_only=True, source="transactionline_set")
    tax_details = TransactionTaxDetailSerializer(
        many=True, read_only=True, source="transactiontaxdetail_set"
    )
    comments = TransactionCommentSerializer(
        many=True, read_only=True, source="transactioncomment_set"
    )

    class Meta:
        model = Transaction
        fields = [
            "transaction_id",
            "subsidiary",
            "location",
            "station",
            "user",
            "customer",
            "trx_number",
            "trx_date",
            "status",
            "total_amount",
            "total_tax",
            "total_discount",
            "notes",
            "lines",
            "tax_details",
            "comments",
        ]


class TransactionCreateSerializer(serializers.ModelSerializer):
    lines = TransactionLineCreateSerializer(many=True, allow_empty=False)

    class Meta:
        model = Transaction
        fields = [
            "transaction_id",
            "subsidiary",
            "location",
            "station",
            "user",
            "customer",
            "trx_number",
            "trx_date",
            "status",
            "notes",
            "lines",
        ]
        read_only_fields = ["transaction_id"]

    @db_transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop("lines", [])

        trx_number = (validated_data.get("trx_number") or "").strip()
        if not trx_number:
            validated_data["trx_number"] = timezone.now().strftime("%y%m%d%H%M%S%f")

        trx = Transaction.objects.create(**validated_data)

        line_objects = []

        for line in lines_data:
            line_objects.append(
                TransactionLine(
                    transaction=trx,
                    item=line.get("item"),
                    uom=line.get("uom"),
                    quantity=line.get("quantity"),
                    unit_price=line.get("unit_price"),
                    discount_amount=line.get("discount_amount") or Decimal("0"),
                    tax_amount=line.get("tax_amount") or Decimal("0"),
                )
            )

        TransactionLine.objects.bulk_create(line_objects)

        line_total_expr = ExpressionWrapper(
            (F("quantity") * F("unit_price")) - F("discount_amount") + F("tax_amount"),
            output_field=DecimalField(max_digits=12, decimal_places=2),
        )
        totals = TransactionLine.objects.filter(transaction=trx).aggregate(
            total_amount=Sum(line_total_expr),
            total_tax=Sum("tax_amount"),
            total_discount=Sum("discount_amount"),
        )
        trx.total_amount = totals["total_amount"] or Decimal("0")
        trx.total_tax = totals["total_tax"] or Decimal("0")
        trx.total_discount = totals["total_discount"] or Decimal("0")
        trx.save(update_fields=["total_amount", "total_tax", "total_discount"])
        return trx


class TransactionCommentCreateSerializer(serializers.Serializer):
    comment_text = serializers.CharField(allow_blank=False, max_length=2000)
    created_by = serializers.UUIDField(required=False, allow_null=True)
