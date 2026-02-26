from rest_framework.routers import DefaultRouter

from .views import ItemCategoryViewSet, ItemViewSet, UomViewSet

router = DefaultRouter()
router.register("catalog/categories", ItemCategoryViewSet, basename="item-category")
router.register("catalog/uoms", UomViewSet, basename="uom")
router.register("catalog/items", ItemViewSet, basename="item")

urlpatterns = [
    *router.urls,
]
