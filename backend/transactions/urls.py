from rest_framework.routers import DefaultRouter

from .views import PaymentMethodViewSet, TransactionStatusViewSet, TransactionViewSet

router = DefaultRouter()
router.register("transactions/payment-methods", PaymentMethodViewSet, basename="payment-method")
router.register("transactions/statuses", TransactionStatusViewSet, basename="transaction-status")
router.register("transactions/transactions", TransactionViewSet, basename="transaction")

urlpatterns = [
    *router.urls,
]
