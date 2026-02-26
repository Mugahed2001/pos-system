from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from django.db.models import DecimalField, OuterRef, Q, Subquery
from django.utils import timezone

from core.permissions import PosPublicApiPermission
from .models import Item, ItemCategory, ItemPriceList, Uom
from .serializers import ItemCategorySerializer, ItemSerializer, UomSerializer


class ItemCategoryViewSet(ModelViewSet):
    serializer_class = ItemCategorySerializer
    permission_classes = [PosPublicApiPermission]

    def get_queryset(self):
        queryset = ItemCategory.objects.order_by("name")
        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(subsidiary_id=subsidiary_id)
        return queryset


class UomViewSet(ReadOnlyModelViewSet):
    queryset = Uom.objects.order_by("name")
    serializer_class = UomSerializer
    permission_classes = [PosPublicApiPermission]


class ItemViewSet(ModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [PosPublicApiPermission]

    def get_queryset(self):
        queryset = Item.objects.select_related(
            "subsidiary",
            "category",
            "uom",
        ).order_by("-created_at")
        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(subsidiary_id=subsidiary_id)
        category_id = self.request.query_params.get("category_id")
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        location_id = self.request.query_params.get("location_id")
        price_date = self.request.query_params.get("price_date")
        target_date = timezone.localdate()
        if price_date:
            try:
                target_date = timezone.datetime.fromisoformat(price_date).date()
            except ValueError:
                pass

        price_queryset = ItemPriceList.objects.filter(item_id=OuterRef("item_id"))
        if location_id:
            price_queryset = price_queryset.filter(location_id=location_id)
        price_queryset = (
            price_queryset.filter(Q(start_date__isnull=True) | Q(start_date__lte=target_date))
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=target_date))
            .order_by("-start_date", "-price_list_id")
        )
        queryset = queryset.annotate(
            current_price=Subquery(
                price_queryset.values("price")[:1],
                output_field=DecimalField(max_digits=12, decimal_places=2),
            )
        )
        return queryset
