from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from core.permissions import IsAuthenticatedReadOnlyOrAdminWrite
from .models import Customer, Discount, DiscountPolicy, RewardPoint
from .serializers import (
    CustomerSerializer,
    DiscountPolicySerializer,
    DiscountSerializer,
    RewardPointSerializer,
)


class CustomerViewSet(ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Customer.objects.select_related("subsidiary").order_by("name")

        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(subsidiary_id=subsidiary_id)

        q = (self.request.query_params.get("q") or "").strip()
        if q:
            queryset = queryset.filter(
                Q(name__icontains=q) | Q(phone__icontains=q) | Q(email__icontains=q)
            )

        return queryset


class RewardPointViewSet(ReadOnlyModelViewSet):
    serializer_class = RewardPointSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = RewardPoint.objects.select_related("customer").order_by("-last_updated")
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        return queryset


class DiscountPolicyViewSet(ModelViewSet):
    serializer_class = DiscountPolicySerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]

    def get_queryset(self):
        queryset = DiscountPolicy.objects.select_related("subsidiary").order_by("name")
        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(subsidiary_id=subsidiary_id)
        return queryset


class DiscountViewSet(ModelViewSet):
    serializer_class = DiscountSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]

    def get_queryset(self):
        queryset = Discount.objects.select_related("policy").order_by("code")
        policy_id = self.request.query_params.get("policy_id")
        if policy_id:
            queryset = queryset.filter(policy_id=policy_id)
        return queryset
