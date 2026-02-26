import uuid

from django.db import models
from django.utils import timezone


if hasattr(models, "GeneratedField"):
    TRANSACTION_LINE_TOTAL_FIELD = models.GeneratedField(
        expression=(
            (models.F("quantity") * models.F("unit_price"))
            - models.F("discount_amount")
            + models.F("tax_amount")
        ),
        output_field=models.DecimalField(max_digits=12, decimal_places=2),
        db_persist=True,
        db_column="LINE_TOTAL",
    )
else:
    TRANSACTION_LINE_TOTAL_FIELD = models.DecimalField(
        db_column="LINE_TOTAL",
        max_digits=12,
        decimal_places=2,
        blank=True,
        null=True,
        editable=False,
    )


class PaymentMethod(models.Model):
    method_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="METHOD_ID",
    )
    name = models.TextField(db_column="NAME")

    class Meta:
        managed = False
        db_table = "PAYMENT_METHODS"


class TransactionStatus(models.Model):
    status_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="STATUS_ID",
    )
    code = models.TextField(db_column="CODE")
    name = models.TextField(db_column="NAME", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "TRANSACTION_STATUS"


class Transaction(models.Model):
    transaction_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="TRANSACTION_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    location = models.ForeignKey(
        "tenants.Location",
        db_column="LOCATION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    station = models.ForeignKey(
        "tenants.BranchStation",
        db_column="STATION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    user = models.ForeignKey(
        "security.FndUser",
        db_column="USER_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    customer = models.ForeignKey(
        "customers.Customer",
        db_column="CUSTOMER_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    trx_number = models.TextField(db_column="TRX_NUMBER")
    trx_date = models.DateTimeField(
        db_column="TRX_DATE",
        default=timezone.now,
        blank=True,
        null=True,
    )
    status = models.ForeignKey(
        "transactions.TransactionStatus",
        db_column="STATUS_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    total_amount = models.DecimalField(
        db_column="TOTAL_AMOUNT",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    total_tax = models.DecimalField(
        db_column="TOTAL_TAX",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    total_discount = models.DecimalField(
        db_column="TOTAL_DISCOUNT",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    notes = models.TextField(db_column="NOTES", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "TRANSACTIONS"


class TransactionLine(models.Model):
    line_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LINE_ID",
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        db_column="TRANSACTION_ID",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    item = models.ForeignKey(
        "catalog.Item",
        db_column="ITEM_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    uom = models.ForeignKey(
        "catalog.Uom",
        db_column="UOM_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    quantity = models.DecimalField(
        db_column="QUANTITY",
        max_digits=12,
        decimal_places=3,
    )
    unit_price = models.DecimalField(
        db_column="UNIT_PRICE",
        max_digits=12,
        decimal_places=2,
    )
    discount_amount = models.DecimalField(
        db_column="DISCOUNT_AMOUNT",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    tax_amount = models.DecimalField(
        db_column="TAX_AMOUNT",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    line_total = TRANSACTION_LINE_TOTAL_FIELD

    class Meta:
        managed = False
        db_table = "TRANSACTION_LINES"


class TransactionTaxDetail(models.Model):
    tax_detail_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="TAX_DETAIL_ID",
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        db_column="TRANSACTION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    tax_type = models.ForeignKey(
        "taxes.TaxType",
        db_column="TAX_TYPE_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    taxable_amount = models.DecimalField(
        db_column="TAXABLE_AMOUNT",
        max_digits=12,
        decimal_places=2,
        blank=True,
        null=True,
    )
    tax_amount = models.DecimalField(
        db_column="TAX_AMOUNT",
        max_digits=12,
        decimal_places=2,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "TRANSACTION_TAX_DETAILS"


class TransactionComment(models.Model):
    comment_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="COMMENT_ID",
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        db_column="TRANSACTION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    comment_text = models.TextField(db_column="COMMENT_TEXT", blank=True, null=True)
    created_by = models.ForeignKey(
        "security.FndUser",
        db_column="CREATED_BY",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "TRANSACTION_COMMENTS"
