from rest_framework.routers import DefaultRouter

from .views import DailySalesSummaryViewSet, ReportParameterViewSet

router = DefaultRouter()
router.register("reporting/parameters", ReportParameterViewSet, basename="report-parameter")
router.register("reporting/daily-sales-summary", DailySalesSummaryViewSet, basename="daily-sales-summary")

urlpatterns = [
    *router.urls,
]
