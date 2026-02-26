from django.utils import timezone

from pos.models import OrderChannel, PosOrder


class PickupWindowError(ValueError):
    pass


def _ensure_pickup_window(order: PosOrder) -> None:
    if order.channel.code != OrderChannel.ChannelCode.PICKUP_WINDOW and order.fulfillment_mode != PosOrder.FulfillmentMode.WINDOW:
        raise PickupWindowError("Order is not a pickup window order.")


def mark_arrived(order: PosOrder) -> PosOrder:
    _ensure_pickup_window(order)
    order.pickup_window_status = PosOrder.PickupWindowStatus.ARRIVED
    order.arrival_at = timezone.now()
    order.save(update_fields=["pickup_window_status", "arrival_at", "updated_at"])
    return order


def mark_ready(order: PosOrder) -> PosOrder:
    _ensure_pickup_window(order)
    order.pickup_window_status = PosOrder.PickupWindowStatus.READY
    order.ready_at = timezone.now()
    order.save(update_fields=["pickup_window_status", "ready_at", "updated_at"])
    return order


def mark_handed_over(order: PosOrder) -> PosOrder:
    _ensure_pickup_window(order)
    order.pickup_window_status = PosOrder.PickupWindowStatus.HANDED_OVER
    order.handed_over_at = timezone.now()
    order.save(update_fields=["pickup_window_status", "handed_over_at", "updated_at"])
    return order
