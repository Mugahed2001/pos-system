import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from pos.models import Branch, Company


class WorkflowDefinition(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="workflow_definitions")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="workflow_definitions", null=True, blank=True)
    code = models.CharField(max_length=64)
    name = models.CharField(max_length=255)
    trigger = models.CharField(max_length=64, default="manual")
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=100)
    definition = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "branch", "code", "version"], name="uniq_workflow_code_version"),
        ]
        indexes = [
            models.Index(fields=["company", "branch", "code", "is_active"]),
            models.Index(fields=["priority"]),
        ]


class WorkflowExecution(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "running"
        SUCCEEDED = "succeeded", "succeeded"
        FAILED = "failed", "failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(WorkflowDefinition, on_delete=models.PROTECT, related_name="executions")
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="workflow_executions", null=True, blank=True)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=128)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING)
    input_context = models.JSONField(default=dict, blank=True)
    output_context = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(default=timezone.now, db_index=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["branch", "entity_type", "entity_id", "started_at"]),
            models.Index(fields=["status", "started_at"]),
        ]


class WorkflowStepLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    execution = models.ForeignKey(WorkflowExecution, on_delete=models.CASCADE, related_name="step_logs")
    step_code = models.CharField(max_length=64)
    order_no = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=16, default="succeeded")
    input_snapshot = models.JSONField(default=dict, blank=True)
    output_snapshot = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default="")
    duration_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["execution", "order_no"]),
        ]
