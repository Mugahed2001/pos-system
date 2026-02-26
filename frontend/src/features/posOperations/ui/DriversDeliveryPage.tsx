import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fetchExternalOrders, fetchOrders, markExternalOrderReady, retryExternalOrder } from "../api/opsApi";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";
import type { ExternalOrderDto } from "../../sales/model/posTypes";

interface OrderLite {
  id: string;
  channel_code?: string;
  status?: string;
  customer?: string | null;
}

export function DriversDeliveryPage() {
  const { loading, error, branchId, drivers } = usePosOpsBootstrap();
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState("");
  const [externalOrders, setExternalOrders] = useState<ExternalOrderDto[]>([]);
  const [externalLoading, setExternalLoading] = useState(true);
  const [externalError, setExternalError] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!branchId) {
        if (mounted) {
          setOrdersLoading(false);
          setExternalLoading(false);
        }
        return;
      }
      setOrdersLoading(true);
      setOrdersError("");
      setExternalLoading(true);
      setExternalError("");
      try {
        const [payload, externalPayload] = await Promise.all([
          fetchOrders(branchId),
          fetchExternalOrders(branchId),
        ]);
        if (!mounted) return;
        setOrders(payload as OrderLite[]);
        setExternalOrders(externalPayload);
      } catch {
        if (!mounted) return;
        setOrdersError("تعذر تحميل طلبات التوصيل.");
        setExternalError("تعذر تحميل طلبات شركات التوصيل.");
      } finally {
        if (mounted) {
          setOrdersLoading(false);
          setExternalLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [branchId]);

  const deliveryOrders = useMemo(() => {
    return orders.filter((order) => order.channel_code === "delivery" || order.channel_code === "preorder");
  }, [orders]);

  const handleMarkReady = async (externalOrderId: string) => {
    try {
      await markExternalOrderReady(externalOrderId);
      setExternalOrders((current) =>
        current.map((order) =>
          order.id === externalOrderId ? { ...order, last_error: "" } : order,
        ),
      );
    } catch {
      setExternalError("فشل إرسال حالة جاهز إلى المزود.");
    }
  };

  const handleRetry = async (externalOrderId: string) => {
    try {
      await retryExternalOrder(externalOrderId);
      setExternalError("");
    } catch {
      setExternalError("تعذر إعادة المحاولة.");
    }
  };

  if (loading) return <Text style={styles.meta}>جار تحميل السائقين...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>السائقون والتوصيل</Text>

      <View style={styles.card}>
        <Text style={styles.meta}>السائقون النشطون: {drivers.filter((driver) => driver.is_active).length}</Text>
        <Text style={styles.meta}>طلبات التوصيل: {deliveryOrders.length}</Text>
      </View>

      <Text style={styles.section}>طلبات شركات التوصيل</Text>
      {externalLoading ? <Text style={styles.meta}>جار تحميل طلبات الشركات...</Text> : null}
      {externalError ? <Text style={styles.error}>{externalError}</Text> : null}
      {externalOrders.length === 0 ? <Text style={styles.meta}>لا توجد طلبات شركات.</Text> : null}
      {externalOrders.map((order) => (
        <View key={order.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.name}>{order.provider_name}</Text>
            <Text style={styles.badge}>{order.provider_code}</Text>
          </View>
          <Text style={styles.meta}>رقم الطلب لدى الشركة: {order.provider_order_id}</Text>
          <Text style={styles.meta}>حالة الشركة: {externalStatusLabel(order.status_external)}</Text>
          <Text style={styles.meta}>حالة الطلب: {orderStatusLabel(order.mapped_order_status)}</Text>
          {order.last_error ? <Text style={styles.error}>خطأ: {order.last_error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.button} onPress={() => handleMarkReady(order.id)}>
              <Text style={styles.buttonText}>إرسال جاهز</Text>
            </Pressable>
            <Pressable style={styles.buttonOutline} onPress={() => handleRetry(order.id)}>
              <Text style={styles.buttonOutlineText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {drivers.map((driver) => (
        <View key={driver.id} style={styles.card}>
          <Text style={styles.name}>{driver.name}</Text>
          <Text style={styles.meta}>الهاتف: {driver.phone}</Text>
          <Text style={styles.meta}>الحالة: {driver.is_active ? "نشط" : "غير نشط"}</Text>
        </View>
      ))}

      {ordersLoading ? <Text style={styles.meta}>جار تحميل طلبات التوصيل...</Text> : null}
      {ordersError ? <Text style={styles.error}>{ordersError}</Text> : null}

      {deliveryOrders.slice(0, 10).map((order) => (
        <View key={order.id} style={styles.card}>
          <Text style={styles.name}>طلب {order.id.slice(0, 8)}</Text>
          <Text style={styles.meta}>القناة: {channelLabel(order.channel_code)}</Text>
          <Text style={styles.meta}>الحالة: {orderStatusLabel(order.status)}</Text>
          <Text style={styles.meta}>العميل: {order.customer ?? "-"}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 28, fontWeight: "900", color: "#1F2937", textAlign: "right" },
  card: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF", gap: 4 },
  section: { fontWeight: "900", color: "#1F2937", textAlign: "right" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { backgroundColor: "#E0ECFF", color: "#2563EB", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-start" },
  button: { backgroundColor: "#2563EB", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "700" },
  buttonOutline: { borderWidth: 1, borderColor: "#2563EB", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  buttonOutlineText: { color: "#2563EB", fontWeight: "700" },
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

function externalStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    RECEIVED: "مستلم",
    ACCEPTED: "مقبول",
    PREPARING: "قيد التحضير",
    READY: "جاهز",
    PICKED_UP: "تم الاستلام",
    DELIVERED: "تم التوصيل",
    CANCELED: "ملغى",
  };
  if (!status) return "-";
  return labels[status] ?? status;
}

