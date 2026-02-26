from rest_framework.routers import DefaultRouter

from .views import (
    AddressBookViewSet,
    BranchStationViewSet,
    CurrencyRateViewSet,
    CurrencyViewSet,
    LocationViewSet,
    SubsidiaryViewSet,
)

router = DefaultRouter()
router.register("tenants/subsidiaries", SubsidiaryViewSet, basename="subsidiary")
router.register("tenants/locations", LocationViewSet, basename="location")
router.register("tenants/stations", BranchStationViewSet, basename="branch-station")
router.register("tenants/currencies", CurrencyViewSet, basename="currency")
router.register("tenants/currency-rates", CurrencyRateViewSet, basename="currency-rate")
router.register("tenants/address-book", AddressBookViewSet, basename="address-book")

urlpatterns = [
    *router.urls,
]
