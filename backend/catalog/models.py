import uuid

from django.db import models
from django.utils import timezone


class Uom(models.Model):
    uom_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="UOM_ID",
    )
    name = models.TextField(db_column="NAME")
    code = models.TextField(db_column="CODE", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "UOM"


class UnitType(models.Model):
    unit_type_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="UNIT_TYPE_ID",
    )
    name = models.TextField(db_column="NAME", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "UNITS_TYPE"


class ItemCategory(models.Model):
    category_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="CATEGORY_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME")
    parent_category = models.ForeignKey(
        "catalog.ItemCategory",
        db_column="PARENT_CATEGORY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "ITEM_CATEGORY"


class Item(models.Model):
    item_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="ITEM_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    category = models.ForeignKey(
        "catalog.ItemCategory",
        db_column="CATEGORY_ID",
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
    item_code = models.TextField(db_column="ITEM_CODE")
    item_name = models.TextField(db_column="ITEM_NAME")
    barcode = models.TextField(db_column="BARCODE", blank=True, null=True)
    description = models.TextField(db_column="DESCRIPTION", blank=True, null=True)
    is_taxable = models.BooleanField(db_column="IS_TAXABLE", default=True)
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "ITEMS"


class ItemPriceList(models.Model):
    price_list_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="PRICE_LIST_ID",
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
    price = models.DecimalField(db_column="PRICE", max_digits=12, decimal_places=2)
    start_date = models.DateField(
        db_column="START_DATE",
        blank=True,
        null=True,
    )
    end_date = models.DateField(
        db_column="END_DATE",
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "ITEM_PRICE_LIST"


class FndLov(models.Model):
    lov_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LOV_ID",
    )
    code = models.TextField(db_column="CODE")
    name = models.TextField(db_column="NAME", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "FND_LOVS"


class FndLovValue(models.Model):
    value_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="VALUE_ID",
    )
    lov = models.ForeignKey(
        "catalog.FndLov",
        db_column="LOV_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    value = models.TextField(db_column="VALUE", blank=True, null=True)
    label = models.TextField(db_column="LABEL", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "FND_LOVS_VALUES"
