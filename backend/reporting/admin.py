from django.contrib import admin

from .models import FndReportParameter, VDailySalesSummary

admin.site.register([FndReportParameter, VDailySalesSummary])
