import { useNavigation } from "@react-navigation/native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

const sections = [
  ["PosOrderChannels", "قنوات الطلب"],
  ["PosTableService", "خدمة الطاولات"],
  ["PosSalesWorkspace", "شاشة البيع"],
  ["PosMenuModifiers", "المنيو والمعدلات"],
  ["PosTaxService", "الضرائب والرسوم"],
  ["PosPromotions", "الخصومات والعروض"],
  ["PosCustomersLoyalty", "العملاء والولاء"],
  ["PosPaymentsBilling", "الدفع والفوترة"],
  ["PosKitchenKds", "المطبخ وشاشة الطلبات"],
  ["PosShiftCash", "الوردية والكاش"],
  ["PosShiftOpenClose", "فتح وإغلاق الوردية"],
  ["PosRolesPermissions", "الأدوار والصلاحيات"],
  ["PosDriversDelivery", "السائقون والتوصيل"],
  ["PosPickupWindow", "شباك الاستلام"],
  ["PosDailyReports", "التقارير اليومية"],
] as const;

export function PosOperationsPage() {
  const navigation = useNavigation<any>();
  const { loading, error, config, customers, drivers } = usePosOpsBootstrap();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>تشغيل نقاط البيع</Text>
      <Text style={styles.subtitle}>صفحات التشغيل المتصلة ببيانات الفرع الفعلية وواجهات الخدمة.</Text>

      {loading ? <Text style={styles.meta}>جار تحميل ملخص الفرع...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error && config ? (
        <View style={styles.statsCard}>
          <Text style={styles.meta}>الفرع: {config.branch}</Text>
          <Text style={styles.meta}>إصدار الإعدادات: {config.version}</Text>
          <Text style={styles.meta}>الأصناف: {config.menu_items.length}</Text>
          <Text style={styles.meta}>الطاولات: {config.tables.length}</Text>
          <Text style={styles.meta}>العملاء: {customers.length}</Text>
          <Text style={styles.meta}>السائقون: {drivers.length}</Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {sections.map(([route, label]) => (
          <Pressable key={route} onPress={() => navigation.navigate(route)} style={styles.card}>
            <Text style={styles.cardText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 34, fontWeight: "900", textAlign: "right", color: "#1F2937" },
  subtitle: { fontSize: 14, textAlign: "right", color: "#6B7280" },
  statsCard: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF", gap: 4 },
  meta: { color: "#4B5563", textAlign: "right", fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "right", fontWeight: "700" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  card: { minWidth: 220, flexGrow: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF" },
  cardText: { textAlign: "right", fontWeight: "800", color: "#1F2937" },
});

