# Feature 1.1 - Order Types (POS + ERP Integration)

## A) Folder Structure

### Backend (`backend/`)

```
backend/
  config/
    settings.py
    urls.py
  pos/
    apps.py
    models.py
    admin.py
    repositories.py
    permissions.py
    serializers.py
    views.py
    urls.py
    services/
      __init__.py
      idempotency.py
      order_rules.py
    management/
      commands/
        seed_pos_demo.py
    migrations/
      0001_initial.py
    tests.py
  ...
```

### Expo POS (`frontend/`)

```
frontend/
  src/
    app/
      config/env.ts
    shared/
      constants/keys.ts
      lib/apiClient.ts
    features/
      auth/
        api/authApi.ts
        model/authSlice.ts
      sales/
        api/posConfigApi.ts
        api/posOrdersApi.ts
        lib/outbox.ts
        model/posTypes.ts
        ui/SalesPage.tsx
```

### React Admin

Current repo uses a unified RN/Expo codebase. Backend now exposes all `v1` APIs required for a dedicated React Admin client to consume directly.

## B) Text ERD (Entities + Relationships)

- `Company 1--* Branch`
- `Branch 1--* Device`
- `Branch 1--* MenuCategory 1--* MenuItem`
- `Branch 1--* PriceList 1--* PriceListItem (*--1 MenuItem)`
- `Branch 1--* TaxProfile 1--* TaxRule`
- `Branch 1--* ServiceChargeRule`
- `Branch 1--* DiscountPolicy`
- `OrderChannel 1--* ChannelConfig` and `Branch 1--* ChannelConfig` (unique per `branch+channel`)
- `Branch 1--* Floor 1--* DiningTable 1--* Seat`
- `Branch 1--* Customer 1--* Address`
- `Branch 1--* Driver`
- `Branch 1--* PosOrder`
- `Device 1--* PosOrder`
- `User 1--* PosOrder`
- `PosOrder 1--* PosOrderItem`
- `PosOrder 1--1 OrderChannelSnapshot` (price/tax/service snapshot at sale time)
- `PosOrder 1--1 PreOrderSchedule` (optional)
- `PosOrder 1--1 DeliveryAssignment` (optional)
- `PosOrder 1--* Payment` (idempotent per `order+idempotency_key`)
- `Branch 1--* Shift 1--* CashMovement`
- `Device 1--* IdempotencyKey`
- `Device 1--* SyncReceipt` (`local_id -> server_id` mapping)
- `PosOrder 1--* KdsItem`
- `Branch 1--1 ConfigVersion`

## C) APIs + Real JSON Models

### Auth

