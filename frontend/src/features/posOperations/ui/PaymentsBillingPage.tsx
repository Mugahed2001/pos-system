import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchOrders } from "../api/opsApi";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

interface OrderLite {
  id: string;
  channel_code?: string;
  status?: string;
  grand_total?: string;
  subtotal?: string;
  tax_total?: string;
}

const asNumber = (value: unknown) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

export function PaymentsBillingPage() {
  const { loading, error, branchId } = usePosOpsBootstrap();
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!branchId) {
        if (mounted) {
          setOrdersLoading(false);
        }
        return;
      }
      setOrdersLoading(true);
      setOrdersError("");
      try {
        const payload = await fetchOrders(branchId);
        if (!mounted) return;
        setOrders(payload as OrderLite[]);
      } catch {
        if (!mounted) return;
        setOrdersError("تعذر تحميل بيانات الفوترة.");
      } finally {
        if (mounted) {
          setOrdersLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [branchId]);

  const totals = useMemo(() => {
    const paid = orders.filter((order) => order.status === "paid");
    const pending = orders.filter((order) => order.status !== "paid");
    return {
      ordersCount: orders.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      paidTotal: paid.reduce((sum, order) => sum + asNumber(order.grand_total), 0),
      pendingTotal: pending.reduce((sum, order) => sum + asNumber(order.grand_total), 0),
    };
  }, [orders]);

  if (loading) return <Text style={styles.meta}>جار تحميل بيانات الدفع...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>الدفع والفوترة</Text>
      <View style={styles.card}>
        <Text style={styles.meta}>إجمالي الطلبات: {totals.ordersCount}</Text>
        <Text style={styles.meta}>الطلبات المدفوعة: {totals.paidCount}</Text>
        <Text style={styles.meta}>الطلبات المعلقة: {totals.pendingCount}</Text>
        <Text style={styles.meta}>إجمالي المدفوع: {totals.paidTotal.toFixed(2)}</Text>
        <Text style={styles.meta}>إجمالي المعلق: {totals.pendingTotal.toFixed(2)}</Text>
      </View>

      {ordersLoading ? <Text style={styles.meta}>جار تحميل الطلبات...</Text> : null}
      {ordersError ? <Text style={styles.error}>{ordersError}</Text> : null}

      {orders.slice(0, 12).map((order) => (
        <View key={order.id} style={styles.card}>
          <Text style={styles.name}>طلب {order.id.slice(0, 8)}</Text>
          <Text style={styles.meta}>القناة: {channelLabel(order.channel_code)}</Text>
          <Text style={styles.meta}>الحالة: {orderStatusLabel(order.status)}</Text>
          <Text style={styles.meta}>الإجمالي: {asNumber(order.grand_total).toFixed(2)}</Text>
        </View>
      ))}
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

function channelLabel(code?: string | null) {
  const labels: Record<string, string> = {
    dine_in: "داخل المطعم",
    takeaway: "سفري",
    pickup: "استلام",
    pickup_window: "استلام من السيارة",
    delivery: "توصيل",
    preorder: "طلب مسبق",
  };
  if (!code) return "-";
  return labels[code] ?? code;
}

function orderStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    draft: "مسودة",
    submitted: "مرسلة",
    paid: "مدفوعة",
    canceled: "ملغاة",
    refunded: "مسترجعة",
    completed: "مكتملة",
  };
  if (!status) return "-";
  return labels[status] ?? status;
}

