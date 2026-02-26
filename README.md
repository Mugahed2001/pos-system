# POS System (Offline-first Order Types)

## Docker run

```powershell
docker compose up --build
```

Backend URL: `http://localhost:8000`

### Swagger

`http://localhost:8000/api/schema/swagger-ui/`

## Backend run

```powershell
docker compose up -d postgres redis
cd backend
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_pos_demo
.\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

The default `backend/.env` is PostgreSQL-only:
`postgresql://postgres:postgres@localhost:5432/pos`

Swagger URL: `http://localhost:8000/api/schema/swagger-ui/`

### WhatsApp integration env (optional)

Add these keys to `backend/.env` to enable sending order details over WhatsApp:

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_ACCESS_TOKEN=<meta_access_token>`
- `WHATSAPP_PHONE_NUMBER_ID=<meta_phone_number_id>`
- `WHATSAPP_API_URL=https://graph.facebook.com/v19.0`
- `WHATSAPP_TEMPLATE_LANGUAGE=ar`
- `WHATSAPP_TEMPLATE_ORDER_CREATED=<template_name_for_new_order>`
- `WHATSAPP_TEMPLATE_ORDER_STATUS=<template_name_for_status_updates>`
- `WHATSAPP_DEFAULT_COUNTRY_CODE=966` (optional, used when local numbers start with `0`)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN=<verify_token_for_meta_webhook>`

Webhook endpoint in backend:

- `POST/GET /api/v1/integrations/whatsapp/webhook`

## API Login credentials

- Admin: `admin` / `admin123`
- Cashier: `cashier` / `cashier123`
- Device token: `dev_token_1` (tests), `device-demo-token` (seed command)

## Expo run

```powershell
cd frontend
npx expo start
```

Recommended env values:

- `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api`
- `EXPO_PUBLIC_DEVICE_ID=POS-DEVICE-001`
- `EXPO_PUBLIC_DEVICE_TOKEN=device-demo-token`
- `EXPO_PUBLIC_BRANCH_ID=<branch_uuid>`

Device token note:
- `EXPO_PUBLIC_DEVICE_TOKEN` must match an active backend device token (for seeded data, use `device-demo-token`).

## Offline flow test

1. Login in app and wait for initial config sync.
2. Stop backend network/reachability.
3. Create orders from `SalesPage` (they are queued in local outbox).
4. Reconnect backend.
5. Outbox auto-flush runs every 15 seconds and pushes queued orders.