- `POST /api/v1/auth/device/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Example `POST /api/v1/auth/login` request:

```json
{
  "username": "cashier",
  "password": "cashier123",
  "device_token": "dev_token_1",
  "pin": ""
}
```

Response:

```json
{
  "id": 2,
  "username": "cashier",
  "is_staff": false,
  "token": "2f2f9f6d..."
}
```

### Config Sync

- `GET /api/v1/pos/config?branch_id=<uuid>&since_version=<int>`
- `GET /api/v1/pos/config/version?branch_id=<uuid>`

Config delta response:

```json
{
  "version": 5,
  "branch": "8e1e2f1a-...",
  "channels": [
    { "id": "c1...", "code": "dine_in", "display_name": "Dine-in" },
    { "id": "c2...", "code": "delivery", "display_name": "Delivery" }
  ],
  "channel_configs": [
    {
      "id": "cfg1...",
      "channel": "c1...",
      "channel_code": "dine_in",
      "price_list_id": "pl1...",
      "tax_profile_id": "tp1...",
      "service_charge_rule_id": "sc1...",
      "discount_policy_id": null,
      "is_enabled": true,
      "allow_new_orders": true,
      "availability_rules": {},
      "printing_routing": { "kitchen": "kitchen_printer_1", "receipt": "receipt_printer_1" },
      "config_version": 5
    }
  ],
  "floors": [],
  "tables": [],
  "menu_categories": [],
  "menu_items": [],
  "modifiers": [],
  "price_lists": [],
  "taxes": [],
  "service_charges": [],
  "discount_policies": []
}
```

### Orders

- `POST /api/v1/pos/orders/`
- `POST /api/v1/pos/orders/bulk/`
- `GET /api/v1/pos/orders/?branch_id=&date=&status=&channel=`
- `GET /api/v1/pos/orders/{id}/`
- `POST /api/v1/pos/orders/{id}/status/`
- `POST /api/v1/pos/orders/{id}/submit/`
- `POST /api/v1/pos/orders/{id}/cancel/`
- `POST /api/v1/pos/orders/{id}/refund/`
- `POST /api/v1/pos/preorders`

Create order request:

```json
{
  "local_id": "local-1739350000-1",
  "idempotency_key": "idem-1739350000-1",
  "branch_id": "8e1e2f1a-...",
  "device_id": "POS-01",
  "channel": "dine_in",
  "table_id": "f2200f6f-...",
  "seats_count": 2,
  "offline_created_at": "2026-02-12T10:00:00Z",
  "items": [
    {
      "menu_item_id": "m1...",
      "quantity": "2.000",
      "unit_price_snapshot": "25.00",
      "tax_amount_snapshot": "7.50",
      "discount_amount_snapshot": "0.00",
      "modifiers_snapshot_json": []
    }
  ]
}
```

Response:

```json
{
  "id": "a4b2f4a1-...",
  "local_id": "local-1739350000-1",
  "status": "draft",
  "grand_total": "57.50",
  "mapping": {
    "local_id": "local-1739350000-1",
    "server_id": "a4b2f4a1-..."
  }
}
```

### Delivery/KDS/Payments/Shifts/Sync

- `POST /api/v1/pos/delivery/assignments`
- `GET /api/v1/kds/queue?branch_id=&station=`
- `POST /api/v1/kds/items/{id}/status`
- `POST /api/v1/pos/orders/{id}/payments/`
- `POST /api/v1/pos/payments/bulk`
- `POST /api/v1/pos/shifts/open`
- `POST /api/v1/pos/shifts/{id}/close`
- `POST /api/v1/pos/cash-movements`
- `GET /api/v1/pos/shifts?branch_id=&date=`
- `GET /api/v1/pos/sync/status?device_id=POS-01`

## D) Offline Sync + Idempotency Design

- Expo keeps outbox in local persistent storage (`sales/lib/outbox.ts`).
- Outbox operation currently implemented:
  - `create_order`
- Retry strategy:
  - exponential backoff: `2^retries` seconds up to 60s
- Trigger points:
  - app startup
  - periodic timer (15s)
  - after successful submit
- Conflict policies implemented:
  - price/tax/service source at sale time is persisted in `OrderChannelSnapshot` per order
  - if channel config disabled (`is_enabled=false` or `allow_new_orders=false`) server rejects new orders
  - existing offline orders still sync via idempotent insert path
- Idempotency implemented server-side:
  - `IdempotencyKey(endpoint, device, key)` unique
  - duplicate request with same payload returns original response
  - duplicate key with different payload returns `409`
- Local mapping persisted server-side:
  - `SyncReceipt(device, entity_type='order', local_id, server_id)`

## E) Implementation Plan (MVP -> Enhancements)

1. Model core entities for channels/config/orders/snapshot/sync.
2. Add rule engine (`order_rules.py`) for channel business validation.
3. Add idempotency service (`idempotency.py`) for write APIs.
4. Implement auth endpoints (`device register`, `login`, `me`, `logout`).
5. Implement config delta endpoints (`/pos/config`, `/pos/config/version`).
6. Implement order endpoints (single + bulk + lifecycle actions).
7. Implement payment/shift/cash movement endpoints.
8. Implement delivery assignment + KDS queue/status endpoints.
9. Add test suite for config delta + idempotency + channel rules + manager override.
10. Add seed command with demo branch/device/users/channels/menu.
11. Wire Expo API client with `X-Device-Token`.
12. Add Expo outbox queue + retry backoff + pending counter.
13. Update Expo sales flow with channel selection and channel-specific fields.
14. Add periodic sync status checks and online/offline indicator.
15. Add drf-spectacular routes (auto-enabled when package installed).
16. Next: split dedicated React Admin app that consumes `api/v1/admin/*` endpoints.
