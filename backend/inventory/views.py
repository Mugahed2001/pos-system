from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from core.permissions import IsAuthenticatedReadOnlyOrAdminWrite
from .models import (
    Bin,
    TransactionInventoryBatch,
    TransactionInventoryDetail,
    XxItemSerialNumber,
)
from .serializers import (
    BinSerializer,
    TransactionInventoryBatchSerializer,
    TransactionInventoryDetailSerializer,
    XxItemSerialNumberSerializer,
)


class BinViewSet(ModelViewSet):
    serializer_class = BinSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]

    def get_queryset(self):
        queryset = Bin.objects.select_related("location").order_by("bin_code")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset


class StockViewSet(ReadOnlyModelViewSet):
    serializer_class = TransactionInventoryDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = TransactionInventoryDetail.objects.select_related("location", "item").order_by(
            "-last_updated"
        )
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        item_id = self.request.query_params.get("item_id")
        if item_id:
            queryset = queryset.filter(item_id=item_id)
        return queryset


class InventoryBatchViewSet(ReadOnlyModelViewSet):
    serializer_class = TransactionInventoryBatchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = TransactionInventoryBatch.objects.select_related("location", "item").order_by(
            "batch_number"
        )
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        item_id = self.request.query_params.get("item_id")
        if item_id:
            queryset = queryset.filter(item_id=item_id)
        return queryset


class ItemSerialNumberViewSet(ReadOnlyModelViewSet):
    serializer_class = XxItemSerialNumberSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = XxItemSerialNumber.objects.select_related("item").order_by("serial_number")
        item_id = self.request.query_params.get("item_id")
        if item_id:
            queryset = queryset.filter(item_id=item_id)
        serial_number = (self.request.query_params.get("serial_number") or "").strip()
        if serial_number:
            queryset = queryset.filter(serial_number__icontains=serial_number)
        return queryset
