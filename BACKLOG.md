# POS Restaurant Backlog (Functional + Offline + ERP Integration + NFR)

> Version: 2026-02-12  
> Repo context: `backend/` (Django API) + `frontend/` (Expo/React Native)

ظ‡ط°ظ‡ â€œظ‚ط§ط¦ظ…ط© ظ…طھط·ظ„ط¨ط§طھ ط´ط§ظ…ظ„ط© ظ‚ط¯ط± ط§ظ„ط¥ظ…ظƒط§ظ†â€‌ ظ…ط±طھط¨ط© ظƒظ…ظ‡ظ†ط¯ط³ ط£ظ†ط¸ظ…ط©طŒ ظˆظ…ط­ظˆظ‘ظ„ط© ط¥ظ„ظ‰ Backlog ط¹ظ…ظ„ظٹ (Epics â†’ Stories/Tasks) ط¬ط§ظ‡ط² ظ„طھط³ظ„ظٹظ… ظپط±ظٹظ‚ ط§ظ„طھط·ظˆظٹط±.

---

## 0) ظ…ط¨ط§ط¯ط¦ ط£ط³ط§ط³ظٹط© (Nonâ€‘negotiables)

1. **ERP ظ‡ظˆ ظ…طµط¯ط± ط§ظ„ط­ظ‚ظٹظ‚ط© (Source of Truth)** ظ„ظƒظ„ ط§ظ„ظ€ Master Data: ط§ظ„ط£طµظ†ط§ظپ/ط§ظ„ظ…ظƒظˆظ†ط§طھ/ط§ظ„ظˆطµظپط§طھ/ط§ظ„ط£ط³ط¹ط§ط±/ط§ظ„ط¶ط±ط§ط¦ط¨/ط§ظ„ظپط±ظˆط¹/ط§ظ„طµظ„ط§ط­ظٹط§طھ.
2. **POS ظ‡ظˆ ظ…طµط¯ط± ط§ظ„ط­ظ‚ظٹظ‚ط© ظ„ظ„ط¹ظ…ظ„ظٹط§طھ ط§ظ„ظٹظˆظ…ظٹط© ط¯ط§ط®ظ„ ط§ظ„ظپط±ط¹**: ط§ظ„ط·ظ„ط¨ط§طھطŒ ط§ظ„ظ…ط¯ظپظˆط¹ط§طھطŒ ط§ظ„ظˆط±ط¯ظٹط§طھطŒ ط§ظ„ط·ط¨ط§ط¹ط©طŒ ط­ط§ظ„ط© ط§ظ„ظ…ط·ط¨ط®.
3. **Offlineâ€‘first**: ظƒظ„ ط¬ظ‡ط§ط²/ظپط±ط¹ ظٹظ‚ط¯ط± ظٹط¨ظٹط¹ ظˆظٹط·ط¨ط¹ ظˆظٹط؛ظ„ظ‚ ظˆط±ط¯ظٹط© ط¨ط¯ظˆظ† ط¥ظ†طھط±ظ†طھطŒ ط«ظ… ظٹط²ط§ظ…ظ† ظ„ط§ط­ظ‚ظ‹ط§ ط¨ط¯ظˆظ† طھظƒط±ط§ط± ط£ظˆ ظپظ‚ط¯ط§ظ†.
4. **ط§ظ„ظ…ط®ط²ظˆظ† ط§ظ„ط­ظ‚ظٹظ‚ظٹ = ط§ظ„ظ…ظƒظˆظ†ط§طھ**: ط§ظ„ط§ط³طھظ‡ظ„ط§ظƒ ط؛ط§ظ„ط¨ظ‹ط§ ظٹظڈط­ط³ط¨ ط¨ط§ظ„ظˆطµظپط© (Recipe/BOM) ط«ظ… ظٹظڈط±ط­ظ‘ظ„ ظ„ظ„ظ€ ERP ظ„ط®طµظ… ظ…ط®ط²ظˆظ† ط§ظ„ظ…ظƒظˆظ†ط§طھ ط­ط³ط¨ ط§ظ„ظ…ط¨ظٹط¹ط§طھ.

---

## 1) طھط¹ط±ظٹظپط§طھ ط³ط±ظٹط¹ط© (ظ„طھظ‚ظ„ظٹظ„ ط§ظ„ظ„ط¨ط³)

