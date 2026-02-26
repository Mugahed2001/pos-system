from rest_framework import serializers

from .models import Customer, Discount, DiscountPolicy, RewardPoint


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "customer_id",
            "subsidiary",
            "name",
            "phone",
            "email",
            "vat_number",
        ]
        read_only_fields = ["customer_id"]


class RewardPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = RewardPoint
        fields = [
            "reward_id",
            "customer",
            "points_balance",
            "last_updated",
        ]
        read_only_fields = ["reward_id", "last_updated"]


class DiscountPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscountPolicy
        fields = [
            "policy_id",
            "subsidiary",
            "name",
            "is_active",
        ]
        read_only_fields = ["policy_id"]


class DiscountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Discount
        fields = [
            "discount_id",
            "policy",
            "code",
            "discount_type",
            "value",
        ]
        read_only_fields = ["discount_id"]
