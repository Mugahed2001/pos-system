import { StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

export function TaxServicePage() {
  const { loading, error, config } = usePosOpsBootstrap();
  if (loading) return <Text style={styles.meta}>جار تحميل الضرائب...</Text>;
  if (error || !config) return <Text style={styles.error}>{error || "لا توجد بيانات للضرائب."}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>الضرائب والرسوم</Text>
      {config.taxes.map((tax) => (
        <View key={tax.id} style={styles.card}>
          <Text style={styles.name}>{tax.name}</Text>
          {tax.rules.map((r) => <Text key={r.id} style={styles.meta}>{r.code}: {r.rate_percent}% (شامل: {r.is_inclusive ? "نعم" : "لا"})</Text>)}
        </View>
      ))}
      {config.service_charges.map((svc) => (
        <View key={svc.id} style={styles.card}>
          <Text style={styles.name}>{svc.name}</Text>
          <Text style={styles.meta}>{chargeTypeLabel(svc.charge_type)} - {svc.value}</Text>
        </View>
      ))}
    </View>
  );
}

function chargeTypeLabel(type: string) {
  const labels: Record<string, string> = {
    fixed: "مبلغ ثابت",
    percentage: "نسبة مئوية",
  };
  return labels[type] ?? type;
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  title: { fontSize: 28, fontWeight: "900", color: "#1F2937", textAlign: "right" },
  card: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF", gap: 4 },
  name: { fontWeight: "900", textAlign: "right", color: "#1F2937" },
  meta: { color: "#4B5563", textAlign: "right" },
  error: { color: "#DC2626", textAlign: "right", fontWeight: "700" },
});

