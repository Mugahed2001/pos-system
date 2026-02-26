from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0010_refund_and_refunditem"),
    ]

    operations = [
        migrations.AddField(
            model_name="posorder",
            name="kitchen_priority",
            field=models.CharField(
                choices=[("low", "low"), ("normal", "normal"), ("high", "high"), ("urgent", "urgent")],
                db_index=True,
                default="normal",
                max_length=16,
            ),
        ),
    ]
