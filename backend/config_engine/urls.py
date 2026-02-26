from django.urls import path
from rest_framework.routers import DefaultRouter

from config_engine.views import (
    CashierSettingsView,
    ConfigDraftViewSet,
    ConfigPublishView,
    ConfigReleaseViewSet,
    ConfigRollbackView,
    EffectiveConfigView,
    FeatureFlagViewSet,
    ForceLogoutView,
    RuleDefinitionViewSet,
)

router = DefaultRouter()
router.register("config-engine/drafts", ConfigDraftViewSet, basename="config-draft")
router.register("config-engine/releases", ConfigReleaseViewSet, basename="config-release")
router.register("config-engine/feature-flags", FeatureFlagViewSet, basename="feature-flag")
router.register("config-engine/rules", RuleDefinitionViewSet, basename="rule-definition")

urlpatterns = [
    path("config-engine/publish", ConfigPublishView.as_view(), name="config-engine-publish"),
    path("config-engine/rollback", ConfigRollbackView.as_view(), name="config-engine-rollback"),
    path("config-engine/effective", EffectiveConfigView.as_view(), name="config-engine-effective"),
    path("config-engine/force-logout", ForceLogoutView.as_view(), name="config-engine-force-logout"),
    path("config-engine/cashier-settings", CashierSettingsView.as_view(), name="config-engine-cashier-settings"),
    *router.urls,
]
