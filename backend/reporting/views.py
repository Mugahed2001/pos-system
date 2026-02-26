from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import FndReportParameter, VDailySalesSummary
from .serializers import FndReportParameterSerializer, VDailySalesSummarySerializer


class ReportParameterViewSet(ReadOnlyModelViewSet):
    queryset = FndReportParameter.objects.order_by("report_name", "param_key")
    serializer_class = FndReportParameterSerializer
    permission_classes = [IsAuthenticated]


class DailySalesSummaryViewSet(ReadOnlyModelViewSet):
    serializer_class = VDailySalesSummarySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = VDailySalesSummary.objects.order_by("-sale_date")
        subsidiary_id = self.request.query_params.get("subsidiary_id")
        if subsidiary_id:
            queryset = queryset.filter(subsidiary_id=subsidiary_id)
        date_from = self.request.query_params.get("date_from")
        if date_from:
            queryset = queryset.filter(sale_date__gte=date_from)
        date_to = self.request.query_params.get("date_to")
        if date_to:
            queryset = queryset.filter(sale_date__lte=date_to)
        return queryset
