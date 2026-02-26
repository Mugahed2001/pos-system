from rest_framework import serializers

from .models import FndReportParameter, VDailySalesSummary


class FndReportParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = FndReportParameter
        fields = [
            "param_id",
            "report_name",
            "param_key",
            "param_label",
        ]
        read_only_fields = ["param_id"]


class VDailySalesSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = VDailySalesSummary
        fields = [
            "subsidiary_id",
            "branch_name",
            "sale_date",
            "total_invoices",
            "total_revenue",
            "total_vat",
        ]
