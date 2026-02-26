import hashlib
import json
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from pos.models import Branch, Company


class ConfigStatus(models.TextChoices):
    DRAFT = "draft", "draft"
    PUBLISHED = "published", "published"
    ROLLED_BACK = "rolled_back", "rolled_back"
    ARCHIVED = "archived", "archived"


class ScopeType(models.TextChoices):
    COMPANY = "company", "company"
    BRANCH = "branch", "branch"
    CHANNEL = "channel", "channel"
    ROLE = "role", "role"


class ConfigDraft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="config_drafts")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="config_drafts", null=True, blank=True)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=16, choices=ConfigStatus.choices, default=ConfigStatus.DRAFT)
    payload = models.JSONField(default=dict, blank=True)
    checksum = models.CharField(max_length=64, blank=True, default="", db_index=True)
    base_version = models.BigIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_config_drafts",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_config_drafts",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "created_at"]),
            models.Index(fields=["branch", "status"]),
        ]

    def save(self, *args, **kwargs):
        canonical = json.dumps(self.payload or {}, sort_keys=True, separators=(",", ":"))
        self.checksum = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        super().save(*args, **kwargs)


class ConfigRelease(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="config_releases")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="config_releases")
    draft = models.ForeignKey(ConfigDraft, on_delete=models.PROTECT, related_name="releases")
    version = models.BigIntegerField(db_index=True)
    checksum = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    rolled_back_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rollback_children",
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["branch", "version"], name="uniq_config_release_version_per_branch"),
        ]
        indexes = [
            models.Index(fields=["branch", "is_active"]),
            models.Index(fields=["branch", "created_at"]),
        ]


class FeatureFlag(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="feature_flags")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="feature_flags", null=True, blank=True)
    key = models.CharField(max_length=128)
    scope_type = models.CharField(max_length=16, choices=ScopeType.choices, default=ScopeType.BRANCH)
    scope_value = models.CharField(max_length=128, blank=True, default="")
    enabled = models.BooleanField(default=True)
    priority = models.IntegerField(default=100)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "branch", "key", "scope_type", "scope_value"], name="uniq_feature_flag_scope"),
        ]
        indexes = [
            models.Index(fields=["company", "branch", "key"]),
            models.Index(fields=["priority"]),
        ]


class RuleDefinition(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="rules")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="rules", null=True, blank=True)
    name = models.CharField(max_length=255)
    enabled = models.BooleanField(default=True)
    priority = models.IntegerField(default=100)
    condition = models.JSONField(default=dict, blank=True)
    action = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "branch", "enabled"]),
            models.Index(fields=["priority"]),
        ]


class EffectiveConfigSnapshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="effective_configs")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="effective_configs")
    role_code = models.CharField(max_length=64, blank=True, default="")
    channel_code = models.CharField(max_length=32, blank=True, default="")
    config_version = models.BigIntegerField(default=0)
    checksum = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    generated_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["branch", "role_code", "channel_code", "config_version"], name="uniq_effective_config_snapshot"),
        ]
        indexes = [
            models.Index(fields=["branch", "generated_at"]),
        ]
