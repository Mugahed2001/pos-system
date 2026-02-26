import uuid

from django.db import models
from django.utils import timezone


class Bin(models.Model):
    bin_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="BIN_ID",
    )
    location = models.ForeignKey(
        "tenants.Location",
        db_column="LOCATION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    bin_code = models.TextField(db_column="BIN_CODE", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "BINS"


class TransactionInventoryDetail(models.Model):
    detail_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="DETAIL_ID",
    )
    location = models.ForeignKey(
        "tenants.Location",
        db_column="LOCATION_ID",
        on_delete=models.DO_NOTHING,
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
    quantity_on_hand = models.DecimalField(
        db_column="QUANTITY_ON_HAND",
        max_digits=12,
        decimal_places=3,
        default=0,
    )
    reserved_quantity = models.DecimalField(
        db_column="RESERVED_QUANTITY",
        max_digits=12,
        decimal_places=3,
        default=0,
    )
    last_updated = models.DateTimeField(
        db_column="LAST_UPDATED",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "TRANSACTION_INVENTORY_DETAILS"
        unique_together = (("location", "item"),)


class TransactionInventoryBatch(models.Model):
    batch_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="BATCH_ID",
    )
    item = models.ForeignKey(
        "catalog.Item",
        db_column="ITEM_ID",
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
    batch_number = models.TextField(db_column="BATCH_NUMBER")
    expiry_date = models.DateField(
        db_column="EXPIRY_DATE",
        blank=True,
        null=True,
    )
    quantity = models.DecimalField(
        db_column="QUANTITY",
        max_digits=12,
        decimal_places=3,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "TRANSACTION_INVENTORY_BATCH"


class XxItemSerialNumber(models.Model):
    serial_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="SERIAL_ID",
    )
    item = models.ForeignKey(
        "catalog.Item",
        db_column="ITEM_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    serial_number = models.TextField(db_column="SERIAL_NUMBER")
    status = models.TextField(db_column="STATUS", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "XX_ITEM_SERIAL_NUMBER"
