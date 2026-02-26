from django.db import migrations, models


def populate_shift_links(apps, schema_editor):
    PosOrder = apps.get_model("pos", "PosOrder")
    Payment = apps.get_model("pos", "Payment")
    Shift = apps.get_model("pos", "Shift")

    orders = PosOrder.objects.select_related("branch", "device", "user").filter(shift__isnull=True)
    for order in orders.iterator():
        match = (
            Shift.objects.filter(
                branch_id=order.branch_id,
                device_id=order.device_id,
                user_id=order.user_id,
                opened_at__lte=order.created_at,
            )
            .filter(models.Q(closed_at__isnull=True) | models.Q(closed_at__gte=order.created_at))
            .order_by("-opened_at")
            .first()
        )
        if match:
            order.shift_id = match.id
            order.save(update_fields=["shift"])

    payments = Payment.objects.select_related("order").filter(shift__isnull=True)
    for payment in payments.iterator():
        if payment.order_id and payment.order and payment.order.shift_id:
            payment.shift_id = payment.order.shift_id
            payment.save(update_fields=["shift"])


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0006_shift_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="posorder",
            name="shift",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="orders", to="pos.shift"),
        ),
        migrations.AddField(
            model_name="payment",
            name="shift",
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="payments", to="pos.shift"),
        ),
        migrations.RunPython(populate_shift_links, migrations.RunPython.noop),
    ]
