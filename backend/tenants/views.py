from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from core.permissions import PosPublicApiPermission
from .models import AddressBook, BranchStation, Currency, CurrencyRate, Location, Subsidiary
from .serializers import (
    AddressBookSerializer,
    BranchStationSerializer,
    CurrencyRateSerializer,
    CurrencySerializer,
    LocationSerializer,
    SubsidiarySerializer,
)


class SubsidiaryViewSet(ModelViewSet):
    queryset = Subsidiary.objects.order_by("name")
    serializer_class = SubsidiarySerializer
    permission_classes = [PosPublicApiPermission]


class LocationViewSet(ModelViewSet):
    serializer_class = LocationSerializer
    permission_classes = [PosPublicApiPermission]

    def get_queryset(self):
        queryset = Location.objects.select_related("subsidiary").order_by("name")
        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(subsidiary_id=subsidiary_id)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None and is_active != "":
            queryset = queryset.filter(is_active=str(is_active).strip().lower() in {"1", "true", "yes", "on"})
        return queryset


class BranchStationViewSet(ModelViewSet):
    serializer_class = BranchStationSerializer
    permission_classes = [PosPublicApiPermission]

    def get_queryset(self):
        queryset = BranchStation.objects.select_related("location", "location__subsidiary").order_by(
            "name"
        )
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(location__subsidiary_id=subsidiary_id)
        return queryset


class CurrencyViewSet(ReadOnlyModelViewSet):
    queryset = Currency.objects.order_by("code")
    serializer_class = CurrencySerializer
    permission_classes = [PosPublicApiPermission]


class CurrencyRateViewSet(ReadOnlyModelViewSet):
    serializer_class = CurrencyRateSerializer
    permission_classes = [PosPublicApiPermission]

    def get_queryset(self):
        queryset = CurrencyRate.objects.select_related("currency").order_by("-effective_date")
        currency_id = self.request.query_params.get("currency_id")
        if currency_id:
            queryset = queryset.filter(currency_id=currency_id)
        return queryset


class AddressBookViewSet(ModelViewSet):
    queryset = AddressBook.objects.order_by("city", "street")
    serializer_class = AddressBookSerializer
    permission_classes = [PosPublicApiPermission]
