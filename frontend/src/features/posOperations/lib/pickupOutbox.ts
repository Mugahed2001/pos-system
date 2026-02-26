import { storage } from "../../../shared/lib/storage";

export type PickupOutboxKind = "mark_arrived" | "mark_ready" | "mark_handed_over";

export interface PickupOutboxItem {
  id: string;
  kind: PickupOutboxKind;
  payload: { orderId: string };
  retries: number;
  next_retry_at: number;
  created_at: number;
}

const OUTBOX_KEY = "pos_pickup_window_outbox";

async function loadOutbox(): Promise<PickupOutboxItem[]> {
  const raw = await storage.getString(OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PickupOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOutbox(items: PickupOutboxItem[]): Promise<void> {
  await storage.setString(OUTBOX_KEY, JSON.stringify(items));
}

export async function getPickupOutboxCount(): Promise<number> {
  const outbox = await loadOutbox();
  return outbox.length;
}

export async function enqueuePickupAction(kind: PickupOutboxKind, orderId: string): Promise<void> {
  const items = await loadOutbox();
  const now = Date.now();
  items.push({
    id: `${kind}-${orderId}-${now}`,
    kind,
    payload: { orderId },
    retries: 0,
    next_retry_at: now,
    created_at: now,
  });
  await saveOutbox(items);
}

export async function flushPickupOutbox(handlers: Record<PickupOutboxKind, (orderId: string) => Promise<unknown>>) {
  const now = Date.now();
  const items = await loadOutbox();
  const remaining: PickupOutboxItem[] = [];
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    if (item.next_retry_at > now) {
      remaining.push(item);
      continue;
    }
    try {
      await handlers[item.kind](item.payload.orderId);
      sent += 1;
    } catch {
      const retries = item.retries + 1;
      const delayMs = Math.min(60_000, 2 ** retries * 1000);
      failed += 1;
      remaining.push({
        ...item,
        retries,
        next_retry_at: now + delayMs,
      });
    }
  }

  await saveOutbox(remaining);
  return { sent, failed, pending: remaining.length };
}
