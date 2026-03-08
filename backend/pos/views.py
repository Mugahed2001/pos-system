from decimal import Decimal

from django.contrib.auth import logout
from decimal import ROUND_HALF_UP
from django.conf import settings

from django.db import models, transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from pos.models import (
    AuditLog,
    Branch,
    CashMovement,
    ChannelConfig,
    ConfigVersion,
    DeliveryAssignment,
    DeliveryProvider,
    Device,
    DeviceHealthCheck,
    Driver,
    ExternalOrder,
    ExternalOrderEvent,
    ExternalOutboundTask,
    Floor,
    IdempotencyKey,
    KdsItem,
    MenuCategory,
    MenuItem,
    ModifierGroup,
    OrderChannel,
    Payment,
    Refund,
    RefundItem,
    PrintJob,
    PosOrder,
    PosOrderItem,
    ProviderItemMapping,
    ProviderStoreMapping,
    PriceList,
    ServiceChargeRule,
    Shift,
    SyncReceipt,
    TaxProfile,
    Customer,
    Address,
)
from pos.permissions import DeviceBranchScopedPermission, DeviceTokenPermission
from pos.serializers import (
    AuthLoginSerializer,
    AddressSerializer,
    CashMovementSerializer,
    CustomerSerializer,
    DeliveryProviderSerializer,
    DeliveryAssignmentSerializer,
    DeviceRegisterSerializer,
    DriverSerializer,
    ExternalOrderEventSerializer,
    ExternalOrderSerializer,
    ExternalOutboundTaskSerializer,
    ErpCouponSerializer,
    ErpOfferSerializer,
    ErpPromotionSyncSerializer,
    KdsStatusSerializer,
    MeSerializer,
    DeviceCheckItemSerializer,
    DeviceHealthCheckSerializer,
    OrderCreateSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    OrderStatusSerializer,
    OrderPrioritySerializer,
    OrderUpdateSerializer,
    PickupWindowOrderSerializer,
    ProviderItemMappingSerializer,
    ProviderStoreMappingSerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
    RefundCreateSerializer,
    RefundSerializer,
    PrintJobSerializer,
    ShiftCloseSerializer,
    ShiftOpenSerializer,
    SyncStatusSerializer,
    OrderAttachCustomerSerializer,
    build_login_response,
)
from pos.services import with_idempotency
from pos.services import (
    get_active_promotions,
    IntegrationError,
    PickupWindowError,
    create_or_update_external_order,
    enqueue_outbound_task,
    mark_arrived,
    mark_handed_over,
    mark_ready,
    refresh_order_snapshot,
    retry_outbound_task,
    send_ready_to_provider,
    send_order_whatsapp_notification,
    sync_whatsapp_delivery_status,
    sync_erp_promotions,
    verify_webhook,
)
from config_engine.services import broadcast_kds_event, broadcast_order_event


def _device_digit(device_id: str) -> str:
    digits = "".join(ch for ch in (device_id or "") if ch.isdigit())
    return digits[-1] if digits else "0"


def _build_shift_number(opened_at, device_id: str, sequence: int) -> str:
    return f"{opened_at.year}{opened_at.month}{opened_at.day}{_device_digit(device_id)}{sequence:02d}"


def _generate_shift_number(branch: Branch, device: Device, opened_at) -> str:
    local_date = opened_at.date()
    sequence = (
        Shift.objects.filter(
            branch=branch,
            device=device,
            opened_at__date=local_date,
        ).count()
        + 1
    )
    return _build_shift_number(opened_at, device.device_id, sequence)


def _numeric_shift_id(shift: Shift) -> str:
    return shift.shift_number or "".join(ch for ch in str(shift.id) if ch.isdigit())


def _broadcast_order_update(order: PosOrder, event: str, extra: dict | None = None) -> None:
    payload = {
        "event": event,
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": order.status,
        "kitchen_priority": order.kitchen_priority,
        "is_held": order.is_held,
    }
    if extra:
        payload.update(extra)
    broadcast_order_event(branch_id=str(order.branch_id), payload=payload)


KDS_COOK_ROLES = {"cook", "kitchen", "kitchen_staff"}
KDS_SUPERVISOR_ROLES = {"kitchen_supervisor", "supervisor", "manager", "kds_manager"}
KDS_WAITER_ROLES = {"waiter", "captain_waiter", "service_staff"}


def _user_role_codes(user) -> set[str]:
    if not user or not user.is_authenticated:
        return set()
    return {name.strip().lower() for name in user.groups.values_list("name", flat=True)}


