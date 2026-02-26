import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import axios from "axios";
import { BRAND_COLORS } from "../../../../shared/theme/brand";

import { useNotification } from "../../../../shared/notifications";
import { ACTIVE_SHIFT_ID_KEY } from "../../../../shared/constants/keys";
import { storage } from "../../../../shared/lib/storage";
import { useAuth } from "../../../auth";
import { timedOperation } from "../../../../shared/lib/perfMetrics";
import { usePosOpsBootstrap } from "../../model/usePosOpsBootstrap";
import {
  addPayment,
  fetchCashierOrders,
  fetchOrderDetail,
  listPayments,
  printReceipt,
  refundOrder,
  updateOrderStatus,
} from "../api/cashierApi";
import type { CashierOrderDetail, CashierOrderListItem, CashierPayment } from "../model/types";

const THEME = {
  card: BRAND_COLORS.card,
  cardAlt: "#F8FBFF",
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  text: BRAND_COLORS.textMain,
  muted: BRAND_COLORS.textSub,
  danger: BRAND_COLORS.danger,
  success: BRAND_COLORS.success,
  warning: BRAND_COLORS.warning,
  accent: BRAND_COLORS.accentOrange,
};

type PaymentLine = {
  id: string;
  method: "cash" | "card" | "wallet";
  amount: string;
  referenceNo: string;
};

