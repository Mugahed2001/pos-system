import { storage } from "../../../shared/lib/storage";
import type { CreatePosOrderPayload, OutboxItem } from "../model/posTypes";

const OUTBOX_KEY = "pos_outbox_orders";

async function loadOutbox(): Promise<OutboxItem[]> {
  const raw = await storage.getString(OUTBOX_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOutbox(items: OutboxItem[]): Promise<void> {
  await storage.setString(OUTBOX_KEY, JSON.stringify(items));
}

export async function getOutboxCount(): Promise<number> {
  const outbox = await loadOutbox();
  return outbox.length;
}

export async function enqueueCreateOrder(payload: CreatePosOrderPayload): Promise<void> {
  const items = await loadOutbox();
  const now = Date.now();
  items.push({
    id: payload.idempotency_key,
    kind: "create_order",
    payload,
    retries: 0,
    next_retry_at: now,
    created_at: now,
  });
  await saveOutbox(items);
}

export async function flushOutbox(
  sendOrder: (payload: CreatePosOrderPayload) => Promise<unknown>,
): Promise<{ sent: number; failed: number; pending: number }> {
  const now = Date.now();
  const items = await loadOutbox();
  const remaining: OutboxItem[] = [];
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    if (item.next_retry_at > now) {
      remaining.push(item);
      continue;
    }
    try {
      await sendOrder(item.payload);
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
