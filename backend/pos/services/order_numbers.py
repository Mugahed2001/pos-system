from django.db import transaction

from pos.models import Branch, OrderNumberSequence


def get_next_order_number(branch: Branch) -> int:
    with transaction.atomic():
        seq, _ = OrderNumberSequence.objects.select_for_update().get_or_create(branch=branch)
        next_value = seq.next_number
        seq.next_number = next_value + 1
        seq.save(update_fields=["next_number", "updated_at"])
        return next_value
