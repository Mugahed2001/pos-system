import { StyleSheet, Text, View } from "react-native";
import { BRAND_COLORS } from "../../../shared/theme/brand";

const THEME = {
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  textMain: BRAND_COLORS.textMain,
  textSub: BRAND_COLORS.textSub,
  accent: BRAND_COLORS.accentOrange,
};

export function DashboardPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>لوحة التحكم</Text>
      <Text style={styles.subtitle}>نظرة عامة سريعة على حالة النظام اليوم.</Text>

      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>مبيعات اليوم</Text>
          <Text style={styles.cardValue}>0.00</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>عدد الفواتير</Text>
          <Text style={styles.cardValue}>0</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>الأصناف النشطة</Text>
          <Text style={[styles.cardValue, { color: THEME.accent }]}>0</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: THEME.textMain,
    textAlign: "right",
  },
  subtitle: {
    fontSize: 15,
    color: THEME.textSub,
    textAlign: "right",
  },
  grid: {
    gap: 10,
  },
  card: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  cardLabel: {
    color: THEME.textSub,
    textAlign: "right",
    fontWeight: "800",
  },
  cardValue: {
    color: THEME.textMain,
    textAlign: "right",
    fontWeight: "900",
    fontSize: 24,
  },
});
