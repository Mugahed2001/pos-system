import { StyleSheet, View } from "react-native";
import { CashForm } from "./components/CashForm";
import { CardForm } from "./components/CardForm";
import { PaymentMethods } from "./components/PaymentMethods";
import { ReceiptPreview } from "./components/ReceiptPreview";

export function PaymentPage() {
  return (
    <View style={styles.container}>
      <PaymentMethods />
      <CashForm />
      <CardForm />
      <ReceiptPreview />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
});
