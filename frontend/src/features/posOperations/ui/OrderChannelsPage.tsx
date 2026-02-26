import { StyleSheet, Text, View } from "react-native";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

export function OrderChannelsPage() {
  const { loading, error, config } = usePosOpsBootstrap();
  if (loading) return <Text style={styles.meta}>جار تحميل القنوات...</Text>;
  if (error || !config) return <Text style={styles.error}>{error || "لا توجد إعدادات."}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>قنوات الطلب</Text>
      {config.channels.map((channel) => {
        const cfg = config.channel_configs.find((c) => c.channel_code === channel.code);
        return (
          <View key={channel.id} style={styles.card}>
            <Text style={styles.name}>{channel.display_name}</Text>
            <Text style={styles.meta}>مفعلة: {cfg?.is_enabled ? "نعم" : "لا"}</Text>
            <Text style={styles.meta}>السماح بطلبات جديدة: {cfg?.allow_new_orders ? "نعم" : "لا"}</Text>
            <Text style={styles.meta}>قائمة الأسعار: {cfg?.price_list_id ?? "-"}</Text>
          </View>
        );
      })}
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

