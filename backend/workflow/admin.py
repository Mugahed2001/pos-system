from django.contrib import admin

from workflow.models import WorkflowDefinition, WorkflowExecution, WorkflowStepLog

admin.site.register(WorkflowDefinition)
admin.site.register(WorkflowExecution)
admin.site.register(WorkflowStepLog)
