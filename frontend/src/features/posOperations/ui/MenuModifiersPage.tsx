import { StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

export function MenuModifiersPage() {
  const { loading, error, config } = usePosOpsBootstrap();
  if (loading) return <Text style={styles.meta}>جار تحميل إعدادات المنيو...</Text>;
  if (error || !config) return <Text style={styles.error}>{error || "لا توجد بيانات للمنيو."}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>المنيو والمعدلات والوجبات</Text>
      <Text style={styles.meta}>التصنيفات: {config.menu_categories.length}</Text>
      <Text style={styles.meta}>الأصناف: {config.menu_items.length}</Text>
      <Text style={styles.meta}>مجموعات المعدلات: {config.modifiers.length}</Text>
      {config.modifiers.map((group) => (
        <View key={group.id} style={styles.card}>
          <Text style={styles.name}>{group.name}</Text>
          <Text style={styles.meta}>إجباري: {group.required ? "نعم" : "لا"} | الحد الأدنى {group.min_select} | الحد الأقصى {group.max_select}</Text>
          {group.items.map((item) => <Text key={item.id} style={styles.meta}>{item.name} (+{item.price_delta})</Text>)}
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