- **Master Data**: Menu, Modifiers, Prices, Taxes, Users/Roles, Branch Config, 86 listâ€¦
- **Transactions**: Orders, Payments, Refunds, Shifts, Cash Movements, Audit Logsâ€¦
- **Outbox**: Queue ظ…ط­ظ„ظٹط© طھط¶ظ…ظ† طھط³ط¬ظٹظ„ ظƒظ„ ط§ظ„ط¹ظ…ظ„ظٹط§طھ ظپظٹ Offline ط«ظ… طھط±ط­ظٹظ„ظ‡ط§ ظ„ط§ط­ظ‚ظ‹ط§.
- **Idempotency**: ظ†ظپط³ ط§ظ„ط¹ظ…ظ„ظٹط© ظ„ظˆ ط£ظڈط±ط³ظ„طھ ظ…ط±طھظٹظ† ظ„ط§ طھطھظƒط±ط± ظپظٹ ط§ظ„ظ€ ERP/API.

---

## 2) ط·ط±ظٹظ‚ط© ط§ط³طھط®ط¯ط§ظ… ظ‡ط°ط§ ط§ظ„ظ€ Backlog

- ظƒظ„ ط¨ظ†ط¯ ظ„ظ‡ ID ظ…ط«ظ„ `POS-010` + Phase (`MVP/2/3`) + Priority (`P0/P1/P2`).
- **Definition of Done (DoD) ظ„ظ„ط¨ظ†ظˆط¯ ط§ظ„ط£ط³ط§ط³ظٹط©**:
  - ظٹط¹ظ…ظ„ Online + Offline (ط­ظٹط« ظٹظ†ط·ط¨ظ‚).
  - ظٹط³ط¬ظ„ Audit Trail ظ„ظ„ط£ظپط¹ط§ظ„ ط§ظ„ط­ط³ط§ط³ط©.
  - ظٹط¯ط¹ظ… ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط© Retry ط¨ط¯ظˆظ† طھظƒط±ط§ط± (idempotent).
  - ظ„ط¯ظٹظ‡ ط§ط®طھط¨ط§ط±ط§طھ/طھط­ظ‚ظ‚ ط£ط³ط§ط³ظٹ (Backend unit/API + Frontend smoke).

---

# 3) EPICS + Stories/Tasks

## EPIC A â€” Offline Core (Local DB + Outbox + Sync) (MVP / P0)

- [ ] `POS-001` (MVP/P0) Frontend: طھظˆط­ظٹط¯ Local DB (SQLite) + schema ظ„ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„طھط´ط؛ظٹظ„ظٹط© (orders, payments, shifts, outbox).
- [ ] `POS-002` (MVP/P0) Frontend: Outbox ظ…ط­ظ„ظٹط© ط¨ط­ط§ظ„ط§طھ `pending | sending | failed | synced` + retries + backoff.
- [ ] `POS-003` (MVP/P0) Full stack: ظ…ظپط§طھظٹط­ Idempotency ظ„ظƒظ„ Transaction + طھط®ط²ظٹظ†ظ‡ط§ ظ…ط­ظ„ظٹظ‹ط§ ظˆط±ط¨ط·ظ‡ط§ ط¨ظ€ outbox item.
- [ ] `POS-004` (MVP/P0) Full stack: Delta Sync ظ„ظ„ظ€ Master Data (version/updated_at) + طھط®ط²ظٹظ† â€œط¢ط®ط± ظ†ط³ط®ط©â€‌ + UI ظ„ط­ط§ظ„ط© ط§ظ„ظ…ط²ط§ظ…ظ†ط©.
- [ ] `POS-005` (MVP/P0) ظ‚ط±ط§ط±/طھظˆط«ظٹظ‚: ط³ظٹط§ط³ط© طھط¶ط§ط±ط¨ ط§ظ„ط£ط³ط¹ط§ط± ط£ط«ظ†ط§ط، Offline (ط­ظپط¸ ط§ظ„ط³ط¹ط± ظˆظ‚طھ ط§ظ„ط¨ظٹط¹ ط¯ط§ط®ظ„ Order Lines).
- [ ] `POS-006` (MVP/P0) Frontend: ط´ط§ط´ط©/ظ…ط¤ط´ط± ط­ط§ظ„ط© ط§ظ„ظ…ط²ط§ظ…ظ†ط©: Pending/Synced/Failed + ط²ط± â€œRetry nowâ€‌ + طھظپط§طµظٹظ„ ط¢ط®ط± ط®ط·ط£.

