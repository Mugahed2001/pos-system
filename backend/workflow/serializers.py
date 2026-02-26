from rest_framework import serializers

from workflow.models import WorkflowDefinition, WorkflowExecution, WorkflowStepLog


class WorkflowDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowDefinition
        fields = [
            "id",
            "company",
            "branch",
            "code",
            "name",
            "trigger",
            "version",
            "is_active",
            "priority",
            "definition",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]


class WorkflowExecutionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowExecution
        fields = [
            "id",
            "workflow",
            "branch",
            "entity_type",
            "entity_id",
            "status",
            "input_context",
            "output_context",
            "error_message",
            "started_at",
            "finished_at",
        ]


class WorkflowStepLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowStepLog
        fields = [
            "id",
            "execution",
            "step_code",
            "order_no",
            "status",
            "input_snapshot",
            "output_snapshot",
            "error_message",
            "duration_ms",
            "created_at",
        ]


class ExecuteWorkflowSerializer(serializers.Serializer):
    company_id = serializers.UUIDField()
    branch_id = serializers.UUIDField()
    code = serializers.CharField()
    entity_type = serializers.CharField(default="order")
    entity_id = serializers.CharField()
    context = serializers.JSONField(required=False, default=dict)
