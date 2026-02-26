import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ACTIVE_SHIFT_ID_KEY, POS_CASHIER_SETTINGS_KEY } from "../../../shared/constants/keys";
import { playPosAlertTone } from "../../../shared/lib/soundAlerts";
import { storage } from "../../../shared/lib/storage";
import { BRAND_COLORS } from "../../../shared/theme/brand";
import { fetchCashierOrders } from "../cashier/api/cashierApi";
import type { CashierOrderListItem } from "../cashier/model/types";
import { fetchKdsQueue, markKdsItemStatus, markWaiterOrderDelivered } from "../api/opsApi";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

type KdsStatus = "new" | "preparing" | "ready" | "served";

interface KdsQueueItem {
  id: string;
  order_id: string;
  order_number: number | null;
  status: KdsStatus;
  item_name: string;
  item_quantity: string;
  queued_at: string;
}

interface WaiterTicket {
  orderId: string;
  orderNumber: number | null;
  createdAt: string;
  readyAt: string | null;
  tableLabel: string;
  customerLabel: string;
  lines: string[];
  readyItemIds: string[];
}

function normalizeQty(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
  return n.toFixed(3);
}

function formatTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

function minIso(items: string[]) {
  if (!items.length) return new Date().toISOString();
  return [...items].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
}