## EPIC B â€” ERP Integration API Contracts (MVP / P0)

- [ ] `POS-010` (MVP/P0) Backend: Device Registration + Auth/Token + ط±ط¨ط· ط§ظ„ط¬ظ‡ط§ط² ط¨ظپط±ط¹/tenant.
- [ ] `POS-011` (MVP/P0) Backend: `GET /master-data` (delta) ظ„ظ„ظ…ظ†ظٹظˆ/ط§ظ„ط£ط³ط¹ط§ط±/ط§ظ„ط¶ط±ط§ط¦ط¨/ط§ظ„ظ€ 86/configs/users/roles.
- [ ] `POS-012` (MVP/P0) Backend: `POST /transactions/orders` ظ…ط¹ idempotency key + validations + response stable.
- [ ] `POS-013` (MVP/P0) Backend: `POST /transactions/refunds` ظ…ط¹ idempotency key + ط³ط¨ط¨.
- [ ] `POS-014` (MVP/P0) Backend: `POST /transactions/shifts/close` + ظ…ظ„ط®طµ ط·ط±ظ‚ ط§ظ„ط¯ظپط¹ + ظپط±ظˆظ‚ط§طھ.
- [ ] `POS-015` (MVP/P0) Backend: Health/Heartbeat endpoint + last-seen device status.

## EPIC C â€” Order Types + Sales Screen (FOH) (MVP / P0)

- [ ] `POS-020` (MVP/P0) Frontend: ط´ط§ط´ط© ط§ظ„ط¨ظٹط¹ (ط¨ط­ط« + طھطµظ†ظٹظپط§طھ + Favorites/Hotkeys) ظ…ط¹ ط£ط¯ط§ط، ط³ط±ظٹط¹ (ط¥ط¶ط§ظپط© طµظ†ظپ < 200ms ظ…ط­ظ„ظٹظ‹ط§).
- [ ] `POS-021` (MVP/P0) Frontend: ط¯ط¹ظ… ظ‚ظ†ظˆط§طھ ط§ظ„ط¨ظٹط¹: Dineâ€‘in / Takeaway / Delivery (ط¯ط§ط®ظ„ظٹ ط¨ط³ظٹط·) / Pickâ€‘up.
- [ ] `POS-022` (MVP/P0) Frontend: ط³ظ„ط© ط§ظ„ط·ظ„ط¨: طھط¹ط¯ظٹظ„ ظƒظ…ظٹط§طھطŒ ظ…ظ„ط§ط­ط¸ط§طھ ط¹ظ„ظ‰ ط§ظ„طµظ†ظپطŒ void ظ‚ط¨ظ„ ط§ظ„ط¯ظپط¹ ط­ط³ط¨ ط§ظ„طµظ„ط§ط­ظٹط§طھ.
- [ ] `POS-023` (MVP/P0) Frontend: Hold/Recall ظ„ظ„ط·ظ„ط¨ط§طھ ط؛ظٹط± ط§ظ„ظ…ط¯ظپظˆط¹ط© (ظ…ط¹ ط­ظپط¸ ظ…ط­ظ„ظٹ Offline).
- [ ] `POS-024` (MVP/P1) Frontend: Preâ€‘order ط¨ظˆظ‚طھ ظ…ط­ط¯ط¯.

## EPIC D â€” Tables (Dineâ€‘in) (MVP / P0)

- [ ] `POS-030` (MVP/P0) Frontend: Floor plan MVP (ظ‚ط§ط¦ظ…ط© ط·ط§ظˆظ„ط§طھ + ط­ط§ظ„ط§طھ) ط¨ط¯ظˆظ† طھطµظ…ظٹظ… ط±ط³ظˆظ…ظٹ ظ…ط¹ظ‚ط¯.
- [ ] `POS-031` (MVP/P0) Frontend: ظپطھط­ Check ط¹ظ„ظ‰ ط·ط§ظˆظ„ط© + ظ†ظ‚ظ„ ط·ط§ظˆظ„ط© + ط¯ظ…ط¬/ظپطµظ„ (ط¹ظ„ظ‰ ظ…ط³طھظˆظ‰ ط§ظ„ط·ظ„ط¨ط§طھ).
- [ ] `POS-032` (MVP/P1) Frontend: Seats + Split by seat.
- [ ] `POS-033` (Phase2/P1) Frontend: Reservations + Waitlist.

