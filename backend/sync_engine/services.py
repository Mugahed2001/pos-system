from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db import transaction
from django.utils import timezone

from pos.models import Branch, Device
from sync_engine.models import EntitySyncVersion, SyncConflict, SyncEvent, SyncOperation, SyncStatus


def queue_outbound_event(
    *,
    branch: Branch,
    event_type: str,
    entity_type: str,
    entity_id: str,
    operation: str,
    payload: dict[str, Any],
    stream: str = "default",
    device: Device | None = None,
) -> SyncEvent:
    return SyncEvent.objects.create(
        company=branch.company,
        branch=branch,
        device=device,
        direction="outbound",
        stream=stream,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        operation=operation,
        payload=payload,
        status=SyncStatus.APPLIED,
        processed_at=timezone.now(),
    )


def _process_inbound_event(event: SyncEvent) -> SyncEvent:
    with transaction.atomic():
        entity_state, _ = EntitySyncVersion.objects.select_for_update().get_or_create(
            company=event.company,
            branch=event.branch,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            defaults={"current_version": 0, "payload": {}},
        )

        if event.base_version != entity_state.current_version:
            conflict = SyncConflict.objects.create(
                event=event,
                company=event.company,
                branch=event.branch,
                device=event.device,
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                reason="BASE_VERSION_MISMATCH",
                server_version=entity_state.current_version,
                client_base_version=event.base_version,
                server_payload=entity_state.payload,
                client_payload=event.payload,
            )
            event.status = SyncStatus.CONFLICT
            event.error_code = "BASE_VERSION_MISMATCH"
            event.error_message = f"Conflict id={conflict.id}"
            event.processed_at = timezone.now()
            event.save(update_fields=["status", "error_code", "error_message", "processed_at", "checksum"])
            return event

        entity_state.current_version += 1
        event.version = entity_state.current_version
        if event.operation == SyncOperation.DELETE:
            entity_state.payload = {}
            entity_state.checksum = ""
        else:
            entity_state.payload = event.payload
            entity_state.checksum = event.checksum
        entity_state.save(update_fields=["current_version", "payload", "checksum", "updated_at"])

        event.status = SyncStatus.APPLIED
        event.processed_at = timezone.now()
        event.save(update_fields=["version", "status", "processed_at", "checksum"])
        return event


def ingest_inbound_events(*, branch: Branch, device: Device, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    responses: list[dict[str, Any]] = []
    for item in events:
        idempotency_key = str(item.get("idempotency_key") or "").strip()
        if idempotency_key:
            existing = SyncEvent.objects.filter(
                device=device,
                idempotency_key=idempotency_key,
                direction="inbound",
            ).first()
            if existing:
                responses.append(
                    {
                        "idempotency_key": idempotency_key,
                        "status": existing.status,
                        "version": existing.version,
                        "event_id": str(existing.id),
                        "error_code": existing.error_code,
                    }
                )
                continue

        event = SyncEvent.objects.create(
            company=branch.company,
            branch=branch,
            device=device,
            direction="inbound",
            stream=str(item.get("stream") or "default"),
            event_type=str(item.get("event_type") or "GENERIC"),
            entity_type=str(item.get("entity_type") or "generic"),
            entity_id=str(item.get("entity_id") or ""),
            operation=str(item.get("operation") or SyncOperation.PATCH),
            idempotency_key=idempotency_key,
            base_version=int(item.get("base_version") or 0),
            payload=item.get("payload") or {},
            status=SyncStatus.PENDING,
        )
        processed = _process_inbound_event(event)
        responses.append(
            {
                "idempotency_key": idempotency_key,
                "status": processed.status,
                "version": processed.version,
                "event_id": str(processed.id),
                "error_code": processed.error_code,
            }
        )
    return responses


def pull_outbound_events(*, branch: Branch, device: Device, stream: str, since: datetime | None, limit: int = 200) -> list[SyncEvent]:
    queryset = SyncEvent.objects.filter(branch=branch, direction="outbound", stream=stream, status=SyncStatus.APPLIED).filter(
        device__isnull=True
    ) | SyncEvent.objects.filter(
        branch=branch,
        direction="outbound",
        stream=stream,
        status=SyncStatus.APPLIED,
        device=device,
    )
    if since:
        queryset = queryset.filter(created_at__gt=since)
    return list(queryset.order_by("created_at")[:limit])


def resolve_conflict(*, conflict: SyncConflict, resolution: str, payload: dict[str, Any] | None = None) -> SyncConflict:
    if conflict.resolution != SyncConflict.Resolution.PENDING:
        return conflict

    payload = payload or {}
    conflict.resolution = resolution
    conflict.resolved_payload = payload
    conflict.resolved_at = timezone.now()
    conflict.save(update_fields=["resolution", "resolved_payload", "resolved_at"])

    if resolution in {SyncConflict.Resolution.CLIENT_WINS, SyncConflict.Resolution.MANUAL_MERGE}:
        entity_state, _ = EntitySyncVersion.objects.get_or_create(
            company=conflict.company,
            branch=conflict.branch,
            entity_type=conflict.entity_type,
            entity_id=conflict.entity_id,
            defaults={"current_version": 0},
        )
        entity_state.current_version += 1
        entity_state.payload = payload if payload else conflict.client_payload
        entity_state.save(update_fields=["current_version", "payload", "updated_at"])

    return conflict
