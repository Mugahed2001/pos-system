import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import axios from "axios";
import { BRAND_COLORS } from "../../../../shared/theme/brand";

import { useAuth } from "../../../auth";
import type { OrderChannelCode } from "../../../sales/model/posTypes";
import { usePosOpsBootstrap } from "../../model/usePosOpsBootstrap";
import { ACTIVE_SHIFT_ID_KEY } from "../../../../shared/constants/keys";
import { storage } from "../../../../shared/lib/storage";
import { cancelOrder, fetchCashierOrders, holdOrder, resumeOrder } from "../api/cashierApi";
import type { CashierOrderListItem } from "../model/types";

const THEME = {
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  text: BRAND_COLORS.textMain,
  muted: BRAND_COLORS.textSub,
  danger: BRAND_COLORS.danger,
  success: BRAND_COLORS.success,
  warning: BRAND_COLORS.warning,
};

const CHANNEL_LABELS: Record<OrderChannelCode, string> = {
  dine_in: "داخل المطعم",
  takeaway: "سفري",
  pickup: "استلام",
  pickup_window: "استلام من السيارة",
  delivery: "توصيل",
  preorder: "طلب مسبق",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "مرسلة",
  paid: "مدفوعة",
  canceled: "ملغاة",
  refunded: "مسترجعة",
  completed: "مكتملة",
};

function getStatusPalette(status: string) {
  if (status === "paid") return { bg: "#E8F8EF", text: THEME.success };
  if (status === "submitted") return { bg: "#E9F2FB", text: THEME.primary };
  if (status === "draft") return { bg: "#EEF2F7", text: "#516275" };
  if (status === "canceled") return { bg: "#FDECEC", text: THEME.danger };
  if (status === "refunded") return { bg: "#FFF1E7", text: "#C45B1D" };
  return { bg: "#F3F4F6", text: THEME.muted };
}

function mapCancelErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return "تعذر إلغاء الطلب.";
  const data = error.response?.data as
    | string
    | { detail?: string; non_field_errors?: string[]; reason?: string[]; manager_pin?: string[] }
    | undefined;

  const raw =
    (typeof data === "string" ? data : undefined) ||
    (typeof data === "object" && data ? data.detail : undefined) ||
    (typeof data === "object" && data?.non_field_errors?.[0]) ||
    (typeof data === "object" && data?.reason?.[0]) ||
    (typeof data === "object" && data?.manager_pin?.[0]) ||
    "";

  const normalized = String(raw).toLowerCase();
  if (normalized.includes("invalid manager pin")) return "رمز المدير غير صحيح.";
  if (normalized.includes("manager_pin is required")) return "رمز المدير مطلوب لإلغاء الطلب.";
  if (normalized.includes("reason is required")) return "سبب الإلغاء مطلوب.";
  if (normalized.includes("only draft orders")) return "لا يمكن إلغاء إلا طلبات المسودة.";
  if (normalized.includes("permission") || normalized.includes("not authorized")) return "لا تملك صلاحية إلغاء هذا الطلب.";

  return raw ? `تعذر إلغاء الطلب: ${raw}` : "تعذر إلغاء الطلب.";
}

function normalizeCustomerName(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "غير محدد";
  if (raw.includes("�")) return "عميل مباشر";
  if (raw === "ط¹ظ…ظٹظ„ ظ…ط¨ط§ط´ط±" || raw === "Ø¹Ù…ÙŠÙ„ Ù…Ø¨Ø§Ø´Ø±") return "عميل مباشر";
  return raw;
}

