from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from .models import AccountMove, AccountPayment
from .serializers import (
    AccountMoveSerializer,
    AccountPaymentSerializer,
    TransactionPostSerializer,
)
from .services import AccountingError, create_move_for_transaction, post_move


class AccountMoveViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        AccountMove.objects.select_related(
            "subsidiary",
            "journal",
            "period",
            "transaction",
            "currency",
        )
        .prefetch_related("lines")
        .order_by("-move_date", "-created_at")
    )
    serializer_class = AccountMoveSerializer
    permission_classes = [IsAdminUser]

    @action(detail=False, methods=["post"], url_path="from-transaction")
    def from_transaction(self, request):
        serializer = TransactionPostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            move = create_move_for_transaction(serializer.validated_data["transaction_id"])
        except AccountingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AccountMoveSerializer(move).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def post(self, request, pk=None):
        try:
            move = post_move(pk)
        except AccountingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AccountMoveSerializer(move).data)


class AccountPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AccountPayment.objects.select_related(
        "subsidiary",
        "journal",
        "currency",
        "customer",
        "transaction",
        "move",
    ).order_by("-payment_date", "-created_at")
    serializer_class = AccountPaymentSerializer
    permission_classes = [IsAdminUser]
