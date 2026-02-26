from rest_framework.routers import DefaultRouter

from .views import (
    TaxItemViewSet,
    TaxSaDocumentViewSet,
    TaxSaSettingViewSet,
    TaxTypeViewSet,
    ZatcaOnboardingViewSet,
)

router = DefaultRouter()
router.register("taxes/types", TaxTypeViewSet, basename="tax-type")
router.register("taxes/items", TaxItemViewSet, basename="tax-item")
router.register("taxes/sa-settings", TaxSaSettingViewSet, basename="tax-sa-setting")
router.register("taxes/zatca-onboarding", ZatcaOnboardingViewSet, basename="zatca-onboarding")
router.register("taxes/sa-documents", TaxSaDocumentViewSet, basename="tax-sa-document")

urlpatterns = [
    *router.urls,
]
