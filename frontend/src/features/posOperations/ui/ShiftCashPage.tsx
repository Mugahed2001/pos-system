import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchShifts } from "../api/opsApi";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";
import { BRAND_COLORS } from "../../../shared/theme/brand";

interface ShiftDto {
  id: string;
  device_id: string;
  username: string;
  status: string;
  opening_cash: string;
  closing_cash: string | null;
  variance: string;
  opened_at: string;
  closed_at: string | null;
}

const asNumber = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

export function ShiftCashPage() {
  const { loading, error, branchId } = usePosOpsBootstrap();
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [shiftsError, setShiftsError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!branchId) {
        if (mounted) {
          setShiftsLoading(false);
        }
        return;
      }
      setShiftsLoading(true);
      setShiftsError("");
      try {
        const payload = await fetchShifts(branchId);
        if (!mounted) return;
        setShifts(payload as ShiftDto[]);
      } catch {
        if (!mounted) return;
        setShiftsError("تعذر تحميل الورديات.");
      } finally {
        if (mounted) {
          setShiftsLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [branchId]);

  const stats = useMemo(() => {
    const open = shifts.filter((shift) => shift.status === "open");
    const closed = shifts.filter((shift) => shift.status === "closed");
    return {
      openCount: open.length,
      closedCount: closed.length,
      openingCash: shifts.reduce((sum, shift) => sum + asNumber(shift.opening_cash), 0),
      variance: shifts.reduce((sum, shift) => sum + asNumber(shift.variance), 0),
    };
  }, [shifts]);

  if (loading) return <Text style={styles.meta}>جار تحميل الورديات...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>الوردية والكاش</Text>
      <View style={styles.card}>
        <Text style={styles.meta}>الورديات المفتوحة: {stats.openCount}</Text>
        <Text style={styles.meta}>الورديات المغلقة: {stats.closedCount}</Text>
        <Text style={styles.meta}>إجمالي رصيد الافتتاح: {stats.openingCash.toFixed(2)}</Text>
        <Text style={styles.meta}>إجمالي الفروقات: {stats.variance.toFixed(2)}</Text>
      </View>

      {shiftsLoading ? <Text style={styles.meta}>جار تحميل سجلات الورديات...</Text> : null}
      {shiftsError ? <Text style={styles.error}>{shiftsError}</Text> : null}

      {shifts.slice(0, 12).map((shift) => (
        <View key={shift.id} style={styles.card}>
          <Text style={styles.name}>{shift.username}</Text>
          <Text style={styles.meta}>الجهاز: {shift.device_id}</Text>
          <Text style={styles.meta}>الحالة: {shiftStatusLabel(shift.status)}</Text>
          <Text style={styles.meta}>رصيد الافتتاح: {shift.opening_cash}</Text>
          <Text style={styles.meta}>رصيد الإغلاق: {shift.closing_cash ?? "-"}</Text>
          <Text style={styles.meta}>الفرق: {shift.variance}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 28, fontWeight: "900", color: BRAND_COLORS.textMain, textAlign: "right" },
  card: {
    borderWidth: 1,
    borderColor: BRAND_COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: BRAND_COLORS.card,
    gap: 4,
  },
  name: { fontWeight: "900", textAlign: "right", color: BRAND_COLORS.textMain },
  meta: { color: BRAND_COLORS.textSub, textAlign: "right" },
  error: { color: BRAND_COLORS.danger, textAlign: "right", fontWeight: "700" },
});

function shiftStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "مفتوحة",
    closed: "مغلقة",
  };
  return labels[status] ?? status;
}

