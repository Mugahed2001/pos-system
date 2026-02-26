import { StyleSheet, Text, View } from "react-native";

export function SystemPrinciplesCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>مبادئ أساسية (Offline + ERP)</Text>

      <Text style={styles.bullet}>• ERP هو مصدر الحقيقة (Source of Truth) لبيانات التعريف: الأصناف/المكونات/الوصفات/الأسعار/الضرائب/الفروع/الصلاحيات.</Text>
      <Text style={styles.bullet}>• POS هو مصدر الحقيقة للعمليات اليومية داخل الفرع: الطلبات، المدفوعات، الورديات، الطباعة، حالة المطبخ.</Text>
      <Text style={styles.bullet}>• Offline‑first: كل جهاز/فرع لازم يقدر يبيع ويطبع ويغلق وردية بدون إنترنت، ثم يزامن لاحقًا بدون تكرار أو فقدان بيانات.</Text>
      <Text style={styles.bullet}>• مع مستودع مركزي: الاستهلاك من المكونات غالبًا يُحسب بالوصفة (Recipe/BOM) ثم يرحّل للـ ERP ليخصم مخزون المكونات حسب المبيعات.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ccd6ea",
    backgroundColor: "#f4f7fd",
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
    color: "#203356",
  },
  bullet: {
    textAlign: "right",
    color: "#33496f",
    lineHeight: 20,
  },
});
