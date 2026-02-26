import hashlib
import json
from typing import Callable

from django.db import transaction

from pos.models import Device, IdempotencyKey


def _payload_hash(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def with_idempotency(
    *,
    endpoint: str,
    device: Device,
    key: str,
    payload: dict,
    create_response: Callable[[], tuple[int, dict]],
) -> tuple[int, dict]:
    request_hash = _payload_hash(payload)

    with transaction.atomic():
        existing = (
            IdempotencyKey.objects.select_for_update()
            .filter(endpoint=endpoint, device=device, key=key)
            .first()
        )
        if existing:
            if existing.request_hash and existing.request_hash != request_hash:
                return 409, {
                    "detail": "Idempotency key conflict: payload does not match original request.",
                }
            return existing.response_code, existing.response_body

        status_code, response_data = create_response()
        IdempotencyKey.objects.create(
            endpoint=endpoint,
            device=device,
            key=key,
            request_hash=request_hash,
            response_code=status_code,
            response_body=response_data,
        )
        return status_code, response_data
