import uuid

from django.db import models # pyright: ignore[reportMissingModuleSource]
from django.utils import timezone # pyright: ignore[reportMissingModuleSource]


class Subsidiary(models.Model):
    subsidiary_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="SUBSIDIARY_ID",
    )
    name = models.TextField(db_column="NAME")
    tax_number = models.TextField(db_column="TAX_NUMBER", blank=True, null=True)
    commercial_registration = models.TextField(
        db_column="COMMERCIAL_REGISTRATION",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "SUBSIDIARIES"


class Location(models.Model):
    location_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LOCATION_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME")
    address = models.TextField(db_column="ADDRESS", blank=True, null=True)
    is_active = models.BooleanField(db_column="IS_ACTIVE", default=True)

    class Meta:
        managed = False
        db_table = "LOCATIONS"


class Currency(models.Model):
    currency_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="CURRENCY_ID",
    )
    code = models.TextField(db_column="CODE")
    name = models.TextField(db_column="NAME", blank=True, null=True)
    symbol = models.TextField(db_column="SYMBOL", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "CURRENCIES"


class CurrencyRate(models.Model):
    rate_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="RATE_ID",
    )
    currency = models.ForeignKey(
        "tenants.Currency",
        db_column="CURRENCY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    rate = models.DecimalField(db_column="RATE", max_digits=18, decimal_places=6)
    effective_date = models.DateField(
        db_column="EFFECTIVE_DATE",
        default=timezone.localdate,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "CURRENCY_RATES"


class AddressBook(models.Model):
    address_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="ADDRESS_ID",
    )
    entity_id = models.UUIDField(db_column="ENTITY_ID", blank=True, null=True)
    entity_type = models.TextField(db_column="ENTITY_TYPE", blank=True, null=True)
    street = models.TextField(db_column="STREET", blank=True, null=True)
    city = models.TextField(db_column="CITY", blank=True, null=True)
    postal_code = models.TextField(db_column="POSTAL_CODE", blank=True, null=True)
    country = models.TextField(db_column="COUNTRY", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "ADDRESS_BOOK"


class BranchStation(models.Model):
    station_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="STATION_ID",
    )
    location = models.ForeignKey(
        "tenants.Location",
        db_column="LOCATION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME")
    mac_address = models.TextField(db_column="MAC_ADDRESS", blank=True, null=True)
    last_sync = models.DateTimeField(
        db_column="LAST_SYNC",
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "BRANCH_STATIONS"
