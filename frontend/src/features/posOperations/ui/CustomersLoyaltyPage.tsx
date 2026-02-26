import { StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

export function CustomersLoyaltyPage() {
  const { loading, error, customers } = usePosOpsBootstrap();

  if (loading) return <Text style={styles.meta}>جار تحميل العملاء...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>العملاء والولاء</Text>
      <Text style={styles.meta}>سجلات العملاء: {customers.length}</Text>
      {customers.length === 0 ? <Text style={styles.meta}>لا يوجد عملاء لهذا الفرع.</Text> : null}
      {customers.map((customer) => (
        <View key={customer.id} style={styles.card}>
          <Text style={styles.name}>{customer.name}</Text>
          <Text style={styles.meta}>الهاتف: {customer.phone || "-"}</Text>
          <Text style={styles.meta}>ملاحظات: {customer.notes || "-"}</Text>
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