## EPIC E â€” Menu / Modifiers / Combos / Scheduling / 86 (MVP / P0)

- [ ] `POS-040` (MVP/P0) Full stack: ط¹ط±ط¶ ط§ظ„ظ…ظ†ظٹظˆ ظ…ظ† Master Data (طھطµظ†ظٹظپط§طھ/ط£طµظ†ط§ظپ/طµظˆط±) + caching ظ…ط­ظ„ظٹ.
- [ ] `POS-041` (MVP/P0) Frontend: Modifiers (ط¥ط¬ط¨ط§ط±ظٹ/ط§ط®طھظٹط§ط±ظٹ + min/max + ظ…ط¬ط§ظ†ظٹ ط­طھظ‰ ط­ط¯ ط«ظ… ظ…ط¯ظپظˆط¹ + surcharges).
- [ ] `POS-042` (MVP/P1) Full stack: Combos/Meals (ط£ط³ط§ط³ظٹ).
- [ ] `POS-043` (Phase2/P1) Full stack: Menu Scheduling ط­ط³ط¨ ط§ظ„ظٹظˆظ…/ط§ظ„ظˆظ‚طھ (Breakfast/Happy Hour).
- [ ] `POS-044` (MVP/P0) Full stack: 86 / Out of Stock (طھط¹ط·ظٹظ„ ظ…ط­ظ„ظٹ + ظ…ط±ظƒط²ظٹ) + ظ…ظ†ط¹ ط§ظ„ط¨ظٹط¹ ط­ط³ط¨ ط§ظ„ط³ظٹط§ط³ط©.

## EPIC F â€” Taxes / Service / Rounding (MVP / P0)

- [ ] `POS-050` (MVP/P0) Full stack: VAT/Taxes (ط¶ط±ظٹط¨ط© ظ„ظƒظ„ طµظ†ظپ/ظپط§طھظˆط±ط©) + ط¯ط¹ظ… ط£ظƒط«ط± ظ…ظ† ط¶ط±ظٹط¨ط© ط¹ظ†ط¯ ط§ظ„ط­ط§ط¬ط©.
- [ ] `POS-051` (MVP/P0) Full stack: Service Charge (ظ†ط³ط¨ط©/ظ…ط¨ظ„ط؛) + ظ‚ظˆط§ط¹ط¯ ظ‚ظ†ط§ط© ط§ظ„ط¨ظٹط¹.
- [ ] `POS-052` (MVP/P1) Full stack: Rounding Rules + ط¥ط¸ظ‡ط§ط± ط§ظ„ط¶ط±ط§ط¦ط¨ ظپظٹ ط§ظ„ظپط§طھظˆط±ط© ط­ط³ط¨ ط§ظ„ظ…طھط·ظ„ط¨ط§طھ.

## EPIC G â€” Payments / Billing / Refunds (MVP / P0)

- [ ] `POS-060` (MVP/P0) Full stack: Payments (Cash + Card طھط³ط¬ظٹظ„) + Split Payment.
- [ ] `POS-061` (MVP/P0) Frontend: Split Bill (ط£ط³ط§ط³ظٹ) طھظ‚ط³ظٹظ… ط¹ظ„ظ‰ ط£ط´ط®ط§طµ/ط¨ظ†ظˆط¯.
- [ ] `POS-062` (MVP/P1) Full stack: Partial/Pending payments.
- [ ] `POS-063` (MVP/P0) Full stack: Refund/Void after payment ظ…ط¹ ط³ط¨ط¨ + طµظ„ط§ط­ظٹط© ظ…ط¯ظٹط± + طھط±ط­ظٹظ„ ERP.
- [ ] `POS-064` (Phase2/P2) Full stack: Tips + Wallet/Store Credit + Gift Cards.

## EPIC H â€” Kitchen (Printing + KDS) (MVP / P0)

- [ ] `POS-070` (MVP/P0) Full stack: Kitchen Printer Routing (ظ…ط­ط·ط© ظ„ظƒظ„ طµظ†ظپ) + ط·ط§ط¨ط¹ط© ظ„ظƒظ„ ظ…ط­ط·ط©.
- [ ] `POS-071` (MVP/P0) Frontend: ط·ط¨ط§ط¹ط© طھط°ظƒط±ط© ظ…ط·ط¨ط® ط¹ظ†ط¯ â€œSend to kitchenâ€‌ + ط¥ط¹ط§ط¯ط© ط·ط¨ط§ط¹ط©.
- [ ] `POS-072` (Phase2/P1) Full stack: KDS (New â†’ Preparing â†’ Ready â†’ Served) + ط£ظˆظ‚ط§طھ طھط­ط¶ظٹط± + طھط£ط®ظٹط±ط§طھ + Expo.

