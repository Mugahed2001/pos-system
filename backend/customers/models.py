import uuid

from django.db import models


class Customer(models.Model):
    customer_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="CUSTOMER_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME")
    phone = models.TextField(db_column="PHONE", blank=True, null=True)
    email = models.TextField(db_column="EMAIL", blank=True, null=True)
    vat_number = models.TextField(db_column="VAT_NUMBER", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "CUSTOMERS"


class RewardPoint(models.Model):
    reward_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="REWARD_ID",
    )
    customer = models.ForeignKey(
        "customers.Customer",
        db_column="CUSTOMER_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    points_balance = models.IntegerField(db_column="POINTS_BALANCE", default=0)
    last_updated = models.DateTimeField(
        db_column="LAST_UPDATED",
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "REWARD_POINTS"


class DiscountPolicy(models.Model):
    policy_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="POLICY_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME", blank=True, null=True)
    is_active = models.BooleanField(db_column="IS_ACTIVE", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "DISCOUNT_POLICIES"


class Discount(models.Model):
    discount_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="DISCOUNT_ID",
    )
    policy = models.ForeignKey(
        "customers.DiscountPolicy",
        db_column="POLICY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    code = models.TextField(db_column="CODE", blank=True, null=True)
    discount_type = models.TextField(db_column="TYPE", blank=True, null=True)
    value = models.DecimalField(
        db_column="VALUE",
        max_digits=12,
        decimal_places=2,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "DISCOUNTS"
