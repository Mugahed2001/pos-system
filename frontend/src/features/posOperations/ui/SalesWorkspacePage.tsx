import { StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

export function SalesWorkspacePage() {
  const { loading, error, config } = usePosOpsBootstrap();
  if (loading) return <Text style={styles.meta}>جار تحميل شاشة البيع...</Text>;
  if (error || !config) return <Text style={styles.error}>{error || "لا توجد بيانات للشاشة."}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>شاشة البيع</Text>
      <Text style={styles.meta}>تصنيفات المنيو: {config.menu_categories.length}</Text>
      <Text style={styles.meta}>أصناف المنيو: {config.menu_items.length}</Text>
      <Text style={styles.meta}>القنوات المفعلة: {config.channel_configs.filter((c) => c.is_enabled).length}</Text>
      <View style={styles.card}>
        <Text style={styles.name}>عناصر التشغيل الأساسية</Text>
        <Text style={styles.meta}>- البحث السريع عن الأصناف والاختصارات</Text>
        <Text style={styles.meta}>- تعليق الفاتورة واسترجاعها وتعديل الكميات</Text>
        <Text style={styles.meta}>- مسارات الطباعة حسب إعداد القناة</Text>
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

