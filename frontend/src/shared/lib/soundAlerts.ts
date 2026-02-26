export type PosAlertTone =
  | "kitchen_new_order"
  | "kitchen_waiter_received"
  | "waiter_ready_pickup";

type ToneStep = {
  frequency: number;
  durationMs: number;
  gapMs: number;
};

const TONE_PATTERNS: Record<PosAlertTone, ToneStep[]> = {
  kitchen_new_order: [
    { frequency: 880, durationMs: 110, gapMs: 40 },
    { frequency: 1175, durationMs: 130, gapMs: 30 },
    { frequency: 1397, durationMs: 160, gapMs: 0 },
  ],
  kitchen_waiter_received: [
    { frequency: 880, durationMs: 120, gapMs: 35 },
    { frequency: 740, durationMs: 160, gapMs: 0 },
  ],
  waiter_ready_pickup: [
    { frequency: 988, durationMs: 120, gapMs: 35 },
    { frequency: 1319, durationMs: 170, gapMs: 0 },
  ],
};

let sharedAudioContext: any | null = null;

function canPlayWebTone() {
  return typeof window !== "undefined" && typeof (window as any).AudioContext !== "undefined";
}

function getAudioContext() {
  if (!canPlayWebTone()) return null;
  if (!sharedAudioContext) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = Ctx ? new Ctx() : null;
  }
  return sharedAudioContext;
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function playStep(ctx: any, step: ToneStep) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(step.frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + step.durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + step.durationMs / 1000);
  await waitMs(step.durationMs + step.gapMs);
}

export async function playPosAlertTone(tone: PosAlertTone) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    const pattern = TONE_PATTERNS[tone];
    for (const step of pattern) {
      await playStep(ctx, step);
    }
  } catch {
    // Ignore audio failures to avoid breaking the POS flow.
  }
}
