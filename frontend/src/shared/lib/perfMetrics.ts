import { POS_PERF_METRICS_KEY } from "../constants/keys";
import { storage } from "./storage";

export type PerfMetricName =
  | "order_submit_ms"
  | "order_hold_ms"
  | "payment_submit_ms"
  | "receipt_print_ms"
  | "shift_open_ms"
  | "shift_close_ms";

type PerfSample = {
  name: PerfMetricName;
  durationMs: number;
  at: number;
};

const MAX_SAMPLES = 200;

async function loadSamples(): Promise<PerfSample[]> {
  const raw = await storage.getString(POS_PERF_METRICS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PerfSample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSamples(samples: PerfSample[]): Promise<void> {
  await storage.setString(POS_PERF_METRICS_KEY, JSON.stringify(samples.slice(-MAX_SAMPLES)));
}

export async function recordPerfMetric(name: PerfMetricName, durationMs: number): Promise<void> {
  const samples = await loadSamples();
  samples.push({ name, durationMs, at: Date.now() });
  await saveSamples(samples);
}

export async function getPerfSummary(
  name: PerfMetricName,
): Promise<{ avgMs: number; p95Ms: number; count: number; under2sRate: number }> {
  const samples = await loadSamples();
  const filtered = samples.filter((sample) => sample.name === name).map((sample) => sample.durationMs);
  if (!filtered.length) return { avgMs: 0, p95Ms: 0, count: 0, under2sRate: 0 };

  const sorted = [...filtered].sort((a, b) => a - b);
  const total = filtered.reduce((sum, ms) => sum + ms, 0);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const under2s = filtered.filter((ms) => ms <= 2000).length;
  return {
    avgMs: total / filtered.length,
    p95Ms: sorted[p95Index] ?? 0,
    count: filtered.length,
    under2sRate: (under2s / filtered.length) * 100,
  };
}

export async function timedOperation<T>(name: PerfMetricName, op: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await op();
  } finally {
    await recordPerfMetric(name, Date.now() - startedAt);
  }
}
