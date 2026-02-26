import uuid

from django.db import models
from django.utils import timezone


class FndRole(models.Model):
    role_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="ROLE_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    role_name = models.TextField(db_column="ROLE_NAME")
    description = models.TextField(db_column="DESCRIPTION", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "FND_ROLES"


class FndResponsibility(models.Model):
    responsibility_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="RESPONSIBILITY_ID",
    )
    code = models.TextField(db_column="CODE", unique=True)
    name = models.TextField(db_column="NAME", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "FND_RESPONSIBILITES"


# Composite PK in DB; Django requires a single primary key field.
class FndRoleResponsibility(models.Model):
    role = models.ForeignKey(
        "security.FndRole",
        db_column="ROLE_ID",
        on_delete=models.CASCADE,
        primary_key=True,
    )
    responsibility = models.ForeignKey(
        "security.FndResponsibility",
        db_column="RESPONSIBILITY_ID",
        on_delete=models.CASCADE,
    )

    class Meta:
        managed = False
        db_table = "FND_ROLES_RESPONSIBILITIES"
        unique_together = (("role", "responsibility"),)


class FndUser(models.Model):
    user_id = models.UUIDField(primary_key=True, db_column="USER_ID")
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    username = models.TextField(db_column="USERNAME", blank=True, null=True)
    full_name = models.TextField(db_column="FULL_NAME", blank=True, null=True)
    role = models.ForeignKey(
        "security.FndRole",
        db_column="ROLE_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    is_active = models.BooleanField(db_column="IS_ACTIVE", default=True)
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "FND_USERS"


class FndLoginLog(models.Model):
    log_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LOG_ID",
    )
    user = models.ForeignKey(
        "security.FndUser",
        db_column="USER_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    login_time = models.DateTimeField(
        db_column="LOGIN_TIME",
        default=timezone.now,
        blank=True,
        null=True,
    )
    ip_address = models.TextField(db_column="IP_ADDRESS", blank=True, null=True)
    device_info = models.TextField(db_column="DEVICE_INFO", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "FND_LOGIN_LOGS"
