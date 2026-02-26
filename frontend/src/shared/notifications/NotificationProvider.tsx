import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

type NotificationTone = "success" | "error" | "warning" | "info";

type NotificationInput = {
  message: string;
  title?: string;
  tone?: NotificationTone;
  durationMs?: number;
};

type NotificationItem = NotificationInput & {
  id: string;
  tone: NotificationTone;
  durationMs: number;
};

type NotificationContextValue = {
  notify: (input: NotificationInput) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const DEFAULT_DURATION = 2400;

const TONE_STYLES: Record<NotificationTone, { bg: string; border: string; title: string }> = {
  success: { bg: "#ECFDF3", border: "#86EFAC", title: "#065F46" },
  error: { bg: "#FEF2F2", border: "#FCA5A5", title: "#991B1B" },
  warning: { bg: "#FFFBEB", border: "#FCD34D", title: "#92400E" },
  info: { bg: "#EFF6FF", border: "#93C5FD", title: "#1E3A8A" },
};

const TONE_LABEL: Record<NotificationTone, string> = {
  success: "نجاح",
  error: "خطأ",
  warning: "تنبيه",
  info: "معلومة",
};

const makeId = () => `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const [active, setActive] = useState<NotificationItem | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissActive = useCallback(() => {
    clearTimer();
    setActive(null);
  }, [clearTimer]);

  const notify = useCallback((input: NotificationInput) => {
    if (!input.message?.trim()) return;
    const item: NotificationItem = {
      id: makeId(),
      message: input.message.trim(),
      title: input.title?.trim(),
      tone: input.tone ?? "info",
      durationMs: Math.max(1200, input.durationMs ?? DEFAULT_DURATION),
    };
    setQueue((prev) => [...prev, item]);
  }, []);

  const success = useCallback((message: string, durationMs?: number) => notify({ message, tone: "success", durationMs }), [notify]);
  const error = useCallback((message: string, durationMs?: number) => notify({ message, tone: "error", durationMs }), [notify]);
  const warning = useCallback((message: string, durationMs?: number) => notify({ message, tone: "warning", durationMs }), [notify]);
  const info = useCallback((message: string, durationMs?: number) => notify({ message, tone: "info", durationMs }), [notify]);

  useEffect(() => {
    if (active || queue.length === 0) return;
    setActive(queue[0]);
    setQueue((prev) => prev.slice(1));
  }, [active, queue]);

  useEffect(() => {
    clearTimer();
    if (!active) return;
    timerRef.current = setTimeout(() => {
      setActive(null);
    }, active.durationMs);
    return clearTimer;
  }, [active, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const value = useMemo<NotificationContextValue>(
    () => ({ notify, success, error, warning, info }),
    [notify, success, error, warning, info],
  );

  const toneStyle = active ? TONE_STYLES[active.tone] : null;

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {active && toneStyle ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <Pressable
            accessibilityRole="alert"
            accessibilityLabel={active.title || TONE_LABEL[active.tone]}
            style={[styles.toast, { backgroundColor: toneStyle.bg, borderColor: toneStyle.border }]}
            onPress={dismissActive}
          >
            <Text style={[styles.title, { color: toneStyle.title }]}>{active.title || TONE_LABEL[active.tone]}</Text>
            <Text style={styles.message}>{active.message}</Text>
          </Pressable>
        </View>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: Platform.OS === "web" ? 18 : 24,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    paddingHorizontal: 16,
  },
  toast: {
    width: "100%",
    maxWidth: 560,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
    ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(0,0,0,0.12)" } as any) : {}),
  },
  title: {
    textAlign: "right",
    fontWeight: "900",
    fontSize: 15,
  },
  message: {
    textAlign: "right",
    color: "#1F2937",
    fontWeight: "700",
    fontSize: 14,
  },
});
