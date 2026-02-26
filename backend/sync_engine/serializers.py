from rest_framework import serializers

from sync_engine.models import SyncConflict, SyncEvent


class InboundEventItemSerializer(serializers.Serializer):
    idempotency_key = serializers.CharField(required=False, allow_blank=True, default="")
    stream = serializers.CharField(required=False, allow_blank=True, default="default")
    event_type = serializers.CharField(required=False, allow_blank=True, default="GENERIC")
    entity_type = serializers.CharField()
    entity_id = serializers.CharField()
    operation = serializers.ChoiceField(choices=["create", "update", "delete", "patch"], default="patch")
    base_version = serializers.IntegerField(required=False, default=0)
    payload = serializers.JSONField(required=False, default=dict)


class InboundPushSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    events = InboundEventItemSerializer(many=True)


class ReplayQuerySerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    stream = serializers.CharField(required=False, allow_blank=True, default="default")
    since = serializers.DateTimeField(required=False, allow_null=True)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500, default=200)


class SyncEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncEvent
        fields = [
            "id",
            "direction",
            "stream",
            "event_type",
            "entity_type",
            "entity_id",
            "operation",
            "version",
            "status",
            "payload",
            "created_at",
            "processed_at",
        ]


class ResolveConflictSerializer(serializers.Serializer):
    conflict_id = serializers.UUIDField()
    resolution = serializers.ChoiceField(choices=["server_wins", "client_wins", "manual_merge"])
    payload = serializers.JSONField(required=False, default=dict)


class SyncConflictSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncConflict
        fields = [
            "id",
            "event",
            "entity_type",
            "entity_id",
            "reason",
            "server_version",
            "client_base_version",
            "server_payload",
            "client_payload",
            "resolution",
            "resolved_payload",
            "resolved_at",
            "created_at",
        ]
