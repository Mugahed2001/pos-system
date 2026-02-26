import { SHIFT_CLOSE_OUTBOX_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";

export interface ShiftCloseOutboxItem {
  id: string;
  shiftId: string;
  closingCash: string;
  retries: number;
  next_retry_at: number;
  created_at: number;
}

async function loadOutbox(): Promise<ShiftCloseOutboxItem[]> {
  const raw = await storage.getString(SHIFT_CLOSE_OUTBOX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ShiftCloseOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOutbox(items: ShiftCloseOutboxItem[]): Promise<void> {
  await storage.setString(SHIFT_CLOSE_OUTBOX_KEY, JSON.stringify(items));
}

export async function getShiftCloseOutboxCount(): Promise<number> {
  const items = await loadOutbox();
  return items.length;
}

export async function enqueueShiftClose(input: { shiftId: string; closingCash: string }): Promise<void> {
  const items = await loadOutbox();
  const now = Date.now();
  items.push({
    id: `${input.shiftId}-${now}`,
    shiftId: input.shiftId,
    closingCash: input.closingCash,
    retries: 0,
    next_retry_at: now,
    created_at: now,
  });
  await saveOutbox(items);
}

export async function flushShiftCloseOutbox(
  sendClose: (input: { shiftId: string; closingCash: string }) => Promise<unknown>,
): Promise<{ sent: number; failed: number; pending: number }> {
  const items = await loadOutbox();
  const now = Date.now();
  const remaining: ShiftCloseOutboxItem[] = [];
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    if (item.next_retry_at > now) {
      remaining.push(item);
      continue;
    }
    try {
      await sendClose({ shiftId: item.shiftId, closingCash: item.closingCash });
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
