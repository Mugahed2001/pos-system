# Generated manually for workflow
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("pos", "0007_order_payment_shift"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkflowDefinition",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("code", models.CharField(max_length=64)),
                ("name", models.CharField(max_length=255)),
                ("trigger", models.CharField(default="manual", max_length=64)),
                ("version", models.PositiveIntegerField(default=1)),
                ("is_active", models.BooleanField(default=True)),
                ("priority", models.IntegerField(default=100)),
                ("definition", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="workflow_definitions", to="pos.branch")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workflow_definitions", to="pos.company")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="WorkflowExecution",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("entity_type", models.CharField(max_length=64)),
                ("entity_id", models.CharField(max_length=128)),
                ("status", models.CharField(choices=[("running", "running"), ("succeeded", "succeeded"), ("failed", "failed")], default="running", max_length=16)),
                ("input_context", models.JSONField(blank=True, default=dict)),
                ("output_context", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True, default="")),
                ("started_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("branch", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="workflow_executions", to="pos.branch")),
                ("workflow", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="executions", to="workflow.workflowdefinition")),
            ],
        ),
        migrations.CreateModel(
            name="WorkflowStepLog",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("step_code", models.CharField(max_length=64)),
                ("order_no", models.PositiveIntegerField(default=0)),
                ("status", models.CharField(default="succeeded", max_length=16)),
                ("input_snapshot", models.JSONField(blank=True, default=dict)),
                ("output_snapshot", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True, default="")),
                ("duration_ms", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("execution", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="step_logs", to="workflow.workflowexecution")),
            ],
        ),
        migrations.AddConstraint(model_name="workflowdefinition", constraint=models.UniqueConstraint(fields=("company", "branch", "code", "version"), name="uniq_workflow_code_version")),
        migrations.AddIndex(model_name="workflowdefinition", index=models.Index(fields=["company", "branch", "code", "is_active"], name="workflow_wo_company_c74c35_idx")),
        migrations.AddIndex(model_name="workflowdefinition", index=models.Index(fields=["priority"], name="workflow_wo_priorit_8f4ca8_idx")),
        migrations.AddIndex(model_name="workflowexecution", index=models.Index(fields=["branch", "entity_type", "entity_id", "started_at"], name="workflow_wo_branch__1f40e7_idx")),
        migrations.AddIndex(model_name="workflowexecution", index=models.Index(fields=["status", "started_at"], name="workflow_wo_status_2b3212_idx")),
        migrations.AddIndex(model_name="workflowsteplog", index=models.Index(fields=["execution", "order_no"], name="workflow_wo_executi_9fa5a0_idx")),
    ]
