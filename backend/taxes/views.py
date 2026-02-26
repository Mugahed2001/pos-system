from rest_framework.permissions import IsAdminUser
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from core.permissions import IsAuthenticatedReadOnlyOrAdminWrite
from .models import TaxItem, TaxSaDocument, TaxSaSetting, TaxType, ZatcaOnboarding
from .serializers import (
    TaxItemSerializer,
    TaxSaDocumentDetailSerializer,
    TaxSaDocumentListSerializer,
    TaxSaSettingSerializer,
    TaxTypeSerializer,
    ZatcaOnboardingSerializer,
)


class TaxTypeViewSet(ModelViewSet):
    queryset = TaxType.objects.order_by("name")
    serializer_class = TaxTypeSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]


class TaxItemViewSet(ModelViewSet):
    serializer_class = TaxItemSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]

    def get_queryset(self):
        queryset = TaxItem.objects.select_related("tax_type").order_by("tax_type_id")
        tax_type_id = self.request.query_params.get("tax_type_id")
        if tax_type_id:
            queryset = queryset.filter(tax_type_id=tax_type_id)
        return queryset


class TaxSaSettingViewSet(ModelViewSet):
    queryset = TaxSaSetting.objects.select_related("subsidiary").order_by("subsidiary_id")
    serializer_class = TaxSaSettingSerializer
    permission_classes = [IsAdminUser]


class ZatcaOnboardingViewSet(ModelViewSet):
    queryset = ZatcaOnboarding.objects.select_related("subsidiary", "location").order_by(
        "-onboard_id"
    )
    serializer_class = ZatcaOnboardingSerializer
    permission_classes = [IsAdminUser]


class TaxSaDocumentViewSet(ReadOnlyModelViewSet):
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        queryset = TaxSaDocument.objects.select_related("transaction").order_by("-doc_id")
        transaction_id = self.request.query_params.get("transaction_id")
        if transaction_id:
            queryset = queryset.filter(transaction_id=transaction_id)
        return queryset

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TaxSaDocumentDetailSerializer
        return TaxSaDocumentListSerializer