export function OpenOrdersPage() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { loading, error, branchId } = usePosOpsBootstrap();

  const [orders, setOrders] = useState<CashierOrderListItem[]>([]);
  const [activeShiftId, setActiveShiftId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("draft");
  const [channelFilter, setChannelFilter] = useState<OrderChannelCode | "">("");
  const [heldFilter, setHeldFilter] = useState<"all" | "held" | "open">("all");
  const [compactMode, setCompactMode] = useState(false);

  const [pageError, setPageError] = useState("");
  const [reason, setReason] = useState("");
  const [managerPin, setManagerPin] = useState("");

  const fetchData = async () => {
    if (!branchId || !activeShiftId) {
      setOrders([]);
      return;
    }
    try {
      const data = await fetchCashierOrders({
        branchId,
        shiftId: activeShiftId,
        status: statusFilter,
        channel: channelFilter,
        query: query.trim(),
        held: heldFilter === "all" ? null : heldFilter === "held",
      });
      setOrders(data);
      setPageError("");
    } catch {
      setPageError("تعذر تحميل الطلبات.");
    }
  };

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void storage.getString(ACTIVE_SHIFT_ID_KEY).then((stored) => {
        if (!mounted) return;
        setActiveShiftId(stored || "");
      });
      return () => {
        mounted = false;
      };
    }, []),
  );

  useEffect(() => {
    if (!loading && branchId && activeShiftId) {
      void fetchData();
    }
  }, [loading, branchId, activeShiftId, statusFilter, channelFilter, heldFilter]);

  const channels = useMemo(() => Object.entries(CHANNEL_LABELS), []);

  const activeFiltersText = useMemo(() => {
    const statusText = STATUS_LABELS[statusFilter] ?? statusFilter;
    const channelText = channelFilter ? CHANNEL_LABELS[channelFilter] : "كل القنوات";
    const heldText = heldFilter === "all" ? "الكل" : heldFilter === "held" ? "معلقة" : "مفتوحة";
    return `الحالة: ${statusText} | نوع التعليق: ${heldText} | القناة: ${channelText}`;
  }, [statusFilter, heldFilter, channelFilter]);

  const resetFilters = () => {
    setStatusFilter("draft");
    setHeldFilter("all");
    setChannelFilter("");
    setQuery("");
  };

  const handleResume = async (order: CashierOrderListItem) => {
    try {
      if (order.is_held) {
        await resumeOrder(order.id);
      }
      navigation.navigate("PosCashierSales", { orderId: order.id });
    } catch {
      setPageError("تعذر استئناف الطلب.");
    }
  };

  const handleHold = async (order: CashierOrderListItem) => {
    try {
      await holdOrder(order.id);
      await fetchData();
    } catch {
      setPageError("تعذر تعليق الطلب.");
    }
  };

  const handleCancel = async (order: CashierOrderListItem) => {
    if (!reason.trim() || !managerPin.trim()) {
      setPageError("يرجى إدخال سبب الإلغاء ورمز المدير.");
      return;
    }
    try {
      await cancelOrder(order.id, { reason: reason.trim(), managerPin: managerPin.trim() });
      await fetchData();
    } catch (error) {
      setPageError(mapCancelErrorMessage(error));
    }
  };

  if (loading) return <Text style={styles.meta}>جار تحميل الطلبات...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>الطلبات المعلقة والجارية</Text>
        <Pressable style={[styles.modeToggle, compactMode && styles.modeToggleActive]} onPress={() => setCompactMode((prev) => !prev)}>
          <Text style={[styles.modeToggleText, compactMode && styles.modeToggleTextActive]}>{compactMode ? "عرض عادي" : "وضع مضغوط"}</Text>
        </Pressable>
      </View>

      {pageError ? <Text style={styles.error}>{pageError}</Text> : null}

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث برقم الطلب أو هاتف العميل"
            placeholderTextColor={THEME.muted}
            style={styles.searchInput}
            onSubmitEditing={fetchData}
          />
          <Pressable style={styles.primaryButton} onPress={fetchData}>
            <Text style={styles.primaryButtonText}>بحث</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setQuery("")}>
            <Text style={styles.secondaryButtonText}>مسح</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filterCard}>
        <View style={styles.filterHeaderRow}>
          <Text style={styles.filterTitle}>الفلاتر</Text>
          <Pressable style={styles.resetFiltersButton} onPress={resetFilters}>
            <Text style={styles.resetFiltersText}>إعادة ضبط</Text>
          </Pressable>
        </View>

        <Text style={styles.filterGroupLabel}>حالة الطلب</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {["draft", "submitted", "paid"].map((status) => (
            <Pressable key={status} style={[styles.chip, statusFilter === status && styles.chipActive]} onPress={() => setStatusFilter(status)}>
              <Text style={[styles.chipText, statusFilter === status && styles.chipTextActive]}>{STATUS_LABELS[status]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.filterGroupLabel}>نوع التعليق</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          <Pressable style={[styles.chip, heldFilter === "open" && styles.chipActive]} onPress={() => setHeldFilter("open")}>
            <Text style={[styles.chipText, heldFilter === "open" && styles.chipTextActive]}>مفتوحة</Text>
          </Pressable>
          <Pressable style={[styles.chip, heldFilter === "held" && styles.chipActive]} onPress={() => setHeldFilter("held")}>
            <Text style={[styles.chipText, heldFilter === "held" && styles.chipTextActive]}>معلقة</Text>
          </Pressable>
          <Pressable style={[styles.chip, heldFilter === "all" && styles.chipActive]} onPress={() => setHeldFilter("all")}>
            <Text style={[styles.chipText, heldFilter === "all" && styles.chipTextActive]}>الكل</Text>
          </Pressable>
        </ScrollView>

        <Text style={styles.filterGroupLabel}>قناة الطلب</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          <Pressable style={[styles.chip, channelFilter === "" && styles.chipActive]} onPress={() => setChannelFilter("")}>
            <Text style={[styles.chipText, channelFilter === "" && styles.chipTextActive]}>كل القنوات</Text>
          </Pressable>
          {channels.map(([code, label]) => (
            <Pressable key={code} style={[styles.chip, channelFilter === code && styles.chipActive]} onPress={() => setChannelFilter(code as OrderChannelCode)}>
              <Text style={[styles.chipText, channelFilter === code && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.resultBar}>
        <Text style={styles.meta}>{activeFiltersText}</Text>
        <Text style={styles.resultCount}>النتائج: {orders.length}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>سبب الإلغاء (للمشرف)</Text>
        <TextInput value={reason} onChangeText={setReason} placeholder="سبب الإلغاء" placeholderTextColor={THEME.muted} style={styles.input} />
        <TextInput value={managerPin} onChangeText={setManagerPin} placeholder="رمز المدير" placeholderTextColor={THEME.muted} secureTextEntry style={styles.input} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {orders.map((order) => {
          const statusLabel = order.is_held ? "معلقة" : STATUS_LABELS[order.status] ?? order.status;
          const palette = getStatusPalette(order.is_held ? "held" : order.status);

          if (compactMode) {
            return (
              <View key={order.id} style={styles.compactCard}>
                <Text style={styles.compactOrderNo}>#{order.order_number ?? "-"}</Text>
                <View style={[styles.statusBadge, { backgroundColor: palette.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: palette.text }]}>{statusLabel}</Text>
                </View>
                <Text style={styles.compactAmount}>{order.grand_total}</Text>
                <Text style={styles.compactChannel}>{CHANNEL_LABELS[order.channel_code]}</Text>
                <View style={styles.compactActions}>
                  <Pressable style={styles.compactPrimaryButton} onPress={() => handleResume(order)}>
                    <Text style={styles.primaryButtonText}>استئناف</Text>
                  </Pressable>
                  <Pressable style={styles.compactSecondaryButton} onPress={() => handleHold(order)}>
                    <Text style={styles.secondaryButtonText}>تعليق</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          return (
            <View key={order.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>طلب #{order.order_number ?? "-"}</Text>
                <View style={[styles.statusBadge, { backgroundColor: palette.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: palette.text }]}>{statusLabel}</Text>
                </View>
                <Text style={styles.cardAmount}>{order.grand_total}</Text>
              </View>

              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMeta}>القناة: {CHANNEL_LABELS[order.channel_code]}</Text>
                <Text style={styles.cardMeta}>العميل: {normalizeCustomerName(order.customer_name)}</Text>
              </View>

              <View style={styles.cardActions}>
                <Pressable style={styles.primaryButton} onPress={() => handleResume(order)}>
                  <Text style={styles.primaryButtonText}>استئناف</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => handleHold(order)}>
                  <Text style={styles.secondaryButtonText}>تعليق</Text>
                </Pressable>
                {user?.is_staff ? (
                  <Pressable style={styles.dangerButton} onPress={() => handleCancel(order)}>
                    <Text style={styles.dangerButtonText}>إلغاء</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "900", textAlign: "right", color: THEME.text },
  modeToggle: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 999,
    backgroundColor: THEME.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modeToggleActive: { borderColor: THEME.primary, backgroundColor: "#E9F2FB" },
  modeToggleText: { color: THEME.muted, fontWeight: "800" },
  modeToggleTextActive: { color: THEME.primary },

  searchCard: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 10,
  },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 10,
    minHeight: 42,
    paddingHorizontal: 12,
    color: THEME.text,
    textAlign: "right",
    backgroundColor: "#FDFEFF",
  },

  filterCard: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  filterHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterTitle: { fontWeight: "900", color: THEME.text, textAlign: "right" },
  filterGroupLabel: { fontWeight: "800", color: THEME.muted, textAlign: "right" },
  resetFiltersButton: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#fff",
  },
  resetFiltersText: {
    color: THEME.muted,
    fontWeight: "800",
  },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },

  chip: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  chipText: { color: THEME.text, fontWeight: "700" },
  chipTextActive: { color: "#fff" },

  resultBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F9FBFD",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  resultCount: { color: THEME.primary, fontWeight: "900" },

  section: { gap: 6 },
  sectionTitle: { fontWeight: "800", textAlign: "right", color: THEME.text },
  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    textAlign: "right",
    color: THEME.text,
    backgroundColor: "#fff",
  },

  list: { gap: 8, paddingBottom: 8 },
  card: {
    backgroundColor: THEME.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontWeight: "900", color: THEME.text, fontSize: 17 },
  cardAmount: { color: THEME.primary, fontWeight: "900", fontSize: 16 },
  cardMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardMeta: { color: THEME.muted, textAlign: "right", fontWeight: "700" },

  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontWeight: "900", fontSize: 12 },

  cardActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  primaryButton: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 84,
  },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 84,
    backgroundColor: "#fff",
  },
  secondaryButtonText: { color: THEME.primary, fontWeight: "800" },
  dangerButton: {
    backgroundColor: THEME.danger,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 74,
  },
  dangerButtonText: { color: "#fff", fontWeight: "800" },

  compactCard: {
    backgroundColor: THEME.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactOrderNo: { color: THEME.text, fontWeight: "900", minWidth: 72 },
  compactAmount: { color: THEME.primary, fontWeight: "900", minWidth: 62 },
  compactChannel: { color: THEME.muted, fontWeight: "700", flex: 1 },
  compactActions: { flexDirection: "row", gap: 6 },
  compactPrimaryButton: {
    backgroundColor: THEME.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
  },
  compactSecondaryButton: {
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    backgroundColor: "#fff",
  },

  meta: { color: THEME.muted, textAlign: "right" },
  error: { color: THEME.danger, fontWeight: "700", textAlign: "right" },
});


