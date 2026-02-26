import { StyleSheet, Text, View } from "react-native";

export function PaymentMethods() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>اختيارات طرق الدفع</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: "#d0daee",
    borderRadius: 10,
    padding: 10,
  },
  text: {
    textAlign: "right",
  },
});
