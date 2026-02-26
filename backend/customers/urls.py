from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet, DiscountPolicyViewSet, DiscountViewSet, RewardPointViewSet

router = DefaultRouter()
router.register("customers/customers", CustomerViewSet, basename="customer")
router.register("customers/reward-points", RewardPointViewSet, basename="reward-point")
router.register("customers/discount-policies", DiscountPolicyViewSet, basename="discount-policy")
router.register("customers/discounts", DiscountViewSet, basename="discount")

urlpatterns = [
    *router.urls,
]
