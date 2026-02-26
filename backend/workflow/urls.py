from django.urls import path
from rest_framework.routers import DefaultRouter

from workflow.views import WorkflowDefinitionViewSet, WorkflowExecutionViewSet, WorkflowExecuteView

router = DefaultRouter()
router.register("workflows/definitions", WorkflowDefinitionViewSet, basename="workflow-definition")
router.register("workflows/executions", WorkflowExecutionViewSet, basename="workflow-execution")

urlpatterns = [
    path("workflows/execute", WorkflowExecuteView.as_view(), name="workflow-execute"),
    *router.urls,
]
