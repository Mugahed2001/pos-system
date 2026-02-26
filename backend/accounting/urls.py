from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AccountMoveViewSet, AccountPaymentViewSet

router = DefaultRouter()
router.register("accounting/moves", AccountMoveViewSet, basename="account-move")
router.register("accounting/payments", AccountPaymentViewSet, basename="account-payment")

urlpatterns = [
    *router.urls,
]
