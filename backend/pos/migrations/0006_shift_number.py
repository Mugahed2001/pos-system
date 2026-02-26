from django.db import migrations, models


def _device_digit(device_id: str) -> str:
    digits = "".join(ch for ch in (device_id or "") if ch.isdigit())
    return digits[-1] if digits else "0"


def _build_shift_number(opened_at, device_digit: str, sequence: int) -> str:
    return f"{opened_at.year}{opened_at.month}{opened_at.day}{device_digit}{sequence:02d}"


def populate_shift_numbers(apps, schema_editor):
    Shift = apps.get_model("pos", "Shift")
    sequence_by_key = {}
    queryset = Shift.objects.select_related("device").order_by("opened_at", "created_at", "id")
    for shift in queryset.iterator():
        if shift.shift_number:
            continue
        local_date = shift.opened_at.date() if shift.opened_at else shift.created_at.date()
        key = (str(shift.branch_id), str(shift.device_id), local_date.isoformat())
        next_sequence = sequence_by_key.get(key, 0) + 1
        sequence_by_key[key] = next_sequence
        digit = _device_digit(getattr(shift.device, "device_id", ""))
        shift.shift_number = _build_shift_number(shift.opened_at or shift.created_at, digit, next_sequence)
        shift.save(update_fields=["shift_number"])


class Migration(migrations.Migration):

    dependencies = [
        ("pos", "0005_shift_start_device_checks"),
    ]

    operations = [
        migrations.AddField(
            model_name="shift",
            name="shift_number",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32),
        ),
        migrations.RunPython(populate_shift_numbers, migrations.RunPython.noop),
    ]
