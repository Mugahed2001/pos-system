from django.utils import timezone
from rest_framework import serializers

from config_engine.models import ConfigDraft, ConfigRelease, EffectiveConfigSnapshot, FeatureFlag, RuleDefinition


class ConfigDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfigDraft
        fields = [
            "id",
            "company",
            "branch",
            "name",
            "status",
            "payload",
            "checksum",
            "base_version",
            "created_by",
            "published_by",
            "published_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["checksum", "created_by", "published_by", "published_at", "created_at", "updated_at"]


class ConfigReleaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConfigRelease
        fields = [
            "id",
            "company",
            "branch",
            "draft",
            "version",
            "checksum",
            "payload",
            "is_active",
            "rolled_back_from",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["version", "checksum", "is_active", "created_by", "created_at"]


class FeatureFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureFlag
        fields = [
            "id",
            "company",
            "branch",
            "key",
            "scope_type",
            "scope_value",
            "enabled",
            "priority",
            "created_at",
            "updated_at",
        ]


class RuleDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RuleDefinition
        fields = [
            "id",
            "company",
            "branch",
            "name",
            "enabled",
            "priority",
            "condition",
            "action",
            "created_at",
            "updated_at",
        ]


class PublishDraftSerializer(serializers.Serializer):
    draft_id = serializers.UUIDField()


class RollbackReleaseSerializer(serializers.Serializer):
    release_id = serializers.UUIDField()


class EffectiveConfigQuerySerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    role_code = serializers.CharField(required=False, allow_blank=True, default="")
    channel_code = serializers.CharField(required=False, allow_blank=True, default="")
    payment_method = serializers.CharField(required=False, allow_blank=True, default="")
    customer_type = serializers.CharField(required=False, allow_blank=True, default="")
    cart_total = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=0)
    distance = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0)


class EffectiveConfigSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = EffectiveConfigSnapshot
        fields = [
            "id",
            "company",
            "branch",
            "role_code",
            "channel_code",
            "config_version",
            "checksum",
            "payload",
            "generated_at",
        ]


class ForceLogoutSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    reason = serializers.CharField(required=False, allow_blank=True, default="Permissions changed")
    expires_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        if not attrs.get("expires_at"):
            attrs["expires_at"] = timezone.now()
        return attrs


class CashierSettingsSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    ui_toggles = serializers.JSONField(required=False, default=dict)
    name = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_ui_toggles(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("ui_toggles must be an object.")
        return value
