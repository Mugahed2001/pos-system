from django.urls import path

from sync_engine.views import (
    SyncConflictsView,
    SyncInboundPushView,
    SyncReplayPullView,
    SyncResolveConflictView,
)

urlpatterns = [
    path("sync/inbound/push", SyncInboundPushView.as_view(), name="sync-inbound-push"),
    path("sync/replay/pull", SyncReplayPullView.as_view(), name="sync-replay-pull"),
    path("sync/conflicts", SyncConflictsView.as_view(), name="sync-conflicts"),
    path("sync/conflicts/resolve", SyncResolveConflictView.as_view(), name="sync-conflicts-resolve"),
]