def _can_update_kds_status(user, current_status: str, next_status: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True

    roles = _user_role_codes(user)
    cook_like = bool(roles & KDS_COOK_ROLES)
    supervisor_like = bool(roles & KDS_SUPERVISOR_ROLES)
    waiter_like = bool(roles & KDS_WAITER_ROLES)

    if current_status == KdsItem.KdsStatus.NEW and next_status == KdsItem.KdsStatus.PREPARING:
        return cook_like or supervisor_like
    if current_status == KdsItem.KdsStatus.PREPARING and next_status == KdsItem.KdsStatus.READY:
        return cook_like or supervisor_like
    if current_status == KdsItem.KdsStatus.READY and next_status == KdsItem.KdsStatus.SERVED:
        return waiter_like or supervisor_like
    return False


def _can_change_kds_priority(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    roles = _user_role_codes(user)
    return bool(roles & KDS_SUPERVISOR_ROLES)


def _q2(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _order_paid_total(order: PosOrder) -> Decimal:
    return order.payments.aggregate(total=models.Sum("amount")).get("total") or Decimal("0.00")


def _order_refunded_total(order: PosOrder) -> Decimal:
    return order.refunds.aggregate(total=models.Sum("amount")).get("total") or Decimal("0.00")


def _is_valid_erp_api_key(request) -> bool:
    configured = (getattr(settings, "POS_ERP_API_KEY", "") or "").strip()
    if not configured:
        return False
    received = (request.headers.get("X-ERP-API-Key") or "").strip()
    return bool(received and received == configured)


def _refresh_order_settlement_status(order: PosOrder) -> bool:
    paid_total = _order_paid_total(order)
    refunded_total = _order_refunded_total(order)
    net_paid = paid_total - refunded_total

    next_status = order.status
    if refunded_total > 0 and net_paid <= Decimal("0.00"):
        next_status = PosOrder.OrderStatus.REFUNDED
    elif paid_total >= order.grand_total:
        next_status = PosOrder.OrderStatus.PAID
    elif order.status in {PosOrder.OrderStatus.PAID, PosOrder.OrderStatus.REFUNDED}:
        next_status = PosOrder.OrderStatus.SUBMITTED

    if next_status != order.status:
        order.status = next_status
        order.save(update_fields=["status", "updated_at"])
        return True
    return False


def _schedule_whatsapp_notification(order: PosOrder, event_type: str) -> None:
    if getattr(order.channel, "code", "") != OrderChannel.ChannelCode.DELIVERY:
        return
    order_id = str(order.id)
    transaction.on_commit(lambda: send_order_whatsapp_notification(order_id=order_id, event_type=event_type))


class DeviceRegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DeviceRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device = serializer.save()
        return Response(
            {
                "device_id": device.device_id,
                "branch_id": str(device.branch_id),
                "token": device.token,
                "config_version": device.config_version,
            },
            status=status.HTTP_201_CREATED,
        )


class AuthLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AuthLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = build_login_response(serializer.validated_data["user"])
        return Response(data, status=status.HTTP_200_OK)


class AuthLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.auth:
            request.auth.delete()
        logout(request)
        return Response({"detail": "Logged out."}, status=status.HTTP_200_OK)


class AuthMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        payload = build_login_response(request.user)
        if request.auth:
            payload["token"] = getattr(request.auth, "key", payload["token"])
        serializer = MeSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)


class DeviceContextView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        current_device = getattr(request, "pos_device", None)
        branch_id = request.query_params.get("branch_id") or (str(current_device.branch_id) if current_device else None)
        branches = list(
            Branch.objects.order_by("name").values("id", "name", "code", "requires_opening_cash")
        )
        devices = []
        current_branch = None
        if branch_id:
            current_branch = Branch.objects.filter(id=branch_id).values("id", "name", "code", "requires_opening_cash").first()
            devices = list(
                Device.objects.filter(branch_id=branch_id, is_active=True).values(
                    "device_id",
                    "display_name",
                    "branch_id",
                )
            )
        return Response(
            {
                "current_device": {
                    "device_id": current_device.device_id,
                    "display_name": current_device.display_name,
                    "branch_id": str(current_device.branch_id),
                }
                if current_device
                else None,
                "current_branch": current_branch,
                "branches": branches,
                "devices": devices,
            }
        )


class DeviceSelectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeviceRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device = serializer.save()
        AuditLog.objects.create(
            actor=request.user,
            device=device,
            branch=device.branch,
            action="device_selected",
            entity="Device",
            entity_id=str(device.id),
            after_data={"device_id": device.device_id},
        )
        return Response(
            {
                "device_id": device.device_id,
                "branch_id": str(device.branch_id),
                "token": device.token,
                "config_version": device.config_version,
            },
            status=status.HTTP_200_OK,
        )


class PosConfigView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission, DeviceBranchScopedPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id") or str(request.pos_device.branch_id)
        since_version = int(request.query_params.get("since_version", "0") or "0")
        role_code = (request.query_params.get("role_code") or "").strip()
        channel_code = (request.query_params.get("channel_code") or "").strip()
        branch = Branch.objects.get(id=branch_id)

        current_version_obj, _ = ConfigVersion.objects.get_or_create(branch=branch, defaults={"version": 1})
        current_version = int(current_version_obj.version)
        has_delta = since_version < current_version

        if has_delta:
            from config_engine.services import materialize_effective_config

            payload = materialize_effective_config(
                branch=branch,
                role_code=role_code,
                channel_code=channel_code,
                context={},
            )
        else:
            payload = {
                "version": current_version,
                "branch": str(branch.id),
                "channels": [],
                "channel_configs": [],
                "floors": [],
                "tables": [],
                "menu_categories": [],
                "menu_items": [],
                "modifiers": [],
                "price_lists": [],
                "taxes": [],
                "service_charges": [],
                "discount_policies": [],
                "offers": [],
                "coupons": [],
            }
        offers, coupons = get_active_promotions(branch)
        payload["offers"] = ErpOfferSerializer(offers, many=True).data
        payload["coupons"] = ErpCouponSerializer(coupons, many=True).data
        request.pos_device.config_version = current_version
        request.pos_device.save(update_fields=["config_version", "updated_at"])
        request.pos_device.touch()
        return Response(payload, status=status.HTTP_200_OK)


class PosCustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]
    serializer_class = CustomerSerializer

    def get_queryset(self):
        branch_id = self.request.query_params.get("branch_id") or str(self.request.pos_device.branch_id)
        queryset = Customer.objects.filter(branch_id=branch_id)
        query = (self.request.query_params.get("q") or "").strip()
        if query:
            queryset = queryset.filter(models.Q(name__icontains=query) | models.Q(phone__icontains=query))
        return queryset.order_by("name")

    def perform_create(self, serializer):
        branch_id = self.request.data.get("branch") or str(self.request.pos_device.branch_id)
        branch = Branch.objects.get(id=branch_id)
        serializer.save(branch=branch)


class PosAddressViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]
    serializer_class = AddressSerializer

    def get_queryset(self):
        customer_id = self.kwargs["customer_id"]
        return Address.objects.filter(customer_id=customer_id).order_by("-updated_at")

    def perform_create(self, serializer):
        customer = Customer.objects.get(id=self.kwargs["customer_id"])
        serializer.save(customer=customer)


class PosConfigVersionView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission, DeviceBranchScopedPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id") or str(request.pos_device.branch_id)
        branch = Branch.objects.get(id=branch_id)
        obj, _ = ConfigVersion.objects.get_or_create(branch=branch, defaults={"version": 1})
        return Response({"branch_id": str(branch.id), "version": int(obj.version)})


class PosOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, DeviceTokenPermission, DeviceBranchScopedPermission]

    def get_queryset(self):
        queryset = PosOrder.objects.select_related("branch", "device", "channel", "table").prefetch_related(
            "items", "payments"
        )
        branch_id = self.request.query_params.get("branch_id") or str(self.request.pos_device.branch_id)
        queryset = queryset.filter(branch_id=branch_id)
        date_value = self.request.query_params.get("date")
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        status_value = self.request.query_params.get("status")
        if status_value:
            queryset = queryset.filter(status=status_value)
        held_value = self.request.query_params.get("held")
        if held_value in {"true", "false"}:
            queryset = queryset.filter(is_held=held_value == "true")
            if held_value == "true" and not status_value:
                queryset = queryset.filter(status=PosOrder.OrderStatus.DRAFT)
        channel_value = self.request.query_params.get("channel")
        if channel_value:
            queryset = queryset.filter(channel__code=channel_value)
        device_value = self.request.query_params.get("device_id")
        if device_value:
            queryset = queryset.filter(device__device_id=device_value)
        shift_value = self.request.query_params.get("shift_id")
        if shift_value:
            queryset = queryset.filter(shift_id=shift_value)
        user_value = self.request.query_params.get("user_id")
        if user_value:
            queryset = queryset.filter(user_id=user_value)
        query = (self.request.query_params.get("q") or "").strip()
        if query:
            filters = models.Q(local_id__icontains=query)
            if query.isdigit():
                filters = filters | models.Q(order_number=int(query))
            filters = filters | models.Q(customer__name__icontains=query) | models.Q(customer__phone__icontains=query)
            queryset = queryset.filter(filters)
        return queryset.order_by("-created_at")

    def get_serializer_class(self):
        if self.action in {"list"}:
            return OrderListSerializer
        if self.action in {"retrieve"}:
            return OrderDetailSerializer
        if self.action in {"create"}:
            return OrderCreateSerializer
        if self.action in {"partial_update"}:
            return OrderUpdateSerializer
        return OrderDetailSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        idempotency_key = validated["idempotency_key"]
        device = validated["device"]

        status_code, response_data = with_idempotency(
            endpoint="POST:/api/v1/pos/orders",
            device=device,
            key=idempotency_key,
            payload=request.data,
            create_response=lambda: self._create_order_response(serializer),
        )
        return Response(response_data, status=status_code)

    def _create_order_response(self, serializer):
        order = serializer.save()
        _broadcast_order_update(order, "created")
        _schedule_whatsapp_notification(order, "order_created")
        return status.HTTP_201_CREATED, {
            "id": str(order.id),
            "local_id": order.local_id,
            "status": order.status,
            "excise_total": str(order.excise_total),
            "grand_total": str(order.grand_total),
            "mapping": {
                "local_id": order.local_id,
                "server_id": str(order.id),
            },
        }

    def update(self, request, *args, **kwargs):
        return Response({"detail": "Use PATCH for order updates."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def partial_update(self, request, *args, **kwargs):
        order = self.get_object()
        serializer = OrderUpdateSerializer(order, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        _broadcast_order_update(order, "updated")
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk_create(self, request):
        orders_data = request.data.get("orders") or []
        if not isinstance(orders_data, list) or not orders_data:
            return Response({"detail": "orders list is required."}, status=status.HTTP_400_BAD_REQUEST)

        created = []
        conflicts = []
        for payload in orders_data:
            serializer = OrderCreateSerializer(data=payload, context={"request": request})
            serializer.is_valid(raise_exception=True)
            validated = serializer.validated_data
            key = validated["idempotency_key"]
            device = validated["device"]
            status_code, response_data = with_idempotency(
                endpoint="POST:/api/v1/pos/orders/bulk",
                device=device,
                key=key,
                payload=payload,
                create_response=lambda s=serializer: self._create_order_response(s),
            )
            if status_code == status.HTTP_201_CREATED:
                created.append(response_data)
            elif status_code == status.HTTP_409_CONFLICT:
                conflicts.append(response_data)
            else:
                created.append(response_data)

        return Response(
            {
                "created_count": len(created),
                "conflicts_count": len(conflicts),
                "results": created,
                "conflicts": conflicts,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="status")
    def status_update(self, request, pk=None):
        order = self.get_object()
        serializer = OrderStatusSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        order.status = serializer.validated_data["status"]
        if order.status == PosOrder.OrderStatus.SUBMITTED:
            order.submitted_at = timezone.now()
        if order.status in {PosOrder.OrderStatus.CANCELED, PosOrder.OrderStatus.REFUNDED}:
            # Canceled/refunded orders should not remain in held queues.
            order.is_held = False
            order.held_at = None
        order.save(update_fields=["status", "submitted_at", "is_held", "held_at", "updated_at"])
        _broadcast_order_update(order, "status_changed")
        _schedule_whatsapp_notification(order, "order_status_changed")
        return Response(OrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="priority")
    def priority_update(self, request, pk=None):
        order = self.get_object()
        if not _can_change_kds_priority(request.user):
            return Response({"detail": "Insufficient permissions for priority update."}, status=status.HTTP_403_FORBIDDEN)
        serializer = OrderPrioritySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order.kitchen_priority = serializer.validated_data["kitchen_priority"]
        order.save(update_fields=["kitchen_priority", "updated_at"])
        _broadcast_order_update(order, "priority_changed", {"kitchen_priority": order.kitchen_priority})
        broadcast_kds_event(
            branch_id=str(order.branch_id),
            payload={
                "event": "KDS_PRIORITY_CHANGED",
                "order_id": str(order.id),
                "order_number": order.order_number,
                "kitchen_priority": order.kitchen_priority,
            },
        )
        return Response({"id": str(order.id), "kitchen_priority": order.kitchen_priority}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        order = self.get_object()
        refresh_order_snapshot(order)
        order.status = PosOrder.OrderStatus.SUBMITTED
        order.submitted_at = timezone.now()
        order.save(update_fields=["status", "submitted_at", "updated_at"])
        for item in order.items.select_related("menu_item"):
            KdsItem.objects.get_or_create(
                order=order,
                order_item=item,
                defaults={"station": item.menu_item.kitchen_station, "status": KdsItem.KdsStatus.NEW},
            )
        _broadcast_order_update(order, "submitted")
        _schedule_whatsapp_notification(order, "order_status_changed")
        broadcast_kds_event(
            branch_id=str(order.branch_id),
            payload={
                "event": "KDS_QUEUE_REFRESH",
                "order_id": str(order.id),
                "order_number": order.order_number,
            },
        )
        return Response(OrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        request.data["status"] = PosOrder.OrderStatus.CANCELED
        return self.status_update(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="refund")
    def refund(self, request, pk=None):
        order = self.get_object()
        serializer = RefundCreateSerializer(
            data={
                "idempotency_key": request.data.get("idempotency_key") or f"legacy-refund-{timezone.now().timestamp()}",
                "reason": request.data.get("reason", ""),
                "manager_pin": request.data.get("manager_pin", ""),
                "refund_type": Refund.RefundType.FULL,
                "method": request.data.get("method") or Refund.RefundMethod.CASH,
                "reference_no": request.data.get("reference_no", ""),
            },
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        self._create_refund(order, data, request.user)
        order.refresh_from_db()
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post", "get"], url_path="refunds")
    def refunds(self, request, pk=None):
        order = self.get_object()
        if request.method == "GET":
            records = order.refunds.prefetch_related("items__order_item__menu_item").order_by("-created_at")
            return Response(RefundSerializer(records, many=True).data)

        serializer = RefundCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        refund = self._create_refund(order, serializer.validated_data, request.user)
        return Response(RefundSerializer(refund).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post", "get"], url_path="payments")
    def add_payment(self, request, pk=None):
        order = self.get_object()
        current_shift = (
            Shift.objects.filter(
                branch=order.branch,
                device=order.device,
                user=request.user,
                status=Shift.ShiftStatus.OPEN,
            )
            .order_by("-opened_at")
            .first()
        )
        if request.method == "GET":
            if not request.user.is_staff and order.shift_id and current_shift and order.shift_id != current_shift.id:
                return Response({"detail": "Payment list is only available for current shift orders."}, status=status.HTTP_403_FORBIDDEN)
            payments = Payment.objects.filter(order=order).order_by("-paid_at")
            return Response(PaymentSerializer(payments, many=True).data)
        if not current_shift:
            return Response(
                {"detail": "Open shift is required before processing payments."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.is_staff and order.shift_id and order.shift_id != current_shift.id:
            return Response(
                {"detail": "You can only process payments for orders in the current shift."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        refresh_order_snapshot(order)
        status_code, response_data = with_idempotency(
            endpoint=f"POST:/api/v1/pos/orders/{order.id}/payments",
            device=order.device,
            key=data["idempotency_key"],
            payload=request.data,
            create_response=lambda: self._create_payment_response(order, data, current_shift),
        )
        return Response(response_data, status=status_code)

    def _create_payment_response(self, order: PosOrder, data: dict, shift: Shift | None = None):
        payment = Payment.objects.create(
            order=order,
            shift=shift or order.shift,
            idempotency_key=data["idempotency_key"],
            method=data["method"],
            amount=data["amount"],
            reference_no=data.get("reference_no", ""),
        )
        status_changed = _refresh_order_settlement_status(order)
        _broadcast_order_update(
            order,
            "payment_added",
            extra={"payment_id": str(payment.id), "payment_method": payment.method, "amount": str(payment.amount)},
        )
        if status_changed:
            _schedule_whatsapp_notification(order, "order_status_changed")
        return status.HTTP_201_CREATED, {
            "id": str(payment.id),
            "order_id": str(order.id),
            "method": payment.method,
            "amount": str(payment.amount),
            "order_status": order.status,
        }

    def _create_refund(self, order: PosOrder, data: dict, actor) -> Refund:
        refresh_order_snapshot(order)
        if order.status in {PosOrder.OrderStatus.CANCELED, PosOrder.OrderStatus.DRAFT}:
            raise ValidationError("Only submitted/paid orders can be refunded.")

        paid_total = _order_paid_total(order)
        refunded_total = _order_refunded_total(order)
        refundable_balance = _q2(paid_total - refunded_total)
        if refundable_balance <= Decimal("0.00"):
            raise ValidationError("No refundable balance remaining.")

        current_shift = (
            Shift.objects.filter(
                branch=order.branch,
                device=order.device,
                user=actor,
                status=Shift.ShiftStatus.OPEN,
            )
            .order_by("-opened_at")
            .first()
        )

        with transaction.atomic():
            existing = Refund.objects.filter(order=order, idempotency_key=data["idempotency_key"]).first()
            if existing:
                return existing

            refund_amount, refund_items_payload = self._resolve_refund_amount_and_items(order, data, refundable_balance)
            if refund_amount <= Decimal("0.00"):
                raise ValidationError("Refund amount must be greater than zero.")
            if refund_amount > refundable_balance:
                raise ValidationError("Refund amount exceeds refundable balance.")

            refund = Refund.objects.create(
                order=order,
                shift=current_shift or order.shift,
                processed_by=actor,
                idempotency_key=data["idempotency_key"],
                refund_type=data["refund_type"],
                method=data.get("method", Refund.RefundMethod.CASH),
                amount=refund_amount,
                reason=data["reason"],
                reference_no=data.get("reference_no", ""),
                manager_pin_last4=data.get("manager_pin", "")[-4:],
            )
            if refund_items_payload:
                RefundItem.objects.bulk_create(
                    [
                        RefundItem(
                            refund=refund,
                            order_item=row["order_item"],
                            quantity=row["quantity"],
                            subtotal_amount=row["subtotal_amount"],
                            excise_amount=row["excise_amount"],
                            tax_amount=row["tax_amount"],
                            total_amount=row["total_amount"],
                        )
                        for row in refund_items_payload
                    ]
                )

            status_changed = _refresh_order_settlement_status(order)
            _broadcast_order_update(
                order,
                "refund_added",
                extra={"refund_id": str(refund.id), "amount": str(refund.amount), "refund_type": refund.refund_type},
            )
            if status_changed:
                _schedule_whatsapp_notification(order, "order_status_changed")
            return refund

    def _resolve_refund_amount_and_items(
        self,
        order: PosOrder,
        data: dict,
        refundable_balance: Decimal,
    ) -> tuple[Decimal, list[dict]]:
        order_items = list(order.items.all())
        if not order_items:
            return Decimal("0.00"), []

        refunded_qty_rows = (
            RefundItem.objects.filter(refund__order=order)
            .values("order_item_id")
            .annotate(total_qty=models.Sum("quantity"))
        )
        refunded_qty_by_item_id = {str(row["order_item_id"]): Decimal(row["total_qty"] or 0) for row in refunded_qty_rows}
        item_by_id = {str(item.id): item for item in order_items}

        def _line_amounts(item: PosOrderItem, qty: Decimal) -> dict:
            quantity = Decimal(item.quantity or 0)
            if quantity <= Decimal("0.00"):
                return {
                    "subtotal_amount": Decimal("0.00"),
                    "excise_amount": Decimal("0.00"),
                    "tax_amount": Decimal("0.00"),
                    "total_amount": Decimal("0.00"),
                }
            ratio = qty / quantity
            subtotal_amount = _q2((item.unit_price_snapshot or Decimal("0.00")) * qty)
            excise_amount = _q2((item.excise_amount_snapshot or Decimal("0.00")) * ratio)
            tax_amount = _q2((item.tax_amount_snapshot or Decimal("0.00")) * ratio)
            discount_amount = _q2((item.discount_amount_snapshot or Decimal("0.00")) * ratio)
            total_amount = _q2(subtotal_amount + excise_amount + tax_amount - discount_amount)
            return {
                "subtotal_amount": subtotal_amount,
                "excise_amount": excise_amount,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
            }

        selected_rows: list[dict] = []
        selected_items = data.get("items") or []
        if data["refund_type"] == Refund.RefundType.FULL:
            for item in order_items:
                remaining_qty = Decimal(item.quantity) - refunded_qty_by_item_id.get(str(item.id), Decimal("0.000"))
                if remaining_qty <= Decimal("0.000"):
                    continue
                amounts = _line_amounts(item, remaining_qty)
                selected_rows.append(
                    {
                        "order_item": item,
                        "quantity": remaining_qty,
                        **amounts,
                    }
                )
            return refundable_balance, selected_rows

        if selected_items:
            for row in selected_items:
                order_item = item_by_id.get(str(row["order_item_id"]))
                if not order_item:
                    raise ValidationError("Invalid order_item_id in refund items.")
                requested_qty = Decimal(row["quantity"])
                already_refunded = refunded_qty_by_item_id.get(str(order_item.id), Decimal("0.000"))
                remaining_qty = Decimal(order_item.quantity) - already_refunded
                if requested_qty > remaining_qty:
                    raise ValidationError("Requested refund quantity exceeds remaining quantity.")
                amounts = _line_amounts(order_item, requested_qty)
                selected_rows.append(
                    {
                        "order_item": order_item,
                        "quantity": requested_qty,
                        **amounts,
                    }
                )
            lines_total = _q2(sum((row["total_amount"] for row in selected_rows), start=Decimal("0.00")))
            items_total_before_service = _q2(
                sum(
                    (
                        _q2((item.unit_price_snapshot or Decimal("0.00")) * Decimal(item.quantity))
                        + _q2(item.excise_amount_snapshot or Decimal("0.00"))
                        + _q2(item.tax_amount_snapshot or Decimal("0.00"))
                        - _q2(item.discount_amount_snapshot or Decimal("0.00"))
                    )
                    for item in order_items
                ),
                Decimal("0.00"),
            )
            service_share = Decimal("0.00")
            if items_total_before_service > Decimal("0.00") and order.service_charge_total > Decimal("0.00"):
                ratio = lines_total / items_total_before_service
                service_share = _q2(order.service_charge_total * ratio)
            return _q2(lines_total + service_share), selected_rows

        requested_amount = _q2(data.get("amount") or Decimal("0.00"))
        if requested_amount <= Decimal("0.00"):
            raise ValidationError("amount must be greater than zero.")
        if requested_amount > refundable_balance:
            raise ValidationError("Refund amount exceeds refundable balance.")
        return requested_amount, []

    @action(detail=True, methods=["post"], url_path="hold")
    def hold(self, request, pk=None):
        order = self.get_object()
        if order.status != PosOrder.OrderStatus.DRAFT:
            return Response({"detail": "Only draft orders can be held."}, status=status.HTTP_400_BAD_REQUEST)
        order.is_held = True
        order.held_at = timezone.now()
        order.save(update_fields=["is_held", "held_at", "updated_at"])
        _broadcast_order_update(order, "held")
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="resume")
    def resume(self, request, pk=None):
        order = self.get_object()
        if order.status != PosOrder.OrderStatus.DRAFT:
            return Response({"detail": "Only draft orders can be resumed."}, status=status.HTTP_400_BAD_REQUEST)
        order.is_held = False
        order.held_at = None
        order.save(update_fields=["is_held", "held_at", "updated_at"])
        _broadcast_order_update(order, "resumed")
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="attach-customer")
    def attach_customer(self, request, pk=None):
        order = self.get_object()
        serializer = OrderAttachCustomerSerializer(data=request.data, context={"order": order})
        serializer.is_valid(raise_exception=True)
        order.customer = serializer.validated_data["customer"]
        order.address = serializer.validated_data.get("address")
        order.save(update_fields=["customer", "address", "updated_at"])
        _broadcast_order_update(order, "customer_attached")
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)


class PaymentsBulkView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request):
        items = request.data.get("payments") or []
        if not isinstance(items, list) or not items:
            return Response({"detail": "payments list is required."}, status=status.HTTP_400_BAD_REQUEST)
        created = []
        for item in items:
            order = PosOrder.objects.get(id=item["order_id"])
            serializer = PaymentCreateSerializer(data=item)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            status_code, response_data = with_idempotency(
                endpoint="POST:/api/v1/pos/payments/bulk",
                device=order.device,
                key=data["idempotency_key"],
                payload=item,
                create_response=lambda o=order, d=data: PosOrderViewSet()._create_payment_response(o, d),
            )
            if status_code == status.HTTP_201_CREATED:
                created.append(response_data)
        return Response({"created_count": len(created), "results": created}, status=status.HTTP_201_CREATED)


class DeliveryAssignmentView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request):
        serializer = DeliveryAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save()
        return Response(
            {
                "id": str(assignment.id),
                "order_id": str(assignment.order_id),
                "driver_id": str(assignment.driver_id),
                "status": assignment.status,
            },
            status=status.HTTP_201_CREATED,
        )


class ShiftOpenView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request):
        serializer = ShiftOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = Branch.objects.get(id=data["branch_id"])
        device = Device.objects.get(device_id=data["device_id"], branch=branch)
        existing = Shift.objects.filter(
            branch=branch,
            device=device,
            user=request.user,
            status=Shift.ShiftStatus.OPEN,
        ).order_by("-opened_at").first()
        if existing:
            if not existing.shift_number:
                existing.shift_number = _generate_shift_number(branch, device, existing.opened_at)
                existing.save(update_fields=["shift_number", "updated_at"])
            return Response(
                {
                    "id": str(existing.id),
                    "numeric_id": _numeric_shift_id(existing),
                    "status": existing.status,
                    "reused": True,
                    "opened_at": existing.opened_at.isoformat(),
                },
                status=status.HTTP_200_OK,
            )
        opened_at = data.get("opened_at") or timezone.now()
        shift = Shift.objects.create(
            branch=branch,
            device=device,
            user=request.user,
            opening_cash=data["opening_cash"],
            opened_at=opened_at,
            shift_number=_generate_shift_number(branch, device, opened_at),
        )
        AuditLog.objects.create(
            actor=request.user,
            device=device,
            branch=branch,
            action="shift_opened",
            entity="Shift",
            entity_id=str(shift.id),
            after_data={"opening_cash": str(shift.opening_cash)},
        )
        return Response(
            {
                "id": str(shift.id),
                "numeric_id": _numeric_shift_id(shift),
                "status": shift.status,
                "opened_at": shift.opened_at.isoformat(),
            },
            status=status.HTTP_201_CREATED,
        )


class ShiftActiveView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id") or str(request.pos_device.branch_id)
        device_id = request.query_params.get("device_id") or request.pos_device.device_id
        shift = (
            Shift.objects.select_related("device", "user")
            .filter(branch_id=branch_id, device__device_id=device_id, user=request.user, status=Shift.ShiftStatus.OPEN)
            .order_by("-opened_at")
            .first()
        )
        if not shift:
            return Response({"active": False, "shift": None}, status=status.HTTP_200_OK)
        return Response(
            {
                "active": True,
                "shift": {
                    "id": str(shift.id),
                    "numeric_id": _numeric_shift_id(shift),
                    "branch_id": str(shift.branch_id),
                    "device_id": shift.device.device_id,
                    "username": shift.user.username,
                    "status": shift.status,
                    "opening_cash": str(shift.opening_cash),
                    "opened_at": shift.opened_at.isoformat(),
                },
            },
            status=status.HTTP_200_OK,
        )


class ShiftCloseView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, pk):
        shift = Shift.objects.get(id=pk)
        if shift.status != Shift.ShiftStatus.OPEN:
            return Response({"detail": "Shift is not open."}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.is_staff and shift.user_id != request.user.id:
            return Response({"detail": "You can only close your own shift."}, status=status.HTTP_403_FORBIDDEN)
        if not request.user.is_staff and shift.device_id != request.pos_device.id:
            return Response({"detail": "You can only close shifts on the current device."}, status=status.HTTP_403_FORBIDDEN)
        serializer = ShiftCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        closing_cash = serializer.validated_data["closing_cash"]
        shift.closing_cash = closing_cash
        shift.variance = closing_cash - shift.opening_cash
        shift.status = Shift.ShiftStatus.CLOSED
        shift.closed_at = serializer.validated_data.get("closed_at") or timezone.now()
        shift.save(update_fields=["closing_cash", "variance", "status", "closed_at", "updated_at"])
        return Response(
            {
                "id": str(shift.id),
                "numeric_id": _numeric_shift_id(shift),
                "status": shift.status,
                "variance": str(shift.variance),
            },
            status=status.HTTP_200_OK,
        )


class ShiftListView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        date_value = request.query_params.get("date")
        queryset = Shift.objects.select_related("branch", "device", "user").order_by("-opened_at")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if date_value:
            queryset = queryset.filter(opened_at__date=date_value)
        data = [
            {
                "id": str(s.id),
                "numeric_id": _numeric_shift_id(s),
                "branch_id": str(s.branch_id),
                "device_id": s.device.device_id,
                "username": s.user.username,
                "status": s.status,
                "opening_cash": str(s.opening_cash),
                "closing_cash": str(s.closing_cash) if s.closing_cash is not None else None,
                "variance": str(s.variance),
                "opened_at": s.opened_at.isoformat(),
                "closed_at": s.closed_at.isoformat() if s.closed_at else None,
            }
            for s in queryset
        ]
        return Response(data)


class CashMovementView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id") or str(request.pos_device.branch_id)
        date_value = request.query_params.get("date")
        queryset = CashMovement.objects.select_related("shift", "shift__device", "shift__user", "shift__branch")
        queryset = queryset.filter(shift__branch_id=branch_id)
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        queryset = queryset.order_by("-created_at")
        data = [
            {
                "id": str(movement.id),
                "shift_id": str(movement.shift_id),
                "movement_type": movement.movement_type,
                "amount": str(movement.amount),
                "reason": movement.reason,
                "device_id": movement.shift.device.device_id,
                "username": movement.shift.user.username,
                "created_at": movement.created_at.isoformat(),
            }
            for movement in queryset
        ]
        return Response(data)

    def post(self, request):
        if not request.user.is_staff:
            return Response({"detail": "Insufficient permissions."}, status=status.HTTP_403_FORBIDDEN)
        serializer = CashMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shift = Shift.objects.get(id=data["shift_id"])
        movement = CashMovement.objects.create(
            shift=shift,
            movement_type=data["movement_type"],
            amount=data["amount"],
            reason=data["reason"],
        )
        return Response(
            {
                "id": str(movement.id),
                "shift_id": str(shift.id),
                "movement_type": movement.movement_type,
                "amount": str(movement.amount),
            },
            status=status.HTTP_201_CREATED,
        )


class PrintReceiptView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request):
        order_id = request.data.get("order_id")
        if not order_id:
            return Response({"detail": "order_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        order = PosOrder.objects.filter(id=order_id).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        device = getattr(request, "pos_device", None) or order.device
        job = PrintJob.objects.create(
            order=order,
            device=device,
            job_type=PrintJob.JobType.RECEIPT,
            payload={"order_id": str(order.id), "order_number": order.order_number},
        )
        return Response(PrintJobSerializer(job).data, status=status.HTTP_201_CREATED)


class PrintTestReceiptView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request):
        device = request.pos_device
        job = PrintJob.objects.create(
            order=None,
            device=device,
            job_type=PrintJob.JobType.RECEIPT,
            payload={"test": True, "requested_at": timezone.now().isoformat()},
        )
        AuditLog.objects.create(
            actor=request.user,
            device=device,
            branch=device.branch,
            action="print_test_receipt",
            entity="PrintJob",
            entity_id=str(job.id),
        )
        return Response(PrintJobSerializer(job).data, status=status.HTTP_201_CREATED)


class CashDrawerOpenView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request):
        device = request.pos_device
        AuditLog.objects.create(
            actor=request.user,
            device=device,
            branch=device.branch,
            action="cash_drawer_open",
            entity="Device",
            entity_id=str(device.id),
        )
        return Response({"detail": "Cash drawer opened."}, status=status.HTTP_200_OK)


class DeviceChecksView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id") or str(request.pos_device.branch_id)
        device_id = request.query_params.get("device_id") or request.pos_device.device_id
        date_value = request.query_params.get("date")
        queryset = DeviceHealthCheck.objects.filter(branch_id=branch_id, device__device_id=device_id)
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        queryset = queryset.order_by("-created_at")
        serializer = DeviceHealthCheckSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        branch_id = request.data.get("branch_id")
        device_id = request.data.get("device_id")
        shift_id = request.data.get("shift_id")
        checks_payload = request.data.get("checks") or []
        if not branch_id or not device_id:
            return Response({"detail": "branch_id and device_id are required."}, status=status.HTTP_400_BAD_REQUEST)
        branch = Branch.objects.filter(id=branch_id).first()
        if not branch:
            return Response({"detail": "Invalid branch_id."}, status=status.HTTP_400_BAD_REQUEST)
        device = Device.objects.filter(device_id=device_id, branch=branch).first()
        if not device:
            return Response({"detail": "Invalid device_id."}, status=status.HTTP_400_BAD_REQUEST)
        shift = Shift.objects.filter(id=shift_id).first() if shift_id else None
        checks_serializer = DeviceCheckItemSerializer(data=checks_payload, many=True)
        checks_serializer.is_valid(raise_exception=True)
        checks = checks_serializer.validated_data

        overall = DeviceHealthCheck.OverallStatus.PASS
        if any(check["status"] == "fail" for check in checks):
            overall = DeviceHealthCheck.OverallStatus.FAIL
        elif any(check["status"] == "warn" for check in checks):
            overall = DeviceHealthCheck.OverallStatus.WARN

        record = DeviceHealthCheck.objects.create(
            branch=branch,
            device=device,
            shift=shift,
            user=request.user,
            overall_status=overall,
            checks=checks,
        )
        AuditLog.objects.create(
            actor=request.user,
            device=device,
            branch=branch,
            action="device_check",
            entity="DeviceHealthCheck",
            entity_id=str(record.id),
            after_data={"overall_status": overall},
        )
        return Response(DeviceHealthCheckSerializer(record).data, status=status.HTTP_201_CREATED)


class KdsQueueView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        station = request.query_params.get("station")
        queryset = KdsItem.objects.select_related(
            "order",
            "order_item",
            "order_item__menu_item",
            "order__channel",
            "order__external_order",
            "order__external_order__provider",
        ).filter(order__branch_id=branch_id)
        if station:
            queryset = queryset.filter(station=station)
        queryset = queryset.annotate(
            priority_rank=models.Case(
                models.When(order__kitchen_priority=PosOrder.KitchenPriority.URGENT, then=models.Value(0)),
                models.When(order__kitchen_priority=PosOrder.KitchenPriority.HIGH, then=models.Value(1)),
                models.When(order__kitchen_priority=PosOrder.KitchenPriority.NORMAL, then=models.Value(2)),
                models.When(order__kitchen_priority=PosOrder.KitchenPriority.LOW, then=models.Value(3)),
                default=models.Value(2),
                output_field=models.IntegerField(),
            ),
        ).order_by("priority_rank", "created_at")
        results = []
        for item in queryset:
            external = None
            try:
                external = item.order.external_order
            except ExternalOrder.DoesNotExist:
                external = None
            can_move_next = _can_update_kds_status(
                request.user,
                item.status,
                (
                    KdsItem.KdsStatus.PREPARING
                    if item.status == KdsItem.KdsStatus.NEW
                    else KdsItem.KdsStatus.READY
                    if item.status == KdsItem.KdsStatus.PREPARING
                    else KdsItem.KdsStatus.SERVED
                    if item.status == KdsItem.KdsStatus.READY
                    else item.status
                ),
            )
            results.append(
                {
                    "id": str(item.id),
                    "order_id": str(item.order_id),
                    "order_item_id": str(item.order_item_id),
                    "order_number": item.order.order_number,
                    "channel_code": item.order.channel.code,
                    "kitchen_priority": item.order.kitchen_priority,
                    "station": item.station,
                    "status": item.status,
                    "status_at": item.status_at.isoformat(),
                    "queued_at": item.created_at.isoformat(),
                    "item_name": item.order_item.menu_item.name,
                    "item_quantity": str(item.order_item.quantity),
                    "order_notes": item.order.notes,
                    "item_notes": item.order_item.notes,
                    "can_move_next": can_move_next,
                    "can_change_priority": _can_change_kds_priority(request.user),
                    "external_order_id": str(external.id) if external else None,
                    "provider_code": external.provider.code if external else None,
                    "provider_order_id": external.provider_order_id if external else None,
                }
            )
        return Response(results)


class KdsStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, pk):
        item = KdsItem.objects.get(id=pk)
        serializer = KdsStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        next_status = serializer.validated_data["status"]
        allowed_transitions = {
            KdsItem.KdsStatus.NEW: KdsItem.KdsStatus.PREPARING,
            KdsItem.KdsStatus.PREPARING: KdsItem.KdsStatus.READY,
            KdsItem.KdsStatus.READY: KdsItem.KdsStatus.SERVED,
        }
        expected_next = allowed_transitions.get(item.status)
        if expected_next != next_status:
            return Response({"detail": "Invalid KDS status transition."}, status=status.HTTP_400_BAD_REQUEST)
        if not _can_update_kds_status(request.user, item.status, next_status):
            return Response({"detail": "Insufficient permissions for this KDS action."}, status=status.HTTP_403_FORBIDDEN)

        item.status = next_status
        item.status_at = timezone.now()
        item.save(update_fields=["status", "status_at", "updated_at"])
        order = item.order
        kds_statuses = list(order.kds_items.values_list("status", flat=True))
        all_served = bool(kds_statuses) and all(status_value == KdsItem.KdsStatus.SERVED for status_value in kds_statuses)
        all_ready_or_served = bool(kds_statuses) and all(
            status_value in {KdsItem.KdsStatus.READY, KdsItem.KdsStatus.SERVED}
            for status_value in kds_statuses
        )
        any_started = any(
            status_value in {KdsItem.KdsStatus.PREPARING, KdsItem.KdsStatus.READY, KdsItem.KdsStatus.SERVED}
            for status_value in kds_statuses
        )

        order_fields_to_update = []
        if all_served and order.status != PosOrder.OrderStatus.COMPLETED:
            order.status = PosOrder.OrderStatus.COMPLETED
            order_fields_to_update.append("status")
        elif (
            any_started
            and order.status not in {PosOrder.OrderStatus.CANCELED, PosOrder.OrderStatus.REFUNDED, PosOrder.OrderStatus.COMPLETED}
            and order.status != PosOrder.OrderStatus.SUBMITTED
        ):
            order.status = PosOrder.OrderStatus.SUBMITTED
            order_fields_to_update.append("status")

        if all_ready_or_served and not order.ready_at:
            order.ready_at = timezone.now()
            order_fields_to_update.append("ready_at")

        if order_fields_to_update:
            order_fields_to_update.append("updated_at")
            order.save(update_fields=order_fields_to_update)
            _broadcast_order_update(order, "kds_progress")
        broadcast_kds_event(
            branch_id=str(order.branch_id),
            payload={
                "event": "KDS_ITEM_UPDATED",
                "item_id": str(item.id),
                "order_id": str(order.id),
                "order_number": order.order_number,
                "status": item.status,
                "order_status": order.status,
            },
        )

        return Response({"id": str(item.id), "status": item.status, "order_status": order.status})


class SyncStatusView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        device_id = request.query_params.get("device_id") or request.pos_device.device_id
        device = Device.objects.get(device_id=device_id)
        pending_idempotency = IdempotencyKey.objects.filter(device=device).count()
        mapped_orders = SyncReceipt.objects.filter(device=device, entity_type="order").count()
        last_sync = SyncReceipt.objects.filter(device=device).order_by("-synced_at").first()
        serializer = SyncStatusSerializer(
            data={
                "device_id": device.device_id,
                "pending_idempotency": pending_idempotency,
                "mapped_orders": mapped_orders,
                "last_sync": last_sync.synced_at if last_sync else None,
            }
        )
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)


class DriversViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Driver.objects.select_related("branch").order_by("name")
    serializer_class = DriverSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


class DeliveryProviderViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = DeliveryProvider.objects.order_by("name")
    serializer_class = DeliveryProviderSerializer


class ProviderStoreMappingViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ProviderStoreMapping.objects.select_related("provider", "branch").order_by("provider_store_id")
    serializer_class = ProviderStoreMappingSerializer


class ProviderItemMappingViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ProviderItemMapping.objects.select_related("provider", "menu_item").order_by("provider_item_id")
    serializer_class = ProviderItemMappingSerializer


class ExternalOrderViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]
    serializer_class = ExternalOrderSerializer

    def get_queryset(self):
        queryset = ExternalOrder.objects.select_related("provider", "branch", "mapped_order").order_by("-created_at")
        branch_id = self.request.query_params.get("branch_id")
        status_value = self.request.query_params.get("status")
        date_value = self.request.query_params.get("date")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if status_value:
            queryset = queryset.filter(status_external=status_value)
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        return queryset


class IntegrationWebhookOrdersView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, provider_code: str):
        provider = DeliveryProvider.objects.filter(code=provider_code, is_active=True).first()
        if not provider:
            return Response({"detail": "Unknown provider."}, status=status.HTTP_404_NOT_FOUND)
        payload = request.data if isinstance(request.data, dict) else {}
        try:
            verify_webhook(provider, request)
            external = create_or_update_external_order(provider, payload, payload)
            return Response({"external_order_id": str(external.id)}, status=status.HTTP_201_CREATED)
        except IntegrationError as exc:
            provider_order_id = payload.get("provider_order_id", "")
            provider_store_id = payload.get("provider_store_id", "")
            mapping = ProviderStoreMapping.objects.select_related("branch").filter(
                provider=provider,
                provider_store_id=provider_store_id,
            ).first()
            if provider_order_id and mapping:
                external, _ = ExternalOrder.objects.get_or_create(
                    provider=provider,
                    provider_order_id=provider_order_id,
                    defaults={
                        "branch": mapping.branch,
                        "status_external": payload.get("status", ""),
                        "raw_payload": payload,
                        "last_error": str(exc),
                        "last_synced_at": timezone.now(),
                    },
                )
                external.last_error = str(exc)
                external.raw_payload = payload
                external.last_synced_at = timezone.now()
                external.save(update_fields=["last_error", "raw_payload", "last_synced_at", "updated_at"])
                ExternalOrderEvent.objects.create(
                    external_order=external,
                    event_type=ExternalOrderEvent.EventType.FAILED,
                    payload=payload,
                    response={"error": str(exc)},
                )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class IntegrationWebhookStatusView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, provider_code: str):
        provider = DeliveryProvider.objects.filter(code=provider_code, is_active=True).first()
        if not provider:
            return Response({"detail": "Unknown provider."}, status=status.HTTP_404_NOT_FOUND)
        try:
            verify_webhook(provider, request)
            payload = request.data if isinstance(request.data, dict) else {}
            external = create_or_update_external_order(provider, payload, payload)
            return Response({"external_order_id": str(external.id)}, status=status.HTTP_200_OK)
        except IntegrationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class IntegrationWhatsAppWebhookView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        mode = (request.query_params.get("hub.mode") or "").strip()
        verify_token = (request.query_params.get("hub.verify_token") or "").strip()
        challenge = (request.query_params.get("hub.challenge") or "").strip()
        expected_token = (getattr(settings, "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "") or "").strip()
        if mode == "subscribe" and expected_token and verify_token == expected_token:
            return Response(challenge, status=status.HTTP_200_OK, content_type="text/plain")
        return Response({"detail": "Webhook verification failed."}, status=status.HTTP_403_FORBIDDEN)

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        updates = sync_whatsapp_delivery_status(payload)
        return Response({"updated": updates}, status=status.HTTP_200_OK)


class IntegrationErpPromotionsSyncView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if not _is_valid_erp_api_key(request):
            return Response({"detail": "Unauthorized ERP sync key."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = ErpPromotionSyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        branch = None
        if payload.get("branch_id"):
            branch = Branch.objects.filter(id=payload["branch_id"]).first()
        if not branch and payload.get("branch_code"):
            branch = Branch.objects.filter(code=payload["branch_code"].strip()).first()
        if not branch:
            return Response({"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND)

        summary = sync_erp_promotions(
            branch=branch,
            offers=payload.get("offers") or [],
            coupons=payload.get("coupons") or [],
            purge_missing=bool(payload.get("purge_missing", False)),
        )
        return Response(
            {
                "branch_id": str(branch.id),
                "branch_code": branch.code,
                "summary": summary,
                "synced_at": timezone.now().isoformat(),
            },
            status=status.HTTP_200_OK,
        )


class PosPromotionsView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission, DeviceBranchScopedPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id") or str(request.pos_device.branch_id)
        branch = Branch.objects.filter(id=branch_id).first()
        if not branch:
            return Response({"detail": "Branch not found."}, status=status.HTTP_404_NOT_FOUND)
        offers, coupons = get_active_promotions(branch)
        return Response(
            {
                "branch_id": str(branch.id),
                "offers": ErpOfferSerializer(offers, many=True).data,
                "coupons": ErpCouponSerializer(coupons, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class ExternalOrderMarkReadyView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, external_order_id: str):
        external = ExternalOrder.objects.select_related("provider", "mapped_order").filter(id=external_order_id).first()
        if not external:
            return Response({"detail": "External order not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            response = send_ready_to_provider(external)
            AuditLog.objects.create(
                actor=request.user,
                device=getattr(request, "pos_device", None),
                branch=external.branch,
                action="external_order_ready_sent",
                entity="ExternalOrder",
                entity_id=str(external.id),
                after_data={"status_code": response.get("status_code")},
            )
            return Response({"detail": "Ready sent."}, status=status.HTTP_200_OK)
        except IntegrationError as exc:
            enqueue_outbound_task(external, "mark_ready", {"external_order_id": str(external.id)}, str(exc))
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class ExternalOrderRetryView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, external_order_id: str):
        task = (
            ExternalOutboundTask.objects.select_related("external_order")
            .filter(external_order_id=external_order_id, status=ExternalOutboundTask.TaskStatus.PENDING)
            .order_by("next_attempt_at")
            .first()
        )
        if not task:
            return Response({"detail": "No pending task."}, status=status.HTTP_404_NOT_FOUND)
        retry_outbound_task(task)
        return Response(ExternalOutboundTaskSerializer(task).data, status=status.HTTP_200_OK)


class PickupWindowOrdersView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id") or str(request.pos_device.branch_id)
        status_value = request.query_params.get("status")
        query = (request.query_params.get("q") or "").strip()
        queryset = PosOrder.objects.select_related("customer", "channel").filter(
            branch_id=branch_id
        ).filter(
            models.Q(channel__code=OrderChannel.ChannelCode.PICKUP_WINDOW)
            | models.Q(fulfillment_mode=PosOrder.FulfillmentMode.WINDOW)
        )
        if status_value:
            queryset = queryset.filter(pickup_window_status=status_value)
        if query:
            filters = (
                models.Q(pickup_code__icontains=query)
                | models.Q(customer__phone__icontains=query)
                | models.Q(customer__name__icontains=query)
            )
            if query.isdigit():
                filters = filters | models.Q(order_number=int(query))
            queryset = queryset.filter(filters)
        queryset = queryset.order_by("-created_at")
        serializer = PickupWindowOrderSerializer(queryset, many=True)
        return Response(serializer.data)


class PickupWindowMarkArrivedView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, pk):
        order = PosOrder.objects.filter(id=pk).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            mark_arrived(order)
            AuditLog.objects.create(
                actor=request.user,
                device=getattr(request, "pos_device", None),
                branch=order.branch,
                action="pickup_window_mark_arrived",
                entity="PosOrder",
                entity_id=str(order.id),
                after_data={"pickup_window_status": order.pickup_window_status},
            )
            return Response(PickupWindowOrderSerializer(order).data, status=status.HTTP_200_OK)
        except PickupWindowError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class PickupWindowMarkReadyView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, pk):
        order = PosOrder.objects.filter(id=pk).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            mark_ready(order)
            AuditLog.objects.create(
                actor=request.user,
                device=getattr(request, "pos_device", None),
                branch=order.branch,
                action="pickup_window_mark_ready",
                entity="PosOrder",
                entity_id=str(order.id),
                after_data={"pickup_window_status": order.pickup_window_status},
            )
            return Response(PickupWindowOrderSerializer(order).data, status=status.HTTP_200_OK)
        except PickupWindowError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class PickupWindowMarkHandedOverView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, pk):
        order = PosOrder.objects.filter(id=pk).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            mark_handed_over(order)
            AuditLog.objects.create(
                actor=request.user,
                device=getattr(request, "pos_device", None),
                branch=order.branch,
                action="pickup_window_mark_handed_over",
                entity="PosOrder",
                entity_id=str(order.id),
                after_data={"pickup_window_status": order.pickup_window_status},
            )
            return Response(PickupWindowOrderSerializer(order).data, status=status.HTTP_200_OK)
        except PickupWindowError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class WaiterMarkDeliveredView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def post(self, request, pk):
        order = PosOrder.objects.filter(id=pk).first()
        if not order:
            return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        if str(order.branch_id) != str(request.pos_device.branch_id):
            return Response({"detail": "Order does not belong to the active branch."}, status=status.HTTP_403_FORBIDDEN)
        if order.handed_over_at:
            return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)

        kds_statuses = list(order.kds_items.values_list("status", flat=True))
        if not kds_statuses or any(value != KdsItem.KdsStatus.SERVED for value in kds_statuses):
            return Response({"detail": "Order must be received from kitchen first."}, status=status.HTTP_400_BAD_REQUEST)

        order.handed_over_at = timezone.now()
        order.save(update_fields=["handed_over_at", "updated_at"])
        _broadcast_order_update(order, "waiter_delivered", {"handed_over_at": order.handed_over_at.isoformat()})
        AuditLog.objects.create(
            actor=request.user,
            device=getattr(request, "pos_device", None),
            branch=order.branch,
            action="waiter_mark_delivered",
            entity="PosOrder",
            entity_id=str(order.id),
            after_data={"handed_over_at": order.handed_over_at.isoformat()},
        )
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_200_OK)


class DailySalesReportView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        date_value = request.query_params.get("date")
        queryset = PosOrder.objects.filter(branch_id=branch_id)
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        totals = {}
        grand_total = Decimal("0.00")
        count = 0
        for order in queryset:
            key = order.channel.code
            totals[key] = totals.get(key, Decimal("0.00")) + order.grand_total
            grand_total += order.grand_total
            count += 1
        return Response(
            {
                "branch_id": branch_id,
                "date": date_value,
                "orders_count": count,
                "grand_total": str(grand_total),
                "by_channel": {k: str(v) for k, v in totals.items()},
            }
        )


class PaymentsSummaryReportView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        date_value = request.query_params.get("date")
        queryset = Payment.objects.select_related("order").filter(order__branch_id=branch_id)
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        totals = {}
        for payment in queryset:
            totals[payment.method] = totals.get(payment.method, Decimal("0.00")) + payment.amount
        return Response(
            {
                "branch_id": branch_id,
                "date": date_value,
                "totals": {k: str(v) for k, v in totals.items()},
            }
        )


class VoidsDiscountsRefundsReportView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        date_value = request.query_params.get("date")
        queryset = PosOrder.objects.filter(branch_id=branch_id)
        if date_value:
            queryset = queryset.filter(created_at__date=date_value)
        canceled = queryset.filter(status=PosOrder.OrderStatus.CANCELED).count()
        refunded = queryset.filter(status=PosOrder.OrderStatus.REFUNDED).count()
        discount_total = sum([o.discount_total for o in queryset], start=Decimal("0.00"))
        return Response(
            {
                "branch_id": branch_id,
                "date": date_value,
                "voids_count": canceled,
                "refunds_count": refunded,
                "discount_total": str(discount_total),
            }
        )
