from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("pos", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrderNumberSequence",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("next_number", models.PositiveBigIntegerField(default=1)),
                (
                    "branch",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="order_number_sequence",
                        to="pos.branch",
                    ),
                ),
            ],
        ),
        migrations.AddField(
            model_name="posorder",
            name="order_number",
            field=models.PositiveBigIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="posorder",
            name="fulfillment_mode",
            field=models.CharField(
                choices=[("counter", "counter"), ("window", "window")],
                default="counter",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="posorder",
            name="pickup_window_status",
            field=models.CharField(
                choices=[
                    ("pending", "pending"),
                    ("arrived", "arrived"),
                    ("ready", "ready"),
                    ("handed_over", "handed_over"),
                ],
                default="pending",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="posorder",
            name="arrival_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="posorder",
            name="ready_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="posorder",
            name="handed_over_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="posorder",
            name="pickup_code",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddField(
            model_name="posorder",
            name="car_info",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddIndex(
            model_name="posorder",
            index=models.Index(fields=["branch", "pickup_window_status"], name="pos_posorde_branch__2a8d77_idx"),
        ),
        migrations.AddConstraint(
            model_name="posorder",
            constraint=models.UniqueConstraint(fields=["branch", "order_number"], name="uniq_pos_order_number_per_branch"),
        ),
        migrations.CreateModel(
            name="DeliveryProvider",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("code", models.CharField(max_length=64, unique=True)),
                ("name", models.CharField(max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "auth_type",
                    models.CharField(
                        choices=[("api_key", "api_key"), ("hmac", "hmac"), ("oauth", "oauth")],
                        default="api_key",
                        max_length=16,
                    ),
                ),
                ("base_url", models.CharField(blank=True, default="", max_length=512)),
                ("endpoints_json", models.JSONField(blank=True, default=dict)),
                ("secrets_json", models.JSONField(blank=True, default=dict)),
            ],
        ),
        migrations.CreateModel(
            name="ProviderStoreMapping",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("provider_store_id", models.CharField(max_length=128)),
                (
                    "branch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="provider_store_mappings",
                        to="pos.branch",
                    ),
                ),
                (
                    "provider",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="store_mappings",
                        to="pos.deliveryprovider",
                    ),
                ),
            ],
            options={
                "unique_together": {("provider", "provider_store_id")},
            },
        ),
        migrations.CreateModel(
            name="ProviderItemMapping",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("provider_item_id", models.CharField(max_length=128)),
                (
                    "menu_item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="provider_item_mappings",
                        to="pos.menuitem",
                    ),
                ),
                (
                    "provider",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="item_mappings",
                        to="pos.deliveryprovider",
                    ),
                ),
            ],
            options={
                "unique_together": {("provider", "provider_item_id")},
            },
        ),
        migrations.CreateModel(
            name="ExternalOrder",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("provider_order_id", models.CharField(max_length=128)),
                ("status_external", models.CharField(default="", max_length=32)),
                ("raw_payload", models.JSONField(blank=True, default=dict)),
                ("last_error", models.TextField(blank=True, default="")),
                ("last_synced_at", models.DateTimeField(blank=True, null=True)),
                (
                    "branch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="external_orders",
                        to="pos.branch",
                    ),
                ),
                (
                    "mapped_order",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="external_order",
                        to="pos.posorder",
                    ),
                ),
                (
                    "provider",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="external_orders",
                        to="pos.deliveryprovider",
                    ),
                ),
            ],
            options={
                "unique_together": {("provider", "provider_order_id")},
            },
        ),
        migrations.AddIndex(
            model_name="externalorder",
            index=models.Index(fields=["branch", "created_at"], name="pos_extern_branch__395b70_idx"),
        ),
        migrations.AddIndex(
            model_name="externalorder",
            index=models.Index(fields=["branch", "status_external"], name="pos_extern_branch__6ef0b2_idx"),
        ),
        migrations.CreateModel(
            name="ExternalOrderEvent",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("webhook_received", "webhook_received"),
                            ("outbound_ready_sent", "outbound_ready_sent"),
                            ("failed", "failed"),
                            ("retry", "retry"),
                        ],
                        max_length=32,
                    ),
                ),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("response", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                (
                    "external_order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="pos.externalorder",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="ExternalOutboundTask",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("action", models.CharField(max_length=64)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("attempts", models.PositiveIntegerField(default=0)),
                ("next_attempt_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("last_error", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "pending"), ("succeeded", "succeeded"), ("failed", "failed")],
                        default="pending",
                        max_length=16,
                    ),
                ),
                (
                    "external_order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="outbound_tasks",
                        to="pos.externalorder",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="externaloutboundtask",
            index=models.Index(fields=["status", "next_attempt_at"], name="pos_extern_status_8f4b0e_idx"),
        ),
    ]

