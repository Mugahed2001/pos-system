from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config_engine.permissions import CanManageConfigPermission
from workflow.models import WorkflowDefinition, WorkflowExecution
from workflow.serializers import (
    ExecuteWorkflowSerializer,
    WorkflowDefinitionSerializer,
    WorkflowExecutionSerializer,
)
from workflow.services import execute_workflow, resolve_workflow


class WorkflowDefinitionViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowDefinitionSerializer
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def get_queryset(self):
        queryset = WorkflowDefinition.objects.select_related("company", "branch", "created_by").order_by("code", "-version")
        company_id = self.request.query_params.get("company_id")
        branch_id = self.request.query_params.get("branch_id")
        if company_id:
            queryset = queryset.filter(company_id=company_id)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class WorkflowExecutionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WorkflowExecutionSerializer
    permission_classes = [IsAuthenticated, CanManageConfigPermission]

    def get_queryset(self):
        queryset = WorkflowExecution.objects.select_related("workflow", "branch").order_by("-started_at")
        branch_id = self.request.query_params.get("branch_id")
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset


class WorkflowExecuteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ExecuteWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        workflow = resolve_workflow(
            company_id=str(data["company_id"]),
            branch_id=str(data["branch_id"]),
            code=data["code"],
        )
        execution = execute_workflow(
            workflow=workflow,
            entity_type=data["entity_type"],
            entity_id=data["entity_id"],
            context=data.get("context") or {},
        )
        return Response(WorkflowExecutionSerializer(execution).data, status=status.HTTP_200_OK)