## EPIC I â€” Shifts & Cash Management (MVP / P0)

- [ ] `POS-080` (MVP/P0) Full stack: ظپطھط­ ظˆط±ط¯ظٹط© + ط±طµظٹط¯ ط§ظپطھطھط§ط­ظٹ + ظƒط§ط´ظٹط±.
- [ ] `POS-081` (MVP/P0) Full stack: ط¥ط؛ظ„ط§ظ‚ ظˆط±ط¯ظٹط© + ط¹ط¯ظ‘ ظ†ظ‚ط¯ظٹ + ظپط±ظˆظ‚ط§طھ + طھظ‚ط±ظٹط± ظ…ظ„ط®طµ (X/Z).
- [ ] `POS-082` (MVP/P0) Full stack: Paid In / Paid Out ظ…ط¹ ط³ط¨ط¨ + طµظ„ط§ط­ظٹط§طھ + طھط±ط­ظٹظ„.
- [ ] `POS-083` (Phase2/P2) Full stack: Safe Drop / Cash Drop.

## EPIC J â€” RBAC + Audit Trail (MVP / P0)

- [ ] `POS-090` (MVP/P0) Backend: ط£ط¯ظˆط§ط± ظˆطµظ„ط§ط­ظٹط§طھ ط¯ظ‚ظٹظ‚ط© (RBAC) + ط³ظٹط§ط³ط§طھ ط¹ظ„ظ‰ API.
- [ ] `POS-091` (MVP/P0) Full stack: Manager Override PIN ظ„ط¹ظ…ظ„ظٹط§طھ ط­ط³ط§ط³ط© (discount/void/refund/price override/shift closeâ€¦).
- [ ] `POS-092` (MVP/P0) Backend: Audit Log appendâ€‘only (actor + action + reason + timestamps).

## EPIC K â€” Customers / Loyalty (Phase2)

- [ ] `POS-100` (Phase2/P1) Full stack: ظ…ظ„ظپ ط¹ظ…ظٹظ„ + طھط§ط±ظٹط® ط·ظ„ط¨ط§طھ + ظ…ظ„ط§ط­ط¸ط§طھ ط­ط³ط§ط³ظٹط©/طھظپط¶ظٹظ„ط§طھ.
- [ ] `POS-101` (Phase2/P2) Full stack: Loyalty points + wallet + vouchers.

## EPIC L â€” Reporting (MVP/Phase2)

- [ ] `POS-110` (MVP/P1) Full stack: طھظ‚ط§ط±ظٹط± ظٹظˆظ…ظٹط© ط¯ط§ط®ظ„ POS (ظ‚ظ†ط§ط©/ظƒط§ط´ظٹط±/طµظ†ظپ + ط·ط±ظ‚ ط§ظ„ط¯ظپط¹ + ط®طµظˆظ…ط§طھ/void/refunds).
- [ ] `POS-111` (Phase2/P2) Full stack: طھظ‚ط§ط±ظٹط± ظ…ط·ط¨ط® (ظ…طھظˆط³ط· ط²ظ…ظ† ط§ظ„طھط­ط¶ظٹط±) ط¹ظ†ط¯ طھظˆظپط± KDS.

## EPIC M â€” Inventory Posting (ERP-side) (Phase2/3)

- [ ] `POS-120` (Phase2/P1) ERP/Backend: طھط±ط­ظٹظ„ ط§ط³طھظ‡ظ„ط§ظƒ ط§ظ„ظ…ظƒظˆظ†ط§طھ ط­ط³ط¨ Recipe/BOM ط¹ظ†ط¯ ط§ط³طھظ„ط§ظ… ظ…ط¨ظٹط¹ط§طھ POS.
- [ ] `POS-121` (Phase2/P2) ERP/Backend: Waste/Staff meals/Samples ظƒط­ط±ظƒط§طھ ظ…ظ†ظپطµظ„ط©.
- [ ] `POS-122` (Phase2/P2) ERP/Backend: 86 ط¯ظٹظ†ط§ظ…ظٹظƒظٹ ظ…ط±طھط¨ط· ط¨ط§ظ„ظ…ظƒظˆظ†ط§طھ ظ„ظ…ظ†ط¹ ط¨ظٹط¹ ط£طµظ†ط§ظپ ط؛ظٹط± ظ…طھط§ط­ط©.

