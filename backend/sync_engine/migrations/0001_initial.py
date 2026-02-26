# Generated manually for sync_engine
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("pos", "0007_order_payment_shift"),
    ]

    operations = [
        migrations.CreateModel(
            name="EntitySyncVersion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("entity_type", models.CharField(max_length=64)),
                ("entity_id", models.CharField(max_length=128)),
                ("current_version", models.BigIntegerField(default=0)),
                ("checksum", models.CharField(blank=True, default="", max_length=64)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="entity_sync_versions", to="pos.branch")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="entity_sync_versions", to="pos.company")),
            ],
        ),
        migrations.CreateModel(
            name="SyncCursor",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("stream", models.CharField(default="default", max_length=64)),
                ("last_event_created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("last_event_id", models.UUIDField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("device", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sync_cursors", to="pos.device")),
            ],
        ),
        migrations.CreateModel(
            name="SyncEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("direction", models.CharField(choices=[("inbound", "inbound"), ("outbound", "outbound")], max_length=8)),
                ("stream", models.CharField(db_index=True, default="default", max_length=64)),
                ("event_type", models.CharField(db_index=True, default="GENERIC", max_length=64)),
                ("entity_type", models.CharField(max_length=64)),
                ("entity_id", models.CharField(max_length=128)),
                ("operation", models.CharField(choices=[("create", "create"), ("update", "update"), ("delete", "delete"), ("patch", "patch")], default="patch", max_length=16)),
                ("idempotency_key", models.CharField(blank=True, default="", max_length=128)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("checksum", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                ("base_version", models.BigIntegerField(default=0)),
                ("version", models.BigIntegerField(default=0)),
                ("status", models.CharField(choices=[("pending", "pending"), ("applied", "applied"), ("conflict", "conflict"), ("failed", "failed")], db_index=True, default="pending", max_length=16)),
                ("error_code", models.CharField(blank=True, default="", max_length=64)),
                ("error_message", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sync_events", to="pos.branch")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sync_events", to="pos.company")),
                ("device", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sync_events", to="pos.device")),
            ],
        ),
        migrations.CreateModel(
            name="SyncConflict",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("entity_type", models.CharField(max_length=64)),
                ("entity_id", models.CharField(max_length=128)),
                ("reason", models.CharField(max_length=255)),
                ("server_version", models.BigIntegerField(default=0)),
                ("client_base_version", models.BigIntegerField(default=0)),
                ("server_payload", models.JSONField(blank=True, default=dict)),
                ("client_payload", models.JSONField(blank=True, default=dict)),
                ("resolution", models.CharField(choices=[("pending", "pending"), ("server_wins", "server_wins"), ("client_wins", "client_wins"), ("manual_merge", "manual_merge")], default="pending", max_length=16)),
                ("resolved_payload", models.JSONField(blank=True, default=dict)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sync_conflicts", to="pos.branch")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sync_conflicts", to="pos.company")),
                ("device", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sync_conflicts", to="pos.device")),
                ("event", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="conflict", to="sync_engine.syncevent")),
            ],
        ),
        migrations.AddIndex(model_name="entitysyncversion", index=models.Index(fields=["branch", "entity_type"], name="sync_engine__branch__f2606c_idx")),
        migrations.AddConstraint(model_name="entitysyncversion", constraint=models.UniqueConstraint(fields=("branch", "entity_type", "entity_id"), name="uniq_entity_sync_version")),
        migrations.AddIndex(model_name="syncevent", index=models.Index(fields=["branch", "direction", "created_at"], name="sync_engine_branch__6c0f8a_idx")),
        migrations.AddIndex(model_name="syncevent", index=models.Index(fields=["device", "stream", "created_at"], name="sync_engine_device__2776df_idx")),
        migrations.AddIndex(model_name="syncevent", index=models.Index(fields=["branch", "status", "created_at"], name="sync_engine_branch__50f7a2_idx")),
        migrations.AddConstraint(
            model_name="syncevent",
            constraint=models.UniqueConstraint(
                condition=~models.Q(idempotency_key=""),
                fields=("device", "idempotency_key", "direction"),
                name="uniq_sync_event_device_idempotency_direction",
            ),
        ),
        migrations.AddIndex(model_name="syncconflict", index=models.Index(fields=["branch", "resolution", "created_at"], name="sync_engine_branch__3b5d28_idx")),
        migrations.AddConstraint(model_name="synccursor", constraint=models.UniqueConstraint(fields=("device", "stream"), name="uniq_sync_cursor_device_stream")),
    ]
