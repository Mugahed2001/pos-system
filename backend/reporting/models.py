import uuid

from django.db import models


class FndReportParameter(models.Model):
    param_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="PARAM_ID",
    )
    report_name = models.TextField(db_column="REPORT_NAME", blank=True, null=True)
    param_key = models.TextField(db_column="PARAM_KEY", blank=True, null=True)
    param_label = models.TextField(db_column="PARAM_LABEL", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "FND_REPORT_PARAMETERS"


# View without a natural primary key; Django requires one field marked as PK.
class VDailySalesSummary(models.Model):
    subsidiary_id = models.UUIDField(primary_key=True, db_column="SUBSIDIARY_ID")
    branch_name = models.TextField(db_column="BRANCH_NAME")
    sale_date = models.DateField(db_column="SALE_DATE")
    total_invoices = models.BigIntegerField(db_column="TOTAL_INVOICES")
    total_revenue = models.DecimalField(
        db_column="TOTAL_REVENUE",
        max_digits=18,
        decimal_places=2,
    )
    total_vat = models.DecimalField(
        db_column="TOTAL_VAT",
        max_digits=18,
        decimal_places=2,
    )

    class Meta:
        managed = False
        db_table = "V_DAILY_SALES_SUMMARY"
        unique_together = (("subsidiary_id", "branch_name", "sale_date"),)
