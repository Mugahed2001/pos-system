from django.contrib import admin

from sync_engine.models import EntitySyncVersion, SyncConflict, SyncCursor, SyncEvent

admin.site.register(SyncEvent)
admin.site.register(EntitySyncVersion)
admin.site.register(SyncConflict)
admin.site.register(SyncCursor)
