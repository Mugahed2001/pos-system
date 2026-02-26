import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ACTIVE_SHIFT_ID_KEY, BRANCH_ID_KEY, DEVICE_ID_KEY } from "../../../shared/constants/keys";
import { getPerfSummary, timedOperation } from "../../../shared/lib/perfMetrics";
import { storage } from "../../../shared/lib/storage";
import {
  closeShift,
  fetchActiveShift,
  fetchDeviceContext,
  fetchShifts,
  openShift,
} from "../api/opsApi";
import { enqueueShiftClose, flushShiftCloseOutbox, getShiftCloseOutboxCount } from "../lib/shiftCloseOutbox";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";
import { BRAND_COLORS } from "../../../shared/theme/brand";

const THEME = {
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  success: BRAND_COLORS.success,
  warn: BRAND_COLORS.warning,
  danger: BRAND_COLORS.danger,
  text: BRAND_COLORS.textMain,
  muted: BRAND_COLORS.textSub,
};

type ActiveShiftDto = {
  id: string;
  numeric_id?: string;
  status: string;
  opening_cash: string;
  opened_at?: string;
  username?: string;
};

const toNumericShiftId = (value?: string | null) => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits || "-";
};

export function ShiftOpenClosePage() {
  const { loading, error, branchId: bootstrapBranchId } = usePosOpsBootstrap();

  const [branchId, setBranchId] = useState(bootstrapBranchId);
  const [deviceId, setDeviceId] = useState("");
  const [requiresOpeningCash, setRequiresOpeningCash] = useState(false);
  const [activeShift, setActiveShift] = useState<ActiveShiftDto | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [perfSummary, setPerfSummary] = useState<{ avgMs: number; p95Ms: number; count: number; under2sRate: number }>({
    avgMs: 0,
    p95Ms: 0,
    count: 0,
    under2sRate: 0,
  });

  useEffect(() => {
    let mounted = true;
    const loadIds = async () => {
      const [storedBranchId, storedDeviceId] = await Promise.all([
        storage.getString(BRANCH_ID_KEY),
        storage.getString(DEVICE_ID_KEY),
      ]);
      if (!mounted) return;
      if (storedBranchId) setBranchId(storedBranchId);
      if (storedDeviceId) setDeviceId(storedDeviceId);
    };
    void loadIds();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    void fetchDeviceContext(branchId)
      .then((ctx) => setRequiresOpeningCash(Boolean(ctx?.current_branch?.requires_opening_cash)))
      .catch(() => setRequiresOpeningCash(false));
  }, [branchId]);

  const refreshData = async () => {
    if (!branchId || !deviceId) return;
    setPageError("");
    const [active, shifts, outboxCount, summary] = await Promise.all([
      fetchActiveShift(branchId, deviceId).catch(() => ({ active: false, shift: null })),
      fetchShifts(branchId).catch(() => []),
      getShiftCloseOutboxCount(),
      getPerfSummary("shift_close_ms"),
    ]);
    setActiveShift(active.active ? (active.shift as ActiveShiftDto) : null);
    setRecentShifts((shifts as any[]).slice(0, 10));
    setPendingSyncCount(outboxCount);
    setPerfSummary(summary);
  };

  useEffect(() => {
    if (!branchId || !deviceId) return;
    void refreshData();
  }, [branchId, deviceId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void flushShiftCloseOutbox(({ shiftId, closingCash: closeValue }) =>
        closeShift({ shiftId, closingCash: closeValue, closedAt: new Date().toISOString() }),
      ).then(async () => {
        setPendingSyncCount(await getShiftCloseOutboxCount());
      });
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleOpenShift = async () => {
    if (!branchId || !deviceId) {
      setPageError("الفرع أو الجهاز غير محدد.");
      return;
    }
    if (requiresOpeningCash && !openingCash.trim()) {
      setPageError("رصيد الافتتاح مطلوب.");
      return;
    }
    try {
      setPageError("");
      setPageSuccess("");
      const response = await timedOperation("shift_open_ms", () =>
        openShift({
          branchId,
          deviceId,
          openingCash: openingCash.trim() || "0.00",
          idempotencyKey: `shift-open-manual-${Date.now()}`,
          openedAt: new Date().toISOString(),
        }),
      );
      await storage.setString(ACTIVE_SHIFT_ID_KEY, response.id);
      setOpeningCash("");
      setPageSuccess(response.reused ? "تم استخدام الوردية المفتوحة الحالية." : "تم فتح الوردية بنجاح.");
      await refreshData();
    } catch {
      setPageError("تعذر فتح الوردية.");
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift?.id) {
      setPageError("لا توجد وردية مفتوحة.");
      return;
    }
    const closeValue = closingCash.trim();
    if (!closeValue) {
      setPageError("يرجى إدخال رصيد الإغلاق.");
      return;
    }
    if (Number(closeValue) < 0) {
      setPageError("رصيد الإغلاق لا يمكن أن يكون سالبًا.");
      return;
    }
    try {
      setPageError("");
      setPageSuccess("");
      await timedOperation("shift_close_ms", () =>
        closeShift({
          shiftId: activeShift.id,
          closingCash: Number(closeValue).toFixed(2),
          closedAt: new Date().toISOString(),
        }),
      );
      await storage.remove(ACTIVE_SHIFT_ID_KEY);
      setClosingCash("");
      setPageSuccess("تم إغلاق الوردية بنجاح.");
      await refreshData();
    } catch {
      await enqueueShiftClose({ shiftId: activeShift.id, closingCash: Number(closeValue).toFixed(2) });
      await storage.remove(ACTIVE_SHIFT_ID_KEY);
      setClosingCash("");
      setPageSuccess("تم حفظ إغلاق الوردية محليًا وسيتم مزامنته لاحقًا.");
      setPendingSyncCount(await getShiftCloseOutboxCount());
      setActiveShift(null);
    }
  };

  const variance = useMemo(() => {
    if (!activeShift) return 0;
    return Number(closingCash || 0) - Number(activeShift.opening_cash || 0);
  }, [activeShift, closingCash]);

  if (loading) return <Text style={styles.meta}>جار تحميل بيانات الوردية...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>فتح وإغلاق الوردية</Text>
      {pageError ? <Text style={styles.error}>{pageError}</Text> : null}
      {pageSuccess ? <Text style={styles.success}>{pageSuccess}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>حالة الجهاز</Text>
        <Text style={styles.meta}>الفرع: {branchId || "غير محدد"}</Text>
        <Text style={styles.meta}>الجهاز: {deviceId || "غير محدد"}</Text>
        <Text style={styles.meta}>عمليات إغلاق بانتظار المزامنة: {pendingSyncCount}</Text>
      </View>

      {activeShift ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>إغلاق الوردية الحالية</Text>
          <Text style={styles.meta}>رقم الوردية: {toNumericShiftId(activeShift.numeric_id ?? activeShift.id)}</Text>
          <Text style={styles.meta}>رصيد الافتتاح: {activeShift.opening_cash}</Text>
          <Text style={styles.meta}>المستخدم: {activeShift.username || "-"}</Text>
          <TextInput
            value={closingCash}
            onChangeText={setClosingCash}
            keyboardType="numeric"
            placeholder="رصيد الإغلاق"
            style={styles.input}
          />
          <Text style={styles.meta}>الفارق المتوقع: {Number.isFinite(variance) ? variance.toFixed(2) : "0.00"}</Text>
          <Pressable style={styles.primaryButton} onPress={handleCloseShift}>
            <Text style={styles.primaryButtonText}>إغلاق الوردية</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>فتح وردية جديدة</Text>
          <TextInput
            value={openingCash}
            onChangeText={setOpeningCash}
            keyboardType="numeric"
            placeholder={requiresOpeningCash ? "رصيد الافتتاح (مطلوب)" : "رصيد الافتتاح (اختياري)"}
            style={styles.input}
          />
          <Pressable style={styles.primaryButton} onPress={handleOpenShift}>
            <Text style={styles.primaryButtonText}>فتح الوردية</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>مؤشر أداء الإغلاق</Text>
        <Text style={styles.meta}>عدد العينات: {perfSummary.count}</Text>
        <Text style={styles.meta}>متوسط الزمن: {perfSummary.avgMs.toFixed(0)} ms</Text>
        <Text style={styles.meta}>p95: {perfSummary.p95Ms.toFixed(0)} ms</Text>
        <Text style={styles.meta}>نسبة أقل من ثانيتين: {perfSummary.under2sRate.toFixed(1)}%</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>آخر الورديات</Text>
        <ScrollView style={{ maxHeight: 220 }}>
          {recentShifts.map((shift) => (
            <View key={shift.id} style={styles.shiftRow}>
              <Text style={styles.meta}>#{toNumericShiftId(shift.numeric_id ?? shift.id)} - {shift.status === "open" ? "مفتوحة" : "مغلقة"}</Text>
              <Text style={styles.meta}>افتتاح: {shift.opening_cash} | إغلاق: {shift.closing_cash ?? "-"}</Text>
            </View>
          ))}
          {recentShifts.length === 0 ? <Text style={styles.meta}>لا توجد سجلات ورديات.</Text> : null}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 28, fontWeight: "900", color: THEME.text, textAlign: "right" },
  card: { borderWidth: 1, borderColor: THEME.border, borderRadius: 12, backgroundColor: THEME.card, padding: 12, gap: 8 },
  sectionTitle: { fontWeight: "900", color: THEME.text, textAlign: "right" },
  meta: { color: THEME.muted, textAlign: "right", fontWeight: "700" },
  error: { color: THEME.danger, textAlign: "right", fontWeight: "800" },
  success: { color: THEME.success, textAlign: "right", fontWeight: "800" },
  input: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, minHeight: 40, paddingHorizontal: 10, textAlign: "right" },
  primaryButton: { backgroundColor: THEME.primary, borderRadius: 10, minHeight: 42, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "900" },
  shiftRow: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 8, marginBottom: 6, gap: 4 },
});