## EPIC N â€” Enterprise (Phase3)

- [ ] `POS-130` (Phase3/P1) Full stack: Local Branch Server ظ„طھظˆط­ظٹط¯ ط§ظ„ط·ط§ظˆظ„ط§طھ/ط§ظ„ط·ط¨ط§ط¹ط© ط¨ظٹظ† ط£ط¬ظ‡ط²ط© ط§ظ„ظپط±ط¹ ط£ط«ظ†ط§ط، Offline.
- [ ] `POS-131` (Phase3/P2) Full stack: BI dashboards + ظ…ط±ط§ظ‚ط¨ط© ط§ظ„ظپط±ظˆط¹ (ط¢ط®ط± ظ…ط²ط§ظ…ظ†ط©/ط£ط®ط·ط§ط، ط·ط¨ط§ط¹ط©/ظپظˆط§طھظٹط± ظ…ط¹ظ„ظ‘ظ‚ط©).
- [ ] `POS-132` (Phase3/P2) Full stack: Multiâ€‘brand / multiâ€‘concept + multiâ€‘menu.

---

# 4) Sprint 0 (ط§ط¨ط¯ط£ ط§ظ„ط¹ظ…ظ„ ط§ظ„ط¢ظ†) â€” Spikes/Decisions (MVP / P0)

> ط§ظ„ظ‡ط¯ظپ: ط­ط³ظ… ظ‚ط±ط§ط±ط§طھ ظ…ط¹ظ…ط§ط±ظٹط© â€œط®ط·ظٹط±ط©â€‌ ظ‚ط¨ظ„ طھظ†ظپظٹط° UI ظƒط¨ظٹط±.

- [ ] `POS-900` ظ‚ط±ط§ط± **طھط±ظ‚ظٹظ… ط§ظ„ظپظˆط§طھظٹط± Offline**:
  - Option A: Number ranges ظ„ظƒظ„ ظپط±ط¹/ط¬ظ‡ط§ط² طھظڈط­ط¬ط² ظ…ط³ط¨ظ‚ظ‹ط§.
  - Option B: UUID ظ…ط­ظ„ظٹ + ط±ظ‚ظ… ط±ط³ظ…ظٹ ط¹ظ†ط¯ ط§ظ„ظ…ط²ط§ظ…ظ†ط© (ظ…ط¹ ط£ط«ط± ط¶ط±ظٹط¨ظٹ).
- [ ] `POS-901` ظ‚ط±ط§ط± ط§ظ„ط·ط¨ط§ط¹ط©: ط§ظ„ظ…ظ†طµط§طھ ط§ظ„ظ…ط³طھظ‡ط¯ظپط© (Android/Windows) + ط§ط®طھظٹط§ط± ظ…ظƒطھط¨ط©/SDK (Receipt + Kitchen).
- [ ] `POS-902` طھظˆط«ظٹظ‚ Contract ظ„ظ„ظ€ Master Data + Transactions (ظ†ظ…ط§ط°ط¬ JSON) + versioning strategy.
- [ ] `POS-903` ظ‚ط±ط§ط± ط³ظٹط§ط³ط© â€œERP ظٹط؛ظٹظ‘ط± ط§ظ„ط³ط¹ط± ط£ط«ظ†ط§ط، Offlineâ€‌ + ظ…ط§ ط§ظ„ط°ظٹ ظٹظڈط·ط¨ط¹ ط¹ظ„ظ‰ ط§ظ„ظپط§طھظˆط±ط©.
- [ ] `POS-904` طھط¹ط±ظٹظپ SLOs ظ„ظ„ط£ط¯ط§ط، (ط¨ط­ط«/ط¥ط¶ط§ظپط© ظ„ظ„ط³ظ„ط©/ط·ط¨ط§ط¹ط©) + ط®ط·ط© ظ‚ظٹط§ط³ ط¨ط³ظٹط·ط© ط¯ط§ط®ظ„ ط§ظ„طھط·ط¨ظٹظ‚.

