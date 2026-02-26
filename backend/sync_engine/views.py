from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config_engine.permissions import CanManageConfigPermission
from pos.models import Branch
from pos.permissions import DeviceBranchScopedPermission, DeviceTokenPermission
from sync_engine.models import SyncConflict, SyncCursor
from sync_engine.serializers import (
    InboundPushSerializer,
    ReplayQuerySerializer,
    ResolveConflictSerializer,
    SyncConflictSerializer,
    SyncEventSerializer,
)
from sync_engine.services import ingest_inbound_events, pull_outbound_events, resolve_conflict


class SyncInboundPushView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission, DeviceBranchScopedPermission]

    def post(self, request):
        serializer = InboundPushSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch = get_object_or_404(Branch, id=serializer.validated_data["branch_id"])
        if str(request.pos_device.branch_id) != str(branch.id):
            return Response({"detail": "Branch mismatch for device."}, status=status.HTTP_403_FORBIDDEN)

        results = ingest_inbound_events(
            branch=branch,
            device=request.pos_device,
            events=serializer.validated_data["events"],
        )
        return Response({"results": results}, status=status.HTTP_200_OK)


class SyncReplayPullView(APIView):
    permission_classes = [IsAuthenticated, DeviceTokenPermission, DeviceBranchScopedPermission]

    def get(self, request):
        serializer = ReplayQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        branch = get_object_or_404(Branch, id=serializer.validated_data["branch_id"])
        if str(request.pos_device.branch_id) != str(branch.id):
            return Response({"detail": "Branch mismatch for device."}, status=status.HTTP_403_FORBIDDEN)

        events = pull_outbound_events(
            branch=branch,
            device=request.pos_device,
            stream=serializer.validated_data["stream"],
            since=serializer.validated_data.get("since"),
            limit=serializer.validated_data["limit"],
        )
        data = SyncEventSerializer(events, many=True).data
        latest_cursor = data[-1]["created_at"] if data else serializer.validated_data.get("since")
        if events:
            cursor, _ = SyncCursor.objects.get_or_create(
                device=request.pos_device,
                stream=serializer.validated_data["stream"],
            )
            cursor.last_event_created_at = events[-1].created_at
            cursor.last_event_id = events[-1].id
            cursor.save(update_fields=["last_event_created_at", "last_event_id", "updated_at"])
        return Response({"events": data, "next_since": latest_cursor}, status=status.HTTP_200_OK)


class SyncConflictsView(APIView):
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def get(self, request):
        branch_id = request.query_params.get("branch_id")
        queryset = SyncConflict.objects.select_related("event", "branch").order_by("-created_at")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return Response(SyncConflictSerializer(queryset[:300], many=True).data)


class SyncResolveConflictView(APIView):
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def post(self, request):
        serializer = ResolveConflictSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conflict = get_object_or_404(SyncConflict, id=serializer.validated_data["conflict_id"])
        resolved = resolve_conflict(
            conflict=conflict,
            resolution=serializer.validated_data["resolution"],
            payload=serializer.validated_data.get("payload") or {},
        )
        return Response(SyncConflictSerializer(resolved).data, status=status.HTTP_200_OK)
