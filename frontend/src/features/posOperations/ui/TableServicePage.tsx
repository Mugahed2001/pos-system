import { StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

export function TableServicePage() {
  const { loading, error, config } = usePosOpsBootstrap();
  if (loading) return <Text style={styles.meta}>جار تحميل الطاولات...</Text>;
  if (error || !config) return <Text style={styles.error}>{error || "لا توجد بيانات للطاولات."}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>خدمة الطاولات</Text>
      <Text style={styles.meta}>الطوابق: {config.floors.length}</Text>
      <Text style={styles.meta}>الطاولات: {config.tables.length}</Text>
      {config.floors.map((floor) => (
        <View key={floor.id} style={styles.card}>
          <Text style={styles.name}>{floor.name}</Text>
          {config.tables
            .filter((t) => t.floor === floor.id)
            .map((table) => (
              <Text key={table.id} style={styles.meta}>
                {table.code} - المقاعد {table.seats_count} - {tableStatusLabel(table.status)}
              </Text>
            ))}
        </View>
      ))}
    </View>
  );
}

function tableStatusLabel(status: string) {
  const labels: Record<string, string> = {
    available: "متاحة",
    occupied: "مشغولة",
    reserved: "محجوزة",
  };
  return labels[status] ?? status;
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 28, fontWeight: "900", color: "#1F2937", textAlign: "right" },
  card: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF", gap: 4 },
  name: { fontWeight: "900", textAlign: "right", color: "#1F2937" },
  meta: { color: "#4B5563", textAlign: "right" },
  error: { color: "#DC2626", textAlign: "right", fontWeight: "700" },
});