export function WaiterTrackingPage() {
  const { loading, error, branchId } = usePosOpsBootstrap();

  const [activeShiftId, setActiveShiftId] = useState("");
  const [ordersById, setOrdersById] = useState<Record<string, CashierOrderListItem>>({});
  const [queue, setQueue] = useState<KdsQueueItem[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [pageError, setPageError] = useState("");
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const previousReadyOrderIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([storage.getString(ACTIVE_SHIFT_ID_KEY), storage.getString(POS_CASHIER_SETTINGS_KEY)]).then(([shiftId, rawSettings]) => {
      if (!mounted) return;
      setActiveShiftId(shiftId || "");
      try {
        const parsed = rawSettings ? (JSON.parse(rawSettings) as { soundAlerts?: unknown }) : null;
        setSoundAlertsEnabled(parsed?.soundAlerts !== false);
      } catch {
        setSoundAlertsEnabled(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!branchId || !activeShiftId) {
      setQueue([]);
      setOrdersById({});
      return;
    }

    try {
      const [kdsQueue, submittedOrders, completedOrders, paidOrders] = await Promise.all([
        fetchKdsQueue(branchId),
        fetchCashierOrders({ branchId, status: "submitted", held: false }),
        fetchCashierOrders({ branchId, status: "completed", held: false }),
        fetchCashierOrders({ branchId, status: "paid", held: false }),
      ]);

      const indexedOrders: Record<string, CashierOrderListItem> = {};
      for (const order of [...submittedOrders, ...completedOrders, ...paidOrders]) {
        indexedOrders[order.id] = order;
      }

      setOrdersById(indexedOrders);
      setQueue((kdsQueue as KdsQueueItem[]).filter((item) => item.order_id));
      setPageError("");
    } catch {
      setPageError("تعذر تحميل تدفق طلبات الويتر.");
    }
  }, [activeShiftId, branchId]);

  useEffect(() => {
    if (!loading && branchId && activeShiftId) {
      void loadData();
    }
  }, [loading, branchId, activeShiftId, loadData]);

  useEffect(() => {
    if (!branchId || !activeShiftId) return;
    const timer = setInterval(() => {
      void loadData();
    }, 7000);
    return () => clearInterval(timer);
  }, [branchId, activeShiftId, loadData]);

  const grouped = useMemo(() => {
    const byOrder = new Map<string, KdsQueueItem[]>();
    for (const item of queue) {
      const current = byOrder.get(item.order_id) ?? [];
      current.push(item);
      byOrder.set(item.order_id, current);
    }

    const readyForPickup: WaiterTicket[] = [];
    const withWaiter: WaiterTicket[] = [];
    const delivered: WaiterTicket[] = [];

    for (const [orderId, items] of byOrder.entries()) {
      const order = ordersById[orderId];
      if (order?.handed_over_at) continue;

      const allReadyOrServed = items.every((item) => item.status === "ready" || item.status === "served");
      const allServed = items.every((item) => item.status === "served");
      const readyItems = items.filter((item) => item.status === "ready");
      const first = items[0];

      const ticket: WaiterTicket = {
        orderId,
        orderNumber: order?.order_number ?? first?.order_number ?? null,
        createdAt: order?.created_at ?? minIso(items.map((item) => item.queued_at)),
        readyAt: order?.ready_at ?? null,
        tableLabel: order?.table || "-",
        customerLabel: order?.customer_name || "عميل مباشر",
        lines: items.map((item) => `${item.item_name} x ${normalizeQty(item.item_quantity)}`),
        readyItemIds: readyItems.map((item) => item.id),
      };

      if (allReadyOrServed && readyItems.length > 0) {
        readyForPickup.push(ticket);
      } else if (allServed) {
        withWaiter.push(ticket);
      }
    }

    const queueByOrderId = new Map<string, KdsQueueItem[]>();
    for (const item of queue) {
      const current = queueByOrderId.get(item.order_id) ?? [];
      current.push(item);
      queueByOrderId.set(item.order_id, current);
    }

    for (const order of Object.values(ordersById)) {
      if (!order.handed_over_at) continue;
      const items = queueByOrderId.get(order.id) ?? [];
      delivered.push({
        orderId: order.id,
        orderNumber: order.order_number,
        createdAt: order.handed_over_at,
        readyAt: order.ready_at,
        tableLabel: order.table || "-",
        customerLabel: order.customer_name || "عميل مباشر",
        lines: items.map((item) => `${item.item_name} x ${normalizeQty(item.item_quantity)}`),
        readyItemIds: [],
      });
    }

    readyForPickup.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    withWaiter.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    delivered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { readyForPickup, withWaiter, delivered };
  }, [ordersById, queue]);

  useEffect(() => {
    const currentReadyIds = new Set(grouped.readyForPickup.map((ticket) => ticket.orderId));
    const previousReadyIds = previousReadyOrderIdsRef.current;
    if (!previousReadyIds) {
      previousReadyOrderIdsRef.current = currentReadyIds;
      return;
    }

    if (soundAlertsEnabled) {
      let hasNewReadyOrder = false;
      for (const orderId of currentReadyIds) {
        if (!previousReadyIds.has(orderId)) {
          hasNewReadyOrder = true;
          break;
        }
      }
      if (hasNewReadyOrder) {
        void playPosAlertTone("waiter_ready_pickup");
      }
    }
    previousReadyOrderIdsRef.current = currentReadyIds;
  }, [grouped.readyForPickup, soundAlertsEnabled]);

  const handleReceived = async (ticket: WaiterTicket) => {
    if (!ticket.readyItemIds.length) return;
    setBusy((prev) => ({ ...prev, [`recv:${ticket.orderId}`]: true }));
    try {
      await Promise.all(ticket.readyItemIds.map((itemId) => markKdsItemStatus(itemId, "served")));
      await loadData();
    } catch {
      setPageError("تعذر تأكيد الاستلام من المطبخ.");
    } finally {
      setBusy((prev) => ({ ...prev, [`recv:${ticket.orderId}`]: false }));
    }
  };

  const handleDelivered = async (ticket: WaiterTicket) => {
    setBusy((prev) => ({ ...prev, [`done:${ticket.orderId}`]: true }));
    try {
      await markWaiterOrderDelivered(ticket.orderId);
      await loadData();
    } catch {
      setPageError("تعذر تأكيد التسليم للعميل.");
    } finally {
      setBusy((prev) => ({ ...prev, [`done:${ticket.orderId}`]: false }));
    }
  };

  if (loading) return <Text style={styles.meta}>جار تحميل شاشة الويتر...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>لوحة الويتر</Text>
        <Pressable style={styles.refreshButton} onPress={() => void loadData()}>
          <Text style={styles.refreshButtonText}>تحديث</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.meta}>جاهز للاستلام: {grouped.readyForPickup.length}</Text>
        <Text style={styles.meta}>مع الويتر للتسليم: {grouped.withWaiter.length}</Text>
        <Text style={styles.meta}>تم التسليم: {grouped.delivered.length}</Text>
      </View>

      {pageError ? <Text style={styles.error}>{pageError}</Text> : null}

      <ScrollView horizontal style={styles.board} contentContainerStyle={styles.boardContent}>
        <View style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>جاهز للاستلام من المطبخ</Text>
            <Text style={styles.columnCount}>{grouped.readyForPickup.length}</Text>
          </View>
          <ScrollView style={styles.columnList} contentContainerStyle={styles.columnListContent}>
            {grouped.readyForPickup.map((ticket) => {
              const sending = busy[`recv:${ticket.orderId}`];
              return (
                <View key={ticket.orderId} style={styles.card}>
                  <Text style={styles.orderNo}>طلب #{ticket.orderNumber ?? ticket.orderId.slice(0, 6)}</Text>
                  <Text style={styles.meta}>الطاولة: {ticket.tableLabel}</Text>
                  <Text style={styles.meta}>العميل: {ticket.customerLabel}</Text>
                  <Text style={styles.meta}>جاهز من: {formatTime(ticket.readyAt)}</Text>
                  <View style={styles.linesWrap}>
                    {ticket.lines.slice(0, 4).map((line) => (
                      <Text key={`${ticket.orderId}-${line}`} style={styles.line}>
                        {line}
                      </Text>
                    ))}
                  </View>
                  <Pressable
                    style={[styles.primaryButton, sending && styles.buttonDisabled]}
                    onPress={() => void handleReceived(ticket)}
                    disabled={Boolean(sending)}
                  >
                    <Text style={styles.primaryButtonText}>{sending ? "جار..." : "تم الاستلام"}</Text>
                  </Pressable>
                </View>
              );
            })}
            {!grouped.readyForPickup.length ? <Text style={styles.emptyText}>لا توجد طلبات جاهزة للاستلام.</Text> : null}
          </ScrollView>
        </View>

        <View style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>مع الويتر للتسليم</Text>
            <Text style={styles.columnCount}>{grouped.withWaiter.length}</Text>
          </View>
          <ScrollView style={styles.columnList} contentContainerStyle={styles.columnListContent}>
            {grouped.withWaiter.map((ticket) => {
              const sending = busy[`done:${ticket.orderId}`];
              return (
                <View key={ticket.orderId} style={styles.card}>
                  <Text style={styles.orderNo}>طلب #{ticket.orderNumber ?? ticket.orderId.slice(0, 6)}</Text>
                  <Text style={styles.meta}>الطاولة: {ticket.tableLabel}</Text>
                  <Text style={styles.meta}>العميل: {ticket.customerLabel}</Text>
                  <Text style={styles.meta}>وقت الطلب: {formatTime(ticket.createdAt)}</Text>
                  <View style={styles.linesWrap}>
                    {ticket.lines.slice(0, 4).map((line) => (
                      <Text key={`${ticket.orderId}-${line}`} style={styles.line}>
                        {line}
                      </Text>
                    ))}
                  </View>
                  <Pressable
                    style={[styles.successButton, sending && styles.buttonDisabled]}
                    onPress={() => void handleDelivered(ticket)}
                    disabled={Boolean(sending)}
                  >
                    <Text style={styles.successButtonText}>{sending ? "جار..." : "تم التسليم للعميل"}</Text>
                  </Pressable>
                </View>
              );
            })}
            {!grouped.withWaiter.length ? <Text style={styles.emptyText}>لا توجد طلبات قيد التسليم الآن.</Text> : null}
          </ScrollView>
        </View>

        <View style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>تم التسليم</Text>
            <Text style={styles.columnCount}>{grouped.delivered.length}</Text>
          </View>
          <ScrollView style={styles.columnList} contentContainerStyle={styles.columnListContent}>
            {grouped.delivered.map((ticket) => (
              <View key={ticket.orderId} style={styles.card}>
                <Text style={styles.orderNo}>طلب #{ticket.orderNumber ?? ticket.orderId.slice(0, 6)}</Text>
                <Text style={styles.meta}>الطاولة: {ticket.tableLabel}</Text>
                <Text style={styles.meta}>العميل: {ticket.customerLabel}</Text>
                <Text style={styles.meta}>وقت التسليم: {formatTime(ticket.createdAt)}</Text>
                {ticket.lines.length ? (
                  <View style={styles.linesWrap}>
                    {ticket.lines.slice(0, 4).map((line) => (
                      <Text key={`${ticket.orderId}-${line}`} style={styles.line}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            {!grouped.delivered.length ? <Text style={styles.emptyText}>لا توجد طلبات تم تسليمها بعد.</Text> : null}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "900", color: BRAND_COLORS.textMain, textAlign: "right" },
  refreshButton: {
    borderWidth: 1,
    borderColor: BRAND_COLORS.primaryBlue,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#EEF5FF",
  },
  refreshButtonText: { color: BRAND_COLORS.primaryBlue, fontWeight: "900" },
  summaryCard: {
    borderWidth: 1,
    borderColor: BRAND_COLORS.border,
    borderRadius: 12,
    backgroundColor: BRAND_COLORS.card,
    padding: 10,
    gap: 2,
  },
  board: { minHeight: 460, maxHeight: 680 },
  boardContent: { gap: 10, alignItems: "flex-start", paddingBottom: 8 },
  column: {
    width: 420,
    maxWidth: 420,
    borderWidth: 1,
    borderColor: BRAND_COLORS.border,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },
  columnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_COLORS.border,
    backgroundColor: "#EEF2F7",
  },
  columnTitle: { color: BRAND_COLORS.textMain, fontWeight: "900" },
  columnCount: { color: BRAND_COLORS.primaryBlue, fontWeight: "900" },
  columnList: { maxHeight: 620 },
  columnListContent: { gap: 8, padding: 8 },
  card: {
    borderWidth: 1,
    borderColor: BRAND_COLORS.border,
    borderRadius: 10,
    backgroundColor: BRAND_COLORS.card,
    padding: 10,
    gap: 5,
  },
  orderNo: { color: BRAND_COLORS.textMain, fontWeight: "900", fontSize: 16, textAlign: "right" },
  linesWrap: { gap: 2, marginTop: 2 },
  line: { color: BRAND_COLORS.textSub, textAlign: "right", fontWeight: "700", fontSize: 13 },
  primaryButton: {
    backgroundColor: BRAND_COLORS.primaryBlue,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "900" },
  successButton: {
    backgroundColor: "#15803D",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  successButtonText: { color: "#FFFFFF", fontWeight: "900" },
  buttonDisabled: { opacity: 0.6 },
  emptyText: { color: BRAND_COLORS.textSub, textAlign: "center", fontWeight: "700", paddingVertical: 12 },
  meta: { color: BRAND_COLORS.textSub, textAlign: "right", fontWeight: "700" },
  error: { color: BRAND_COLORS.danger, textAlign: "right", fontWeight: "700" },
});
