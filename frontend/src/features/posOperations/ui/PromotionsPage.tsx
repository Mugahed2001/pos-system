import { StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

export function PromotionsPage() {
  const { loading, error, config } = usePosOpsBootstrap();
  if (loading) return <Text style={styles.meta}>جار تحميل العروض...</Text>;
  if (error || !config) return <Text style={styles.error}>{error || "لا توجد سياسات خصم."}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>الخصومات والعروض</Text>
      {config.discount_policies.length === 0 ? <Text style={styles.meta}>لا توجد سياسات خصم مفعلة.</Text> : null}
      {config.discount_policies.map((policy) => (
        <View key={policy.id} style={styles.card}>
          <Text style={styles.name}>{policy.name}</Text>
          <Text style={styles.meta}>الحد الأقصى للخصم: {policy.max_discount_percent}%</Text>
          <Text style={styles.meta}>يتطلب موافقة مدير: {policy.requires_manager_override ? "نعم" : "لا"}</Text>
          <Text style={styles.meta}>الحالة: {policy.is_active ? "نشط" : "غير نشط"}</Text>
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

