import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchDailyOpsReports } from "../api/opsApi";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

interface DailySalesReport {
  orders_count?: number;
  grand_total?: string;
  by_channel?: Record<string, string>;
}

interface PaymentsSummaryReport {
  totals?: Record<string, string>;
}

interface VoidsReport {
  voids_count?: number;
  refunds_count?: number;
  discount_total?: string;
}

const formatTotals = (payload?: Record<string, string>) => {
  if (!payload) return "-";
  const entries = Object.entries(payload);
  if (!entries.length) return "-";
  return entries.map(([key, value]) => `${key}: ${value}`).join(" | ");
};

export function DailyReportsPage() {
  const { loading, error, branchId } = usePosOpsBootstrap();
  const [sales, setSales] = useState<DailySalesReport | null>(null);
  const [payments, setPayments] = useState<PaymentsSummaryReport | null>(null);
  const [voids, setVoids] = useState<VoidsReport | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!branchId) {
        if (mounted) {
          setReportsLoading(false);
        }
        return;
      }
      setReportsLoading(true);
      setReportsError("");
      try {
        const payload = await fetchDailyOpsReports(branchId);
        if (!mounted) return;
        setSales(payload.sales as DailySalesReport);
        setPayments(payload.payments as PaymentsSummaryReport);
        setVoids(payload.voids as VoidsReport);
      } catch {
        if (!mounted) return;
        setReportsError("تعذر تحميل التقارير اليومية.");
      } finally {
        if (mounted) {
          setReportsLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [branchId]);

  if (loading) return <Text style={styles.meta}>جار تحميل التقارير...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>التقارير التشغيلية اليومية</Text>

      {reportsLoading ? <Text style={styles.meta}>جار تحميل بيانات التقارير...</Text> : null}
      {reportsError ? <Text style={styles.error}>{reportsError}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.name}>المبيعات</Text>
        <Text style={styles.meta}>عدد الطلبات: {sales?.orders_count ?? 0}</Text>
        <Text style={styles.meta}>الإجمالي: {sales?.grand_total ?? "0.00"}</Text>
        <Text style={styles.meta}>حسب القناة: {formatTotals(sales?.by_channel)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.name}>طرق الدفع</Text>
        <Text style={styles.meta}>الإجماليات حسب الطريقة: {formatTotals(payments?.totals)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.name}>الإلغاءات والخصومات والاسترجاع</Text>
        <Text style={styles.meta}>الإلغاءات: {voids?.voids_count ?? 0}</Text>
        <Text style={styles.meta}>الاسترجاعات: {voids?.refunds_count ?? 0}</Text>
        <Text style={styles.meta}>إجمالي الخصم: {voids?.discount_total ?? "0.00"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 28, fontWeight: "900", color: "#1F2937", textAlign: "right" },
  card: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF", gap: 4 },
  name: { fontWeight: "900", textAlign: "right", color: "#1F2937" },
  meta: { color: "#4B5563", textAlign: "right" },
  error: { color: "#DC2626", textAlign: "right", fontWeight: "700" },
});