export function PaymentsPage() {
  const { width } = useWindowDimensions();
  const isCompact = width < 1100;
  const navigation = useNavigation<any>();

  const { user } = useAuth();
  const notify = useNotification();
  const { loading, error, branchId } = usePosOpsBootstrap();

  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<CashierOrderListItem[]>([]);
  const [activeShiftId, setActiveShiftId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<CashierOrderDetail | null>(null);
  const [payments, setPayments] = useState<CashierPayment[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [reason, setReason] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [pageError, setPageError] = useState("");
  const [success, setSuccess] = useState("");
  const [searching, setSearching] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [savingPayment, setSavingPayment] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [restoringToPos, setRestoringToPos] = useState(false);
  const [refundPanelOpen, setRefundPanelOpen] = useState(false);

  const loadOrders = async () => {
    if (!branchId || !activeShiftId) {
      setOrders([]);
      setSelectedOrder(null);
      setPayments([]);
      return;
    }
    try {
      setSearching(true);
      setPageError("");
      const [submittedOrders, draftOrders] = await Promise.all([
        fetchCashierOrders({ branchId, shiftId: activeShiftId, query: query.trim(), status: "submitted", held: false }),
        fetchCashierOrders({ branchId, shiftId: activeShiftId, query: query.trim(), status: "draft", held: false }),
      ]);
      const mergedOrders = [...submittedOrders, ...draftOrders];
      const uniqueById = new Map(mergedOrders.map((order) => [order.id, order]));
      const nextOrders = [...uniqueById.values()].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        if (aTime !== bTime) return bTime - aTime;
        return (b.order_number ?? 0) - (a.order_number ?? 0);
      });
      setOrders(nextOrders);
      if (!nextOrders.length) {
        notify.info("لا توجد طلبات مطابقة.");
      }
    } catch {
      setPageError("تعذر تحميل الطلبات.");
      notify.error("تعذر تحميل الطلبات.");
    } finally {
      setSearching(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void storage.getString(ACTIVE_SHIFT_ID_KEY).then((stored) => {
        if (!mounted) return;
        const nextShift = stored || "";
        setActiveShiftId((current) => (current === nextShift ? current : nextShift));
        setRefreshTick((value) => value + 1);
      });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const loadOrderDetail = async (orderId: string) => {
    try {
      setPageError("");
      const detail = await fetchOrderDetail(orderId);
      const paymentList = await listPayments(orderId);
      setSelectedOrder(detail);
      setPayments(paymentList);
      setReason("");
      setManagerPin("");
      setRefundPanelOpen(false);
      setPaymentLines([{ id: "line-1", method: "cash", amount: "0.00", referenceNo: "" }]);
    } catch {
      setPageError("تعذر تحميل تفاصيل الطلب.");
      notify.error("تعذر تحميل تفاصيل الطلب.");
    }
  };

  const addPaymentLine = () => {
    setPaymentLines((current) => [...current, { id: `line-${Date.now()}`, method: "cash", amount: "0.00", referenceNo: "" }]);
  };

  const removePaymentLine = (id: string) => {
    setPaymentLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current));
  };

  const updatePaymentLine = (id: string, patch: Partial<PaymentLine>) => {
    setPaymentLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const stagedPaid = useMemo(() => paymentLines.reduce((sum, line) => sum + Number(line.amount || 0), 0), [paymentLines]);
  const recordedPaid = useMemo(() => payments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0), [payments]);
  const totalAmount = Number(selectedOrder?.grand_total || 0);
  const remainingBefore = Math.max(0, totalAmount - recordedPaid);
  const remainingAmount = Math.max(0, remainingBefore - stagedPaid);
  const hasPositiveLine = paymentLines.some((line) => Number(line.amount) > 0);

  const handleReturnToPos = useCallback(() => {
    if (!selectedOrder) return;
    const openForEdit = async () => {
      try {
        setRestoringToPos(true);
        setPageError("");
        if (selectedOrder.status !== "draft") {
          await updateOrderStatus(selectedOrder.id, "draft");
        }
        navigation.navigate("PosCashierSales", { orderId: selectedOrder.id });
      } catch (error) {
        const data = axios.isAxiosError(error) ? error.response?.data : undefined;
        const detail =
          (typeof data === "string" ? data : undefined) ||
          (typeof data === "object" && data && "detail" in data ? String((data as { detail?: string }).detail || "") : "");
        setPageError(detail ? `تعذر استرجاع الطلب للتعديل: ${detail}` : "تعذر استرجاع الطلب للتعديل في شاشة البيع.");
      } finally {
        setRestoringToPos(false);
      }
    };
    void openForEdit();
  }, [navigation, selectedOrder]);

  const handleSubmit = async () => {
    if (!selectedOrder) return;
    if (!hasPositiveLine) {
      notify.warning("أدخل مبلغًا صحيحًا للدفع.");
      return;
    }

    try {
      setSavingPayment(true);
      setSuccess("");
      setPageError("");
      await timedOperation("payment_submit_ms", async () => {
        for (const line of paymentLines) {
          if (!line.amount || Number(line.amount) <= 0) continue;
          await addPayment(selectedOrder.id, {
            idempotencyKey: `${selectedOrder.id}-${line.id}`,
            method: line.method,
            amount: line.amount,
            referenceNo: line.referenceNo,
          });
        }
      });
      const refreshed = await fetchOrderDetail(selectedOrder.id);
      const updatedPayments = await listPayments(selectedOrder.id);
      setSelectedOrder(refreshed);
      setPayments(updatedPayments);
      setPaymentLines([{ id: "line-1", method: "cash", amount: "0.00", referenceNo: "" }]);
      setSuccess("تم تسجيل الدفعة بنجاح.");
      notify.success("تم تسجيل الدفعة بنجاح.");
    } catch {
      setPageError("تعذر تسجيل الدفعات.");
      notify.error("تعذر تسجيل الدفعات.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedOrder) return;
    try {
      setPrinting(true);
      await timedOperation("receipt_print_ms", () => printReceipt(selectedOrder.id));
      setSuccess("تم إرسال أمر الطباعة.");
      notify.success("تم إرسال أمر الطباعة.");
    } catch {
      setPageError("تعذر إرسال أمر الطباعة.");
      notify.error("تعذر إرسال أمر الطباعة.");
    } finally {
      setPrinting(false);
    }
  };

  const handleRefund = async () => {
    if (!selectedOrder) return;
    if (!reason.trim() || !managerPin.trim()) {
      setPageError("يرجى إدخال سبب الاسترجاع ورمز المدير.");
      notify.warning("يرجى إدخال سبب الاسترجاع ورمز المدير.");
      return;
    }
    try {
      setRefunding(true);
      await refundOrder(selectedOrder.id, { reason: reason.trim(), managerPin: managerPin.trim() });
      const refreshed = await fetchOrderDetail(selectedOrder.id);
      setSelectedOrder(refreshed);
      setSuccess("تم تنفيذ الاسترجاع.");
      notify.success("تم تنفيذ الاسترجاع.");
    } catch {
      setPageError("تعذر تنفيذ الاسترجاع.");
      notify.error("تعذر تنفيذ الاسترجاع.");
    } finally {
      setRefunding(false);
    }
  };

  useEffect(() => {
    if (!loading && branchId) {
      void loadOrders();
    }
  }, [loading, branchId, activeShiftId, refreshTick]);

  if (loading) return <Text style={styles.meta}>جار تحميل المدفوعات...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>مدفوعات الكاشير</Text>
        <Text style={styles.subtitle}>بحث سريع عن الطلب، تسوية المدفوعات، وطباعة الإيصال من شاشة واحدة.</Text>
      </View>

      {pageError ? <Text style={styles.error}>{pageError}</Text> : null}
      {success ? <Text style={styles.success}>{success}</Text> : null}

      <View style={[styles.layout, isCompact && styles.layoutCompact]}>
        <View style={styles.leftPane}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>بحث عن طلب</Text>
            <View style={styles.searchRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="رقم الطلب أو الهاتف"
                placeholderTextColor={THEME.muted}
                style={styles.input}
                returnKeyType="search"
                onSubmitEditing={() => void loadOrders()}
              />
              <Pressable style={[styles.primaryButton, searching && styles.buttonDisabled]} onPress={() => void loadOrders()} disabled={searching}>
                <Text style={styles.primaryButtonText}>{searching ? "جار البحث..." : "بحث"}</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.card, styles.ordersCard]}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>الطلبات الجاهزة للدفع</Text>
              <Text style={styles.meta}>{orders.length} طلب</Text>
            </View>
            <ScrollView style={styles.ordersList} contentContainerStyle={styles.ordersListContent}>
              {orders.map((order) => {
                const active = selectedOrder?.id === order.id;
                const isRestored = order.status === "draft";
                return (
                  <Pressable key={order.id} style={[styles.orderRow, active && styles.orderRowActive]} onPress={() => void loadOrderDetail(order.id)}>
                    <View style={styles.orderRowTop}>
                      <Text style={styles.orderNumber}>طلب #{order.order_number ?? "-"}</Text>
                      <Text style={styles.orderTotal}>{money(order.grand_total)}</Text>
                    </View>
                    <View style={styles.orderRowBottom}>
                      <Text style={styles.orderMeta}>{channelLabel(order.channel_code)}</Text>
                      <Text style={styles.orderMeta}>{order.customer_phone || "بدون هاتف"}</Text>
                    </View>
                    {isRestored ? (
                      <View style={styles.restoredBadge}>
                        <Text style={styles.restoredBadgeText}>مسترجع للتعديل</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
              {!orders.length ? <Text style={styles.emptyText}>لا توجد طلبات في هذه اللحظة.</Text> : null}
            </ScrollView>
          </View>
        </View>

        <View style={styles.rightPane}>
          {!selectedOrder ? (
            <View style={[styles.card, styles.emptyCard]}>
              <Text style={styles.emptyTitle}>اختر طلبًا لبدء عملية الدفع</Text>
              <Text style={styles.emptyText}>ستظهر هنا تفاصيل الطلب، طرق الدفع، وملخص المبالغ.</Text>
            </View>
          ) : (
            <ScrollView style={styles.rightScroll} contentContainerStyle={styles.rightScrollContent}>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.sectionTitle}>ملخص الدفع</Text>
                  <Text style={styles.meta}>الحالة: {orderStatusLabel(selectedOrder.status)}</Text>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>إجمالي الطلب</Text>
                    <Text style={styles.metricValue}>{money(totalAmount)}</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>مدفوع مسجل</Text>
                    <Text style={[styles.metricValue, { color: THEME.success }]}>{money(recordedPaid)}</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>المتبقي الحالي</Text>
                    <Text style={[styles.metricValue, { color: remainingBefore > 0 ? THEME.warning : THEME.success }]}>
                      {money(remainingBefore)}
                    </Text>
                  </View>
                </View>
                <View style={styles.metaInlineRow}>
                  <Text style={styles.meta}>رقم الطلب: #{selectedOrder.order_number ?? "-"}</Text>
                  <Text style={styles.meta}>عناصر الطلب: {selectedOrder.items.length}</Text>
                </View>
                <Pressable style={[styles.restoreToPosButton, restoringToPos && styles.buttonDisabled]} onPress={handleReturnToPos} disabled={restoringToPos}>
                  <Text style={styles.restoreToPosButtonText}>{restoringToPos ? "جار الاسترجاع..." : "استرجاع الطلب في POS للتعديل"}</Text>
                </Pressable>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>عناصر الطلب</Text>
                <ScrollView style={styles.itemsList} contentContainerStyle={styles.itemsListContent}>
                  {selectedOrder.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.menu_item_name}</Text>
                      <Text style={styles.itemQty}>x{item.quantity}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.sectionTitle}>طرق الدفع</Text>
                  <Pressable style={styles.secondaryButton} onPress={addPaymentLine}>
                    <Text style={styles.secondaryButtonText}>إضافة طريقة دفع</Text>
                  </Pressable>
                </View>

                {paymentLines.map((line, index) => (
                  <View key={line.id} style={styles.paymentLineCard}>
                    <View style={styles.paymentLineHeader}>
                      <Text style={styles.meta}>دفعة {index + 1}</Text>
                      <Pressable
                        style={[styles.removeLineButton, paymentLines.length === 1 && styles.buttonDisabled]}
                        onPress={() => removePaymentLine(line.id)}
                        disabled={paymentLines.length === 1}
                      >
                        <Text style={styles.removeLineText}>حذف</Text>
                      </Pressable>
                    </View>

                    <View style={styles.methodRow}>
                      <MethodChip
                        label="نقدي"
                        active={line.method === "cash"}
                        onPress={() => updatePaymentLine(line.id, { method: "cash" })}
                      />
                      <MethodChip
                        label="بطاقة"
                        active={line.method === "card"}
                        onPress={() => updatePaymentLine(line.id, { method: "card" })}
                      />
                      <MethodChip
                        label="محفظة"
                        active={line.method === "wallet"}
                        onPress={() => updatePaymentLine(line.id, { method: "wallet" })}
                      />
                    </View>

                    <View style={styles.paymentInputsRow}>
                      <TextInput
                        value={line.amount}
                        onChangeText={(value) => updatePaymentLine(line.id, { amount: value })}
                        placeholder="قيمة الدفع"
                        placeholderTextColor={THEME.muted}
                        keyboardType="numeric"
                        style={[styles.input, styles.amountInput]}
                      />
                      <TextInput
                        value={line.referenceNo}
                        onChangeText={(value) => updatePaymentLine(line.id, { referenceNo: value })}
                        placeholder="مرجع العملية (اختياري)"
                        placeholderTextColor={THEME.muted}
                        style={[styles.input, styles.referenceInput]}
                      />
                    </View>
                  </View>
                ))}

                <View style={styles.totalInlineRow}>
                  <Text style={styles.meta}>إجمالي الدفعات المدخلة الآن</Text>
                  <Text style={styles.stagedPaidValue}>{money(stagedPaid)}</Text>
                </View>
              </View>

              <View style={styles.actionsCard}>
                <View style={styles.totalBar}>
                  <Text style={styles.totalBarLabel}>المتبقي بعد الدفعات المدخلة</Text>
                  <Text style={styles.totalBarValue}>{money(remainingAmount)}</Text>
                </View>
                <View style={styles.actionButtonsRow}>
                  <Pressable
                    style={[styles.payButton, (!hasPositiveLine || savingPayment) && styles.buttonDisabled]}
                    onPress={() => void handleSubmit()}
                    disabled={!hasPositiveLine || savingPayment}
                  >
                    <Text style={styles.payButtonText}>{savingPayment ? "جار التأكيد..." : "تأكيد الدفع"}</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButton, printing && styles.buttonDisabled]} onPress={() => void handlePrint()} disabled={printing}>
                    <Text style={styles.secondaryButtonText}>{printing ? "جار الطباعة..." : "طباعة الإيصال"}</Text>
                  </Pressable>
                  {selectedOrder && user?.is_staff ? (
                    <Pressable style={[styles.refundQuickButton, refunding && styles.buttonDisabled]} onPress={() => setRefundPanelOpen((prev) => !prev)}>
                      <Text style={styles.refundQuickButtonText}>{refundPanelOpen ? "إغلاق الاسترجاع" : "الاسترجاع"}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {selectedOrder && user?.is_staff && refundPanelOpen ? (
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.sectionTitle}>استرجاع الطلب</Text>
                    <Pressable style={styles.refundPanelHideButton} onPress={() => setRefundPanelOpen(false)}>
                      <Text style={styles.refundPanelHideText}>إخفاء</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="سبب الاسترجاع"
                    placeholderTextColor={THEME.muted}
                    style={styles.input}
                  />
                  <TextInput
                    value={managerPin}
                    onChangeText={setManagerPin}
                    placeholder="رمز المدير"
                    placeholderTextColor={THEME.muted}
                    secureTextEntry
                    style={styles.input}
                  />
                  <Pressable style={[styles.dangerButton, refunding && styles.buttonDisabled]} onPress={() => void handleRefund()} disabled={refunding}>
                    <Text style={styles.dangerButtonText}>{refunding ? "جار التنفيذ..." : "تنفيذ الاسترجاع"}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>الدفعات المسجلة</Text>
                <ScrollView style={styles.paymentsList} contentContainerStyle={styles.paymentsListContent}>
                  {payments.map((pay) => (
                    <View key={pay.id} style={styles.recordedPaymentRow}>
                      <View>
                        <Text style={styles.listItemText}>{paymentMethodLabel(pay.method)}</Text>
                        <Text style={styles.listItemMeta}>{pay.reference_no || "بدون مرجع"}</Text>
                      </View>
                      <Text style={styles.recordedAmount}>{money(pay.amount)}</Text>
                    </View>
                  ))}
                  {!payments.length ? <Text style={styles.emptyText}>لا توجد دفعات مسجلة بعد.</Text> : null}
                </ScrollView>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

function MethodChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.methodChip, active && styles.methodChipActive]} onPress={onPress}>
      <Text style={[styles.methodChipText, active && styles.methodChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 10 },
  header: { gap: 2 },
  title: { fontSize: 28, fontWeight: "900", textAlign: "right", color: THEME.text },
  subtitle: { color: THEME.muted, textAlign: "right", fontWeight: "700" },
  meta: { color: THEME.muted, textAlign: "right", fontWeight: "700" },
  error: { color: THEME.danger, fontWeight: "700", textAlign: "right" },
  success: { color: THEME.success, fontWeight: "700", textAlign: "right" },

  layout: { flex: 1, flexDirection: "row", gap: 10, minHeight: 0 },
  layoutCompact: { flexDirection: "column" },
  leftPane: { width: 390, maxWidth: "40%", minWidth: 320, gap: 10 },
  rightPane: { flex: 1, minWidth: 0 },
  rightScroll: { flex: 1 },
  rightScrollContent: { paddingBottom: 10, gap: 10 },

  card: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  emptyCard: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: THEME.cardAlt },
  emptyTitle: { color: THEME.text, fontWeight: "900", fontSize: 16, textAlign: "center" },
  emptyText: { color: THEME.muted, fontWeight: "700", textAlign: "center" },

  sectionTitle: { fontWeight: "900", textAlign: "right", color: THEME.text, fontSize: 16 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },

  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    textAlign: "right",
    color: THEME.text,
    backgroundColor: "#fff",
    flex: 1,
  },
  amountInput: { flex: 0.5, minWidth: 140 },
  referenceInput: { flex: 1, minWidth: 180 },

  ordersCard: { flex: 1, minHeight: 0 },
  ordersList: { flex: 1, minHeight: 0 },
  ordersListContent: { gap: 6, paddingBottom: 6 },
  orderRow: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 10,
    gap: 5,
    backgroundColor: "#fff",
  },
  orderRowActive: { borderColor: THEME.primary, backgroundColor: "#EFF6FF" },
  orderRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderRowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { color: THEME.text, fontWeight: "900", textAlign: "right" },
  orderTotal: { color: THEME.accent, fontWeight: "900", textAlign: "left" },
  orderMeta: { color: THEME.muted, fontWeight: "700", fontSize: 13 },
  restoredBadge: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#D97706",
    backgroundColor: "#FFFBEB",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  restoredBadgeText: { color: "#B45309", fontWeight: "900", fontSize: 12 },

  metricsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metricCard: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#fff",
    gap: 2,
  },
  metricLabel: { color: THEME.muted, fontWeight: "700", textAlign: "right", fontSize: 13 },
  metricValue: { color: THEME.text, fontWeight: "900", textAlign: "right", fontSize: 22 },
  metaInlineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  restoreToPosButton: {
    marginTop: 2,
    alignSelf: "flex-end",
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#EEF6FF",
  },
  restoreToPosButtonText: { color: THEME.primary, fontWeight: "900" },

  itemsList: { maxHeight: 170 },
  itemsListContent: { gap: 6, paddingBottom: 4 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemName: { color: THEME.text, fontWeight: "800", textAlign: "right", flex: 1 },
  itemQty: { color: THEME.muted, fontWeight: "900", minWidth: 44, textAlign: "left" },

  paymentLineCard: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 8,
    gap: 8,
    backgroundColor: "#fff",
  },
  paymentLineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  methodRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  methodChip: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 34,
    justifyContent: "center",
  },
  methodChipActive: { borderColor: THEME.primary, backgroundColor: THEME.primary },
  methodChipText: { color: THEME.text, fontWeight: "800" },
  methodChipTextActive: { color: "#fff" },
  paymentInputsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  totalInlineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stagedPaidValue: { color: THEME.primary, fontWeight: "900", fontSize: 18 },

  actionsCard: {
    backgroundColor: "#F9FBFF",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  totalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#EFF6FF",
  },
  totalBarLabel: { color: THEME.text, fontWeight: "900", fontSize: 15 },
  totalBarValue: { color: THEME.primary, fontWeight: "900", fontSize: 24 },
  actionButtonsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },

  primaryButton: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  primaryButtonText: { color: "#fff", fontWeight: "900" },
  payButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: THEME.success,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  payButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  secondaryButtonText: { color: THEME.primary, fontWeight: "900" },
  refundQuickButton: {
    borderWidth: 1,
    borderColor: THEME.danger,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    backgroundColor: "#FFF1F1",
  },
  refundQuickButtonText: { color: THEME.danger, fontWeight: "900" },
  refundPanelHideButton: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#fff",
  },
  refundPanelHideText: { color: THEME.muted, fontWeight: "800" },
  dangerButton: {
    backgroundColor: THEME.danger,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    minHeight: 42,
    justifyContent: "center",
  },
  dangerButtonText: { color: "#fff", fontWeight: "900" },
  buttonDisabled: { opacity: 0.6 },
  removeLineButton: {
    borderWidth: 1,
    borderColor: THEME.danger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeLineText: { color: THEME.danger, fontWeight: "800" },

  paymentsList: { maxHeight: 180 },
  paymentsListContent: { gap: 6, paddingBottom: 4 },
  recordedPaymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  recordedAmount: { color: THEME.success, fontWeight: "900", fontSize: 16 },
  listItemText: { fontWeight: "900", textAlign: "right", color: THEME.text },
  listItemMeta: { color: THEME.muted, textAlign: "right", fontWeight: "700", fontSize: 12 },
});

function money(value: string | number) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "نقدي",
    card: "بطاقة",
    wallet: "محفظة",
  };
  return labels[method] ?? method;
}

function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "مسودة",
    submitted: "مرسلة",
    paid: "مدفوعة",
    canceled: "ملغاة",
    refunded: "مسترجعة",
    completed: "مكتملة",
  };
  return labels[status] ?? status;
}

function channelLabel(channel: string) {
  const labels: Record<string, string> = {
    dine_in: "داخل المطعم",
    takeaway: "سفري",
    delivery: "توصيل",
    pickup: "استلام",
    preorder: "طلب مسبق",
  };
  return labels[channel] ?? channel;
}
