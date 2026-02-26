import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  fetchPickupWindowOrders,
  markPickupArrived,
  markPickupHandedOver,
  markPickupReady,
} from "../api/opsApi";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";
import type { PickupWindowOrderDto, PickupWindowStatus } from "../../sales/model/posTypes";
import { enqueuePickupAction, flushPickupOutbox, getPickupOutboxCount } from "../lib/pickupOutbox";

const STATUS_TABS: Array<{ key: PickupWindowStatus; label: string }> = [
  { key: "pending", label: "بانتظار الوصول" },
  { key: "arrived", label: "وصل" },
  { key: "ready", label: "جاهز" },
  { key: "handed_over", label: "تم التسليم" },
];

const statusLabel = (status: PickupWindowStatus) =>
  STATUS_TABS.find((tab) => tab.key === status)?.label ?? status;

export function PickupWindowPage() {
  const { loading, error, branchId } = usePosOpsBootstrap();
  const [orders, setOrders] = useState<PickupWindowOrderDto[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PickupWindowStatus>("pending");
  const [online, setOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!branchId) {
        if (mounted) setOrdersLoading(false);
        return;
      }
      setOrdersLoading(true);
      setOrdersError("");
      try {
        const payload = await fetchPickupWindowOrders(branchId, debouncedQuery, statusFilter);
        if (!mounted) return;
        setOrders(payload);
        setOnline(true);
      } catch {
        if (!mounted) return;
        setOrdersError("تعذر تحميل طلبات شباك الاستلام.");
        setOnline(false);
      } finally {
        if (mounted) setOrdersLoading(false);
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [branchId, debouncedQuery, statusFilter]);

  useEffect(() => {
    const timer = setInterval(() => {
      void flushPickupOutbox({
        mark_arrived: markPickupArrived,
        mark_ready: markPickupReady,
        mark_handed_over: markPickupHandedOver,
      }).then((result) => setPendingSyncCount(result.pending));
      void getPickupOutboxCount().then(setPendingSyncCount);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const total = orders.length;
    const arrived = orders.filter((order) => order.pickup_window_status === "arrived").length;
    const ready = orders.filter((order) => order.pickup_window_status === "ready").length;
    return { total, arrived, ready };
  }, [orders]);

  const updateOrder = (orderId: string, updates: Partial<PickupWindowOrderDto>) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, ...updates } : order)));
  };

  const performAction = async (
    kind: "mark_arrived" | "mark_ready" | "mark_handed_over",
    orderId: string,
  ) => {
    const nowIso = new Date().toISOString();
    try {
      if (kind === "mark_arrived") {
        await markPickupArrived(orderId);
        updateOrder(orderId, { pickup_window_status: "arrived", arrival_at: nowIso });
      }
      if (kind === "mark_ready") {
        await markPickupReady(orderId);
        updateOrder(orderId, { pickup_window_status: "ready", ready_at: nowIso });
      }
      if (kind === "mark_handed_over") {
        await markPickupHandedOver(orderId);
        updateOrder(orderId, { pickup_window_status: "handed_over", handed_over_at: nowIso });
      }
      setOnline(true);
    } catch {
      await enqueuePickupAction(kind, orderId);
      setPendingSyncCount(await getPickupOutboxCount());
      setOnline(false);
    }
  };

  if (loading) return <Text style={styles.meta}>جار تحميل البيانات...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>شباك الاستلام</Text>
      <View style={styles.card}>
        <Text style={styles.meta}>الحالة: {online ? "متصل" : "غير متصل"}</Text>
        <Text style={styles.meta}>طلبات معلقة للمزامنة: {pendingSyncCount}</Text>
        <Text style={styles.meta}>إجمالي الطلبات: {stats.total}</Text>
        <Text style={styles.meta}>واصلين للشباك: {stats.arrived}</Text>
        <Text style={styles.meta}>جاهزة للتسليم: {stats.ready}</Text>
      </View>

      <View style={styles.filters}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="ابحث برقم الطلب أو الهاتف أو كود الاستلام"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
        />
        <View style={styles.tabsRow}>
          {STATUS_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, statusFilter === tab.key && styles.tabActive]}
              onPress={() => setStatusFilter(tab.key)}
            >
              <Text style={[styles.tabText, statusFilter === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {ordersLoading ? <Text style={styles.meta}>جار تحميل الطلبات...</Text> : null}
      {ordersError ? <Text style={styles.error}>{ordersError}</Text> : null}

      {orders.length === 0 ? <Text style={styles.meta}>لا توجد طلبات ضمن هذه الحالة.</Text> : null}

      {orders.map((order) => (
        <View key={order.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.name}>طلب #{order.order_number ?? order.id.slice(0, 6)}</Text>
            <Text style={styles.badge}>{statusLabel(order.pickup_window_status)}</Text>
          </View>
          <Text style={styles.meta}>العميل: {order.customer_name ?? "غير محدد"}</Text>
          <Text style={styles.meta}>الهاتف: {order.customer_phone ?? "-"}</Text>
          <Text style={styles.meta}>كود الاستلام: {order.pickup_code || "-"}</Text>
          <Text style={styles.meta}>الإجمالي: {order.grand_total}</Text>
          <Text style={styles.meta}>وقت الإنشاء: {order.created_at}</Text>

          <View style={styles.actions}>
            {order.pickup_window_status === "pending" ? (
              <Pressable style={styles.button} onPress={() => performAction("mark_arrived", order.id)}>
                <Text style={styles.buttonText}>تم الوصول</Text>
              </Pressable>
            ) : null}
            {order.pickup_window_status === "arrived" ? (
              <Pressable style={styles.button} onPress={() => performAction("mark_ready", order.id)}>
                <Text style={styles.buttonText}>جاهز للتسليم</Text>
              </Pressable>
            ) : null}
            {order.pickup_window_status === "ready" ? (
              <Pressable style={styles.button} onPress={() => performAction("mark_handed_over", order.id)}>
                <Text style={styles.buttonText}>تم التسليم</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 28, fontWeight: "900", color: "#1F2937", textAlign: "right" },
  card: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF", gap: 6 },
  meta: { color: "#4B5563", textAlign: "right" },
  error: { color: "#DC2626", textAlign: "right", fontWeight: "700" },
  name: { fontWeight: "900", textAlign: "right", color: "#1F2937" },
  badge: { backgroundColor: "#E0ECFF", color: "#2563EB", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  filters: { gap: 8 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, minHeight: 42, paddingHorizontal: 10, textAlign: "right", color: "#111827" },
  tabsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  tab: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  tabActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  tabText: { color: "#1F2937", fontWeight: "700", textAlign: "right" },
  tabTextActive: { color: "#FFFFFF" },
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-start" },
  button: { backgroundColor: "#2563EB", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
});

