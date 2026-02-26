import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BRANCH_ID_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import { BRAND_COLORS } from "../../../shared/theme/brand";
import { Button, Table } from "../../../shared/ui";
import { listAdminOrders } from "../api/adminApi";
import type { AdminOrder } from "../model/types";

const THEME = {
  textMain: BRAND_COLORS.textMain,
  textSub: BRAND_COLORS.textSub,
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  warning: BRAND_COLORS.warning,
  success: BRAND_COLORS.success,
  danger: BRAND_COLORS.danger,
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "تم الإرسال",
  paid: "مدفوع",
  canceled: "ملغي",
  refunded: "مرتجع",
};

function getOrdersErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return "تعذر تحميل الطلبات حاليًا.";
  }

  const status = error.response?.status;
  if (status === 401) {
    return "يجب تسجيل الدخول أولًا لعرض الطلبات.";
  }
  if (status === 403) {
    return "رمز الجهاز غير صالح أو غير مطابق للفرع.";
  }
  return "تعذر تحميل الطلبات من قاعدة البيانات.";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : value;
}

function getStatusLabel(status: string) {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function OrdersManagementPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const branchId = (await storage.getString(BRANCH_ID_KEY)) ?? "";
      const data = await listAdminOrders({ branchId: branchId || undefined });
      setOrders(data);
    } catch (loadError: unknown) {
      setError(getOrdersErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const recentOrders = useMemo(() => orders.slice(0, 50), [orders]);
  const inProgressCount = useMemo(
    () => orders.filter((order) => order.status === "draft" || order.status === "submitted").length,
    [orders],
  );
  const paidCount = useMemo(() => orders.filter((order) => order.status === "paid").length, [orders]);
  const canceledCount = useMemo(
    () => orders.filter((order) => order.status === "canceled" || order.status === "refunded").length,
    [orders],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إدارة الطلبات</Text>
      <Text style={styles.subtitle}>عرض مباشر للطلبات المحفوظة في قاعدة البيانات.</Text>

      <View style={styles.actions}>
        <Button label="تحديث البيانات" onPress={() => void loadOrders()} compact />
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>إجمالي الطلبات</Text>
          <Text style={[styles.metricValue, { color: THEME.primary }]}>{orders.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>تحت التنفيذ</Text>
          <Text style={[styles.metricValue, { color: THEME.warning }]}>{inProgressCount}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>مدفوعة</Text>
          <Text style={[styles.metricValue, { color: THEME.success }]}>{paidCount}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>ملغية/مرتجعة</Text>
          <Text style={[styles.metricValue, { color: THEME.danger }]}>{canceledCount}</Text>
        </View>
      </View>

      {isLoading ? <Text style={styles.meta}>جار تحميل الطلبات...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>آخر الطلبات</Text>
      <Table
        headers={["رقم الطلب", "الحالة", "الإجمالي", "وقت الإنشاء"]}
        rows={recentOrders.map((order) => [
          order.local_id || order.id.slice(0, 8),
          getStatusLabel(order.status),
          formatMoney(order.grand_total),
          formatDate(order.created_at),
        ])}
        emptyLabel="لا توجد طلبات محفوظة حاليًا"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: THEME.textMain,
    textAlign: "right",
  },
  subtitle: {
    color: THEME.textSub,
    textAlign: "right",
    fontSize: 15,
  },
  actions: {
    flexDirection: "row-reverse",
  },
  metrics: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 14,
    minWidth: 150,
    flexGrow: 1,
    gap: 6,
  },
  metricLabel: {
    color: THEME.textSub,
    textAlign: "right",
    fontWeight: "700",
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "900",
    textAlign: "right",
  },
  sectionTitle: {
    color: THEME.textMain,
    textAlign: "right",
    fontWeight: "900",
    fontSize: 18,
  },
  meta: {
    color: THEME.textSub,
    textAlign: "right",
    fontWeight: "700",
  },
  error: {
    color: THEME.danger,
    textAlign: "right",
    fontWeight: "800",
  },
});
