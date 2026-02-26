from rest_framework.routers import DefaultRouter

from .views import BinViewSet, InventoryBatchViewSet, ItemSerialNumberViewSet, StockViewSet

router = DefaultRouter()
router.register("inventory/bins", BinViewSet, basename="bin")
router.register("inventory/stock", StockViewSet, basename="stock")
router.register("inventory/batches", InventoryBatchViewSet, basename="inventory-batch")
router.register("inventory/serial-numbers", ItemSerialNumberViewSet, basename="serial-number")

urlpatterns = [
    *router.urls,
]
