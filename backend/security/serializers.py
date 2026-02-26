from rest_framework import serializers

from .models import FndLoginLog, FndResponsibility, FndRole, FndRoleResponsibility, FndUser


class FndRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FndRole
        fields = [
            "role_id",
            "subsidiary",
            "role_name",
            "description",
        ]
        read_only_fields = ["role_id"]


class FndResponsibilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = FndResponsibility
        fields = [
            "responsibility_id",
            "code",
            "name",
        ]
        read_only_fields = ["responsibility_id"]


class FndRoleResponsibilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = FndRoleResponsibility
        fields = [
            "role",
            "responsibility",
        ]


class FndUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = FndUser
        fields = [
            "user_id",
            "subsidiary",
            "username",
            "full_name",
            "role",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["user_id", "created_at"]


class FndLoginLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = FndLoginLog
        fields = [
            "log_id",
            "user",
            "login_time",
            "ip_address",
            "device_info",
        ]
        read_only_fields = ["log_id", "login_time"]
