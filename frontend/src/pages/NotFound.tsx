import { StyleSheet, Text, View } from "react-native";

export function NotFoundPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.subtitle}>الصفحة غير موجودة.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dce3ef",
    gap: 8,
  },
  title: {
    fontSize: 46,
    fontWeight: "900",
    color: "#26395f",
  },
  subtitle: {
    color: "#5f6f89",
    fontSize: 16,
  },
});
