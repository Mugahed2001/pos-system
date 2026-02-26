import hashlib
import json
import uuid

from django.db import models
from django.utils import timezone

from pos.models import Branch, Company, Device


class SyncDirection(models.TextChoices):
    INBOUND = "inbound", "inbound"
    OUTBOUND = "outbound", "outbound"


class SyncStatus(models.TextChoices):
    PENDING = "pending", "pending"
    APPLIED = "applied", "applied"
    CONFLICT = "conflict", "conflict"
    FAILED = "failed", "failed"


class SyncOperation(models.TextChoices):
    CREATE = "create", "create"
    UPDATE = "update", "update"
    DELETE = "delete", "delete"
    PATCH = "patch", "patch"


class SyncEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="sync_events")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="sync_events")
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True, related_name="sync_events")
    direction = models.CharField(max_length=8, choices=SyncDirection.choices)
    stream = models.CharField(max_length=64, default="default", db_index=True)
    event_type = models.CharField(max_length=64, default="GENERIC", db_index=True)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=128)
    operation = models.CharField(max_length=16, choices=SyncOperation.choices, default=SyncOperation.PATCH)
    idempotency_key = models.CharField(max_length=128, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    checksum = models.CharField(max_length=64, db_index=True, blank=True, default="")
    base_version = models.BigIntegerField(default=0)
    version = models.BigIntegerField(default=0)
    status = models.CharField(max_length=16, choices=SyncStatus.choices, default=SyncStatus.PENDING, db_index=True)
    error_code = models.CharField(max_length=64, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "direction", "created_at"]),
            models.Index(fields=["device", "stream", "created_at"]),
            models.Index(fields=["branch", "status", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["device", "idempotency_key", "direction"],
                condition=~models.Q(idempotency_key=""),
                name="uniq_sync_event_device_idempotency_direction",
            ),
        ]

    def save(self, *args, **kwargs):
        canonical = json.dumps(self.payload or {}, sort_keys=True, separators=(",", ":"))
        self.checksum = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        super().save(*args, **kwargs)


class EntitySyncVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="entity_sync_versions")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="entity_sync_versions")
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=128)
    current_version = models.BigIntegerField(default=0)
    checksum = models.CharField(max_length=64, default="", blank=True)
    payload = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["branch", "entity_type", "entity_id"], name="uniq_entity_sync_version"),
        ]
        indexes = [models.Index(fields=["branch", "entity_type"])]


class SyncConflict(models.Model):
    class Resolution(models.TextChoices):
        PENDING = "pending", "pending"
        SERVER_WINS = "server_wins", "server_wins"
        CLIENT_WINS = "client_wins", "client_wins"
        MANUAL_MERGE = "manual_merge", "manual_merge"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.OneToOneField(SyncEvent, on_delete=models.CASCADE, related_name="conflict")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="sync_conflicts")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="sync_conflicts")
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True, related_name="sync_conflicts")
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=128)
    reason = models.CharField(max_length=255)
    server_version = models.BigIntegerField(default=0)
    client_base_version = models.BigIntegerField(default=0)
    server_payload = models.JSONField(default=dict, blank=True)
    client_payload = models.JSONField(default=dict, blank=True)
    resolution = models.CharField(max_length=16, choices=Resolution.choices, default=Resolution.PENDING)
    resolved_payload = models.JSONField(default=dict, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "resolution", "created_at"]),
        ]


class SyncCursor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="sync_cursors")
    stream = models.CharField(max_length=64, default="default")
    last_event_created_at = models.DateTimeField(default=timezone.now)
    last_event_id = models.UUIDField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["device", "stream"], name="uniq_sync_cursor_device_stream"),
        ]
