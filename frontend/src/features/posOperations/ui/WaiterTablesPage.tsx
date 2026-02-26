import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ACTIVE_SHIFT_ID_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import { BRAND_COLORS } from "../../../shared/theme/brand";
import { fetchCashierOrders } from "../cashier/api/cashierApi";
import type { CashierOrderListItem } from "../cashier/model/types";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

type TableVisualState = "available" | "open" | "preparing" | "ready" | "reserved";

const STATE_STYLES: Record<TableVisualState, { bg: string; border: string; text: string; label: string }> = {
  available: { bg: "#ECFDF5", border: "#10B981", text: "#065F46", label: "فارغة" },
  open: { bg: "#FFFBEB", border: "#F59E0B", text: "#92400E", label: "مفتوحة" },
  preparing: { bg: "#FEF2F2", border: "#EF4444", text: "#991B1B", label: "قيد التحضير" },
  ready: { bg: "#EFF6FF", border: "#2563EB", text: "#1E40AF", label: "جاهز للتقديم" },
  reserved: { bg: "#F3F4F6", border: "#9CA3AF", text: "#374151", label: "محجوزة" },
};

function toTime(iso: string | null) {
  if (!iso) return 0;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function resolveTableState(tableStatus: string, order?: CashierOrderListItem): TableVisualState {
  if (tableStatus === "reserved") return "reserved";
  if (!order) return "available";
  if (order.ready_at && !order.handed_over_at) return "ready";
  if (order.status === "submitted") return "preparing";
  return "open";
}

export function WaiterTablesPage() {
  const navigation = useNavigation<any>();
  const { loading, error, branchId, config } = usePosOpsBootstrap();

  const [activeShiftId, setActiveShiftId] = useState("");
  const [ordersByTable, setOrdersByTable] = useState<Record<string, CashierOrderListItem>>({});
  const [pageError, setPageError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void storage.getString(ACTIVE_SHIFT_ID_KEY).then((value) => {
        if (mounted) setActiveShiftId(value || "");
      });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const loadTableOrders = useCallback(async () => {
    if (!branchId || !activeShiftId) {
      setOrdersByTable({});
      return;
    }
    try {
      const [draft, submitted] = await Promise.all([
        fetchCashierOrders({ branchId, shiftId: activeShiftId, status: "draft", held: false }),
        fetchCashierOrders({ branchId, shiftId: activeShiftId, status: "submitted", held: false }),
      ]);
      const byTable: Record<string, CashierOrderListItem> = {};
      for (const order of [...draft, ...submitted]) {
        if (order.channel_code !== "dine_in" || !order.table) continue;
        const current = byTable[order.table];
        if (!current || toTime(order.created_at) > toTime(current.created_at)) {
          byTable[order.table] = order;
        }
      }
      setOrdersByTable(byTable);
      setPageError("");
    } catch {
      setPageError("تعذر تحميل حالات الطاولات.");
    }
  }, [activeShiftId, branchId]);

  useEffect(() => {
    if (!loading && branchId && activeShiftId) {
      void loadTableOrders();
    }
  }, [loading, branchId, activeShiftId, loadTableOrders]);

  useEffect(() => {
    if (!branchId || !activeShiftId) return;
    const timer = setInterval(() => {
      void loadTableOrders();
    }, 10000);
    return () => clearInterval(timer);
  }, [branchId, activeShiftId, loadTableOrders]);

  const tablesByFloor = useMemo(() => {
    if (!config) return [];
    return config.floors.map((floor) => ({
      floor,
      tables: config.tables.filter((table) => table.floor === floor.id),
    }));
  }, [config]);

  const handleOpenTable = (tableId: string) => {
    const existing = ordersByTable[tableId];
    if (existing?.id) {
      navigation.navigate("PosWaiterOrderEntry", { orderId: existing.id });
      return;
    }
    navigation.navigate("PosWaiterOrderEntry");
  };

  if (loading) return <Text style={styles.meta}>جار تحميل الطاولات...</Text>;
  if (error || !config) return <Text style={styles.error}>{error || "لا توجد بيانات للطاولات."}</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>مخطط الصالة والطاولات</Text>
        <Pressable style={styles.refreshButton} onPress={() => void loadTableOrders()}>
          <Text style={styles.refreshButtonText}>تحديث</Text>
        </Pressable>
      </View>

      <View style={styles.legendRow}>
        {(Object.keys(STATE_STYLES) as TableVisualState[]).map((key) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATE_STYLES[key].bg, borderColor: STATE_STYLES[key].border }]} />
            <Text style={styles.legendText}>{STATE_STYLES[key].label}</Text>
          </View>
        ))}
      </View>

      {pageError ? <Text style={styles.error}>{pageError}</Text> : null}

      <ScrollView contentContainerStyle={styles.list}>
        {tablesByFloor.map(({ floor, tables }) => (
          <View key={floor.id} style={styles.floorCard}>
            <Text style={styles.floorTitle}>{floor.name}</Text>
            <View style={styles.tablesGrid}>
              {tables.map((table) => {
                const activeOrder = ordersByTable[table.id];
                const state = resolveTableState(table.status, activeOrder);
                const palette = STATE_STYLES[state];
                return (
                  <Pressable
                    key={table.id}
                    style={[styles.tableCard, { backgroundColor: palette.bg, borderColor: palette.border }]}
                    onPress={() => handleOpenTable(table.id)}
                  >
                    <Text style={[styles.tableCode, { color: palette.text }]}>{table.code}</Text>
                    <Text style={[styles.tableMeta, { color: palette.text }]}>{palette.label}</Text>
                    <Text style={[styles.tableMeta, { color: palette.text }]}>
                      {activeOrder?.order_number ? `طلب #${activeOrder.order_number}` : `المقاعد: ${table.seats_count}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
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
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 999, borderWidth: 1 },
  legendText: { color: BRAND_COLORS.textSub, fontWeight: "700" },
  list: { gap: 10, paddingBottom: 8 },
  floorCard: { borderWidth: 1, borderColor: BRAND_COLORS.border, borderRadius: 12, padding: 12, backgroundColor: BRAND_COLORS.card, gap: 10 },
  floorTitle: { fontWeight: "900", fontSize: 18, color: BRAND_COLORS.textMain, textAlign: "right" },
  tablesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  tableCard: { width: 130, borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  tableCode: { fontWeight: "900", fontSize: 16, textAlign: "right" },
  tableMeta: { fontWeight: "700", textAlign: "right", fontSize: 13 },
  meta: { color: BRAND_COLORS.textSub, textAlign: "right", fontWeight: "700" },
  error: { color: BRAND_COLORS.danger, textAlign: "right", fontWeight: "700" },
});

