from rest_framework import serializers

from .models import AccountMove, AccountMoveLine, AccountPayment


class AccountMoveLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountMoveLine
        fields = [
            "line_id",
            "account",
            "customer",
            "label",
            "debit",
            "credit",
            "currency",
            "amount_currency",
            "maturity_date",
            "created_at",
        ]


class AccountMoveSerializer(serializers.ModelSerializer):
    lines = AccountMoveLineSerializer(many=True, read_only=True)

    class Meta:
        model = AccountMove
        fields = [
            "move_id",
            "subsidiary",
            "journal",
            "period",
            "transaction",
            "move_number",
            "move_date",
            "ref",
            "state",
            "created_by",
            "created_at",
            "posted_at",
            "total_debit",
            "total_credit",
            "amount_total",
            "currency",
            "lines",
        ]


class AccountPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountPayment
        fields = [
            "payment_id",
            "subsidiary",
            "journal",
            "payment_date",
            "amount",
            "currency",
            "payment_type",
            "partner_type",
            "customer",
            "transaction",
            "move",
            "state",
            "reference",
            "created_at",
            "posted_at",
        ]


class TransactionPostSerializer(serializers.Serializer):
    transaction_id = serializers.UUIDField()
