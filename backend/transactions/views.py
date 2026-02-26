from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from .models import (
    PaymentMethod,
    Transaction,
    TransactionComment,
    TransactionLine,
    TransactionStatus,
    TransactionTaxDetail,
)
from .serializers import (
    PaymentMethodSerializer,
    TransactionCommentCreateSerializer,
    TransactionCommentSerializer,
    TransactionCreateSerializer,
    TransactionDetailSerializer,
    TransactionLineSerializer,
    TransactionListSerializer,
    TransactionStatusSerializer,
    TransactionTaxDetailSerializer,
)


class PaymentMethodViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PaymentMethod.objects.order_by("name")
    serializer_class = PaymentMethodSerializer
    permission_classes = [IsAuthenticated]


class TransactionStatusViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TransactionStatus.objects.order_by("code")
    serializer_class = TransactionStatusSerializer
    permission_classes = [IsAuthenticated]


class TransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = (
            Transaction.objects.select_related(
                "subsidiary",
                "location",
                "station",
                "user",
                "customer",
                "status",
            )
            .order_by("-trx_date")
            .all()
        )

        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(subsidiary_id=subsidiary_id)
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        trx_number = self.request.query_params.get("trx_number")
        if trx_number:
            queryset = queryset.filter(trx_number__icontains=trx_number.strip())

        date_from = self.request.query_params.get("date_from")
        if date_from:
            queryset = queryset.filter(trx_date__date__gte=date_from)
        date_to = self.request.query_params.get("date_to")
        if date_to:
            queryset = queryset.filter(trx_date__date__lte=date_to)

        if self.action == "retrieve":
            queryset = queryset.prefetch_related(
                Prefetch(
                    "transactionline_set",
                    queryset=TransactionLine.objects.select_related("item", "uom").order_by(
                        "line_id"
                    ),
                ),
                Prefetch(
                    "transactiontaxdetail_set",
                    queryset=TransactionTaxDetail.objects.select_related("tax_type").order_by(
                        "tax_detail_id"
                    ),
                ),
                Prefetch(
                    "transactioncomment_set",
                    queryset=TransactionComment.objects.select_related("created_by").order_by(
                        "comment_id"
                    ),
                ),
            )
        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return TransactionCreateSerializer
        if self.action == "retrieve":
            return TransactionDetailSerializer
        return TransactionListSerializer

    def get_permissions(self):
        if self.action in {"update", "partial_update", "destroy"}:
            return [IsAdminUser()]
        return [permission() for permission in self.permission_classes]

    @action(detail=True, methods=["post"], url_path="comments")
    def add_comment(self, request, pk=None):
        trx = self.get_object()
        serializer = TransactionCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        created_by = serializer.validated_data.get("created_by")
        comment = TransactionComment.objects.create(
            transaction=trx,
            comment_text=serializer.validated_data["comment_text"],
            created_by_id=created_by,
        )
        return Response(TransactionCommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="lines")
    def lines(self, request, pk=None):
        trx = self.get_object()
        queryset = TransactionLine.objects.filter(transaction=trx).select_related("item", "uom")
        data = TransactionLineSerializer(queryset, many=True).data
        return Response(data)

    @action(detail=True, methods=["get"], url_path="tax-details")
    def tax_details(self, request, pk=None):
        trx = self.get_object()
        queryset = TransactionTaxDetail.objects.filter(transaction=trx).select_related("tax_type")
        data = TransactionTaxDetailSerializer(queryset, many=True).data
        return Response(data)
