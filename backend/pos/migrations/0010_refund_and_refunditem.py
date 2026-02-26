from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0009_excise_tax_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Refund",
            fields=[
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("idempotency_key", models.CharField(db_index=True, max_length=128)),
                ("refund_type", models.CharField(choices=[("full", "full"), ("partial", "partial")], default="partial", max_length=16)),
                ("method", models.CharField(choices=[("cash", "cash"), ("card", "card"), ("wallet", "wallet")], default="cash", max_length=16)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("reason", models.CharField(blank=True, default="", max_length=512)),
                ("reference_no", models.CharField(blank=True, default="", max_length=128)),
                ("manager_pin_last4", models.CharField(blank=True, default="", max_length=4)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="refunds", to="pos.posorder")),
                ("processed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="processed_refunds", to=settings.AUTH_USER_MODEL)),
                ("shift", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="refunds", to="pos.shift")),
            ],
            options={
                "unique_together": {("order", "idempotency_key")},
            },
        ),
        migrations.CreateModel(
            name="RefundItem",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("quantity", models.DecimalField(decimal_places=3, max_digits=10)),
                ("subtotal_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("excise_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("tax_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("total_amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("order_item", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="refund_items", to="pos.posorderitem")),
                ("refund", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="pos.refund")),
            ],
        ),
    ]
