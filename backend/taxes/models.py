import uuid

from django.db import models


class TaxType(models.Model):
    tax_type_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="TAX_TYPE_ID",
    )
    name = models.TextField(db_column="NAME", blank=True, null=True)
    code = models.TextField(db_column="CODE", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "TAX_TYPES"


class TaxItem(models.Model):
    tax_item_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="TAX_ITEM_ID",
    )
    tax_type = models.ForeignKey(
        "taxes.TaxType",
        db_column="TAX_TYPE_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    rate = models.DecimalField(
        db_column="RATE",
        max_digits=5,
        decimal_places=2,
        default=15,
    )

    class Meta:
        managed = False
        db_table = "TAX_ITEMS"


class ZatcaOnboarding(models.Model):
    onboard_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="ONBOARD_ID",
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
    csr = models.TextField(db_column="CSR", blank=True, null=True)
    csid = models.TextField(db_column="CSID", blank=True, null=True)
    private_key = models.TextField(db_column="PRIVATE_KEY", blank=True, null=True)
    status = models.TextField(db_column="STATUS", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "ZATCA_ONBOARDING"


class TaxSaSetting(models.Model):
    setting_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="SETTING_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    street_name = models.TextField(db_column="STREET_NAME", blank=True, null=True)
    building_number = models.TextField(
        db_column="BUILDING_NUMBER",
        blank=True,
        null=True,
    )
    plot_identification = models.TextField(
        db_column="PLOT_IDENTIFICATION",
        blank=True,
        null=True,
    )
    city_subdivision = models.TextField(
        db_column="CITY_SUBDIVISION",
        blank=True,
        null=True,
    )
    postal_zone = models.TextField(db_column="POSTAL_ZONE", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "TAX_SA_SETTINGS"


class TaxSaDocument(models.Model):
    doc_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="DOC_ID",
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        db_column="TRANSACTION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    xml_content = models.TextField(db_column="XML_CONTENT", blank=True, null=True)
    hash_value = models.TextField(db_column="HASH", blank=True, null=True)
    qr_code = models.TextField(db_column="QR_CODE", blank=True, null=True)
    zatca_status = models.TextField(db_column="ZATCA_STATUS", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "TAX_SA_DOCUMENTS"
