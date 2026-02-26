from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0012_erpoffer_erpcoupon"),
    ]

    operations = [
        migrations.CreateModel(
            name="WhatsAppMessageLog",
            fields=[
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("phone_number", models.CharField(blank=True, db_index=True, default="", max_length=32)),
                ("event_type", models.CharField(choices=[("order_created", "order_created"), ("order_status_changed", "order_status_changed")], db_index=True, max_length=32)),
                ("template_name", models.CharField(blank=True, default="", max_length=128)),
                ("status", models.CharField(choices=[("pending", "pending"), ("sent", "sent"), ("failed", "failed"), ("skipped", "skipped"), ("delivered", "delivered"), ("read", "read")], db_index=True, default="pending", max_length=16)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("response_code", models.PositiveIntegerField(blank=True, null=True)),
                ("response_body", models.JSONField(blank=True, default=dict)),
                ("provider_message_id", models.CharField(blank=True, db_index=True, default="", max_length=255)),
                ("error_message", models.TextField(blank=True, default="")),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("customer", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="whatsapp_logs", to="pos.customer")),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="whatsapp_logs", to="pos.posorder")),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["order", "event_type", "created_at"], name="pos_whatsap_order_i_3b2706_idx"),
                    models.Index(fields=["status", "created_at"], name="pos_whatsap_status_548856_idx"),
                ],
            },
        ),
    ]
