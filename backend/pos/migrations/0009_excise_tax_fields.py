from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("pos", "0008_rename_pos_deviceh_branch__f7c119_idx_pos_deviceh_branch__0f9c17_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="menuitem",
            name="excise_category",
            field=models.CharField(
                blank=True,
                choices=[
                    ("carbonated_drinks", "carbonated_drinks"),
                    ("sweetened_drinks", "sweetened_drinks"),
                    ("energy_drinks", "energy_drinks"),
                    ("tobacco_products", "tobacco_products"),
                    ("shisha", "shisha"),
                ],
                default="",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="posorder",
            name="excise_total",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
        migrations.AddField(
            model_name="posorderitem",
            name="excise_amount_snapshot",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=12),
        ),
    ]
