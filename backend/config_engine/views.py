from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config_engine.models import ConfigDraft, ConfigRelease, FeatureFlag, RuleDefinition
from config_engine.permissions import CanManageConfigPermission
from config_engine.serializers import (
    CashierSettingsSerializer,
    ConfigDraftSerializer,
    ConfigReleaseSerializer,
    EffectiveConfigQuerySerializer,
    FeatureFlagSerializer,
    ForceLogoutSerializer,
    PublishDraftSerializer,
    RollbackReleaseSerializer,
    RuleDefinitionSerializer,
)
from config_engine.services import (
    broadcast_permission_event,
    materialize_effective_config,
    publish_draft,
    rollback_release,
)
from pos.models import Branch


class ConfigDraftViewSet(viewsets.ModelViewSet):
    serializer_class = ConfigDraftSerializer
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def get_queryset(self):
        queryset = ConfigDraft.objects.select_related("company", "branch", "created_by", "published_by")
        company_id = self.request.query_params.get("company_id")
        branch_id = self.request.query_params.get("branch_id")
        status_value = self.request.query_params.get("status")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, pk=None):
        draft = self.get_object()
        try:
            release = publish_draft(draft, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ConfigReleaseSerializer(release).data, status=status.HTTP_200_OK)


class ConfigReleaseViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ConfigReleaseSerializer
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def get_queryset(self):
        queryset = ConfigRelease.objects.select_related("company", "branch", "draft", "created_by", "rolled_back_from")
        company_id = self.request.query_params.get("company_id")
        branch_id = self.request.query_params.get("branch_id")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset.order_by("-version")


class FeatureFlagViewSet(viewsets.ModelViewSet):
    serializer_class = FeatureFlagSerializer
    permission_classes = [IsAuthenticated, CanManageConfigPermission]
    queryset = FeatureFlag.objects.select_related("company", "branch").order_by("-priority", "key")


class RuleDefinitionViewSet(viewsets.ModelViewSet):
    serializer_class = RuleDefinitionSerializer
    permission_classes = [IsAuthenticated, CanManageConfigPermission]
    queryset = RuleDefinition.objects.select_related("company", "branch").order_by("-priority", "name")


class ConfigPublishView(APIView):
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def post(self, request):
        serializer = PublishDraftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        draft = get_object_or_404(ConfigDraft, id=serializer.validated_data["draft_id"])
        try:
            release = publish_draft(draft, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ConfigReleaseSerializer(release).data, status=status.HTTP_200_OK)


class ConfigRollbackView(APIView):
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def post(self, request):
        serializer = RollbackReleaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        release = get_object_or_404(ConfigRelease, id=serializer.validated_data["release_id"])
        try:
            rolled_back = rollback_release(release, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ConfigReleaseSerializer(rolled_back).data, status=status.HTTP_200_OK)


class EffectiveConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = EffectiveConfigQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = get_object_or_404(Branch.objects.select_related("company"), id=data["branch_id"])

        context = {
            "payment_method": data.get("payment_method", ""),
            "customer_type": data.get("customer_type", ""),
            "cart_total": data.get("cart_total", 0),
            "distance": data.get("distance", 0),
        }
        payload = materialize_effective_config(
            branch=branch,
            role_code=data.get("role_code", ""),
            channel_code=data.get("channel_code", ""),
            context=context,
        )
        return Response(payload, status=status.HTTP_200_OK)


class ForceLogoutView(APIView):
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def post(self, request):
        serializer = ForceLogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch_id = str(serializer.validated_data["branch_id"])
        payload = {
            "reason": serializer.validated_data["reason"],
            "expires_at": serializer.validated_data["expires_at"].isoformat(),
        }
        broadcast_permission_event(branch_id=branch_id, payload={"event": "FORCE_LOGOUT", **payload})
        return Response({"detail": "FORCE_LOGOUT sent.", "branch_id": branch_id}, status=status.HTTP_200_OK)


class CashierSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CashierSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = get_object_or_404(Branch.objects.select_related("company"), id=data["branch_id"])

        payload = {
            "overrides": {
                "ui_toggles": data.get("ui_toggles") or {},
            }
        }
        draft_name = data.get("name") or "Cashier Settings"
        draft = ConfigDraft.objects.create(
            company=branch.company,
            branch=branch,
            name=draft_name,
            payload=payload,
            created_by=request.user,
        )
        release = publish_draft(draft, request.user)
        return Response(
            {
                "branch_id": str(branch.id),
                "release_id": str(release.id),
                "version": int(release.version),
                "ui_toggles": payload["overrides"]["ui_toggles"],
            },
            status=status.HTTP_200_OK,
        )
