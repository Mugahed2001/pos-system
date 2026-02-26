from time import perf_counter
from typing import Any, Callable

from django.db import transaction
from django.utils import timezone

from workflow.models import WorkflowDefinition, WorkflowExecution, WorkflowStepLog


def _matches_when(when: dict[str, Any], context: dict[str, Any]) -> bool:
    if not when:
        return True
    for key, expected in when.items():
        actual = context.get(key)
        if isinstance(expected, list):
            if actual not in expected:
                return False
        else:
            if actual != expected:
                return False
    return True


def _step_validate_cart(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    items = context.get("items") or []
    if not items:
        raise ValueError("Cart is empty")
    if params.get("min_items") and len(items) < int(params["min_items"]):
        raise ValueError("Cart does not meet minimum items")
    return {"cart_valid": True, "items_count": len(items)}


def _step_compute_totals(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    subtotal = float(context.get("subtotal") or 0)
    tax_rate = float(params.get("tax_rate") or context.get("tax_rate") or 0)
    tax = subtotal * (tax_rate / 100.0)
    total = subtotal + tax
    return {"tax_total": round(tax, 2), "grand_total": round(total, 2)}


def _step_apply_discounts(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    subtotal = float(context.get("subtotal") or 0)
    percent = float(params.get("percent") or 0)
    discount = subtotal * (percent / 100.0)
    return {"discount_total": round(discount, 2), "subtotal_after_discount": round(subtotal - discount, 2)}


def _step_authorize_payment(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    required_method = params.get("method")
    actual_method = context.get("payment_method")
    if required_method and actual_method and required_method != actual_method:
        raise ValueError(f"Payment method {actual_method} is not allowed")
    return {"payment_authorized": True}


def _step_capture_payment(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    if not context.get("payment_authorized") and not context.get("skip_authorization"):
        raise ValueError("Payment is not authorized")
    return {"payment_captured": True, "captured_at": timezone.now().isoformat()}


def _step_route_to_kitchen(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    station = params.get("station") or context.get("kitchen_station") or "kitchen"
    return {"kitchen_routed": True, "kitchen_station": station}


def _step_notify_customer(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    channels = params.get("channels") or ["sms"]
    return {"notified": True, "notification_channels": channels}


def _step_fulfill_order(context: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    mode = params.get("mode") or context.get("fulfillment_mode") or "counter"
    return {"fulfilled": True, "fulfillment_mode": mode}


STEP_HANDLERS: dict[str, Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]] = {
    "validate_cart": _step_validate_cart,
    "compute_totals": _step_compute_totals,
    "apply_discounts": _step_apply_discounts,
    "authorize_payment": _step_authorize_payment,
    "capture_payment": _step_capture_payment,
    "route_to_kitchen": _step_route_to_kitchen,
    "notify_customer": _step_notify_customer,
    "fulfill_order": _step_fulfill_order,
}


def resolve_workflow(*, company_id: str, branch_id: str, code: str) -> WorkflowDefinition:
    branch_workflow = (
        WorkflowDefinition.objects.filter(company_id=company_id, branch_id=branch_id, code=code, is_active=True)
        .order_by("-priority", "-version")
        .first()
    )
    if branch_workflow:
        return branch_workflow
    global_workflow = (
        WorkflowDefinition.objects.filter(company_id=company_id, branch__isnull=True, code=code, is_active=True)
        .order_by("-priority", "-version")
        .first()
    )
    if not global_workflow:
        raise ValueError(f"No active workflow found for code={code}")
    return global_workflow


def execute_workflow(*, workflow: WorkflowDefinition, entity_type: str, entity_id: str, context: dict[str, Any]) -> WorkflowExecution:
    definition = workflow.definition or {}
    steps = definition.get("steps") or []

    with transaction.atomic():
        execution = WorkflowExecution.objects.create(
            workflow=workflow,
            branch=workflow.branch,
            entity_type=entity_type,
            entity_id=entity_id,
            status=WorkflowExecution.Status.RUNNING,
            input_context=context,
            output_context=context,
        )

        current = dict(context)
        try:
            for idx, step in enumerate(steps, start=1):
                step_code = str(step.get("code") or "")
                when = step.get("when") or {}
                params = step.get("params") or {}
                if not step_code:
                    continue
                if not _matches_when(when, current):
                    WorkflowStepLog.objects.create(
                        execution=execution,
                        step_code=step_code,
                        order_no=idx,
                        status="skipped",
                        input_snapshot=current,
                        output_snapshot=current,
                        duration_ms=0,
                    )
                    continue

                handler = STEP_HANDLERS.get(step_code)
                if not handler:
                    raise ValueError(f"Unknown workflow step '{step_code}'")

                started = perf_counter()
                output = handler(current, params)
                duration_ms = int((perf_counter() - started) * 1000)
                current.update(output)
                WorkflowStepLog.objects.create(
                    execution=execution,
                    step_code=step_code,
                    order_no=idx,
                    status="succeeded",
                    input_snapshot=execution.output_context,
                    output_snapshot=current,
                    duration_ms=duration_ms,
                )

            execution.status = WorkflowExecution.Status.SUCCEEDED
            execution.output_context = current
            execution.finished_at = timezone.now()
            execution.save(update_fields=["status", "output_context", "finished_at"])
            return execution
        except Exception as exc:  # noqa: BLE001
            execution.status = WorkflowExecution.Status.FAILED
            execution.error_message = str(exc)
            execution.output_context = current
            execution.finished_at = timezone.now()
            execution.save(update_fields=["status", "error_message", "output_context", "finished_at"])
            raise
