# API Contract Draft (POS ↔ Backend/ERP Bridge)

> Last updated: 2026-02-12  
> Goal: توحيد شكل البيانات قبل تنفيذ الـ Sync/Outbox.

## Principles

- كل `POST` للـ transactions **لازم** يدعم idempotency.
- الـ POS يرسل “الحقيقة التشغيلية” كما حدثت (historical totals/prices) خصوصًا في Offline.

## Headers (suggested)

- `Authorization: Bearer <token>`
- `Idempotency-Key: <uuid>`
- `X-Device-Id: <device_id>`
- `X-Branch-Id: <branch_id>`

## 1) Device Registration

### `POST /auth/device/register`

Request (draft):
```json
{
  "device_name": "POS-Front-1",
  "branch_code": "BR-001",
  "activation_code": "123456"
}
```

Response:
```json
{
  "device_id": "dev_abc",
  "access_token": "jwt-or-opaque",
  "expires_in": 3600
}
```

## 2) Master Data Delta Sync

### `GET /master-data?since=2026-02-12T00:00:00Z`

Response (draft):
```json
{
  "server_time": "2026-02-12T10:00:00Z",
  "next_since": "2026-02-12T10:00:00Z",
  "datasets": {
    "menu_items": [],
    "modifier_groups": [],
    "prices": [],
    "taxes": [],
    "roles": [],
    "users": [],
    "branch_config": [],
    "unavailable_items": []
  }
}
```

## 3) Post Order / Sale

### `POST /transactions/orders`

Request (draft):
```json
{
  "client_order_id": "uuid",
  "order_type": "dine_in",
  "table_id": "T-12",
  "opened_at": "2026-02-12T10:05:00Z",
  "lines": [
    {
      "menu_item_id": "MI-100",
      "qty": 2,
      "unit_price": 25.0,
      "notes": "No onion",
      "modifiers": [
        { "modifier_id": "MOD-1", "qty": 1, "price_delta": 3.0 }
      ]
    }
  ],
  "totals": {
    "subtotal": 53.0,
    "tax": 7.95,
    "service": 0.0,
    "discount": 0.0,
    "grand_total": 60.95
  },
  "status": "paid"
}
```

Response:
```json
{
  "server_order_id": "SO-999",
  "accepted": true
}
```

## 4) Post Refund

### `POST /transactions/refunds`

Request (draft):
```json
{
  "client_refund_id": "uuid",
  "original_client_order_id": "uuid",
  "reason": "Customer complaint",
  "amount": 10.0
}
```

## 5) Shift Close

### `POST /transactions/shifts/close`

Request (draft):
```json
{
  "client_shift_id": "uuid",
  "opened_at": "2026-02-12T08:00:00Z",
  "closed_at": "2026-02-12T16:00:00Z",
  "cashier_user_id": "U-1",
  "opening_float": 200.0,
  "cash_counted": 350.0,
  "payment_summary": [
    { "method": "cash", "amount": 150.0 },
    { "method": "card", "amount": 600.0 }
  ],
  "paid_in_out": [
    { "type": "paid_out", "amount": 20.0, "reason": "Change" }
  ]
}
```
