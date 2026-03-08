import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../../../../shared/theme";

type OrderSummaryProps = {
  subtotal: number;
  tax: number;
  excise?: number;
  service: number;
  deliveryFee?: number;
  discount: number;
  discountLabel?: string;
  total: number;
  showService?: boolean;
  showDeliveryFee?: boolean;
};

export const OrderSummary = memo(function OrderSummary(props: OrderSummaryProps) {
  const { theme } = useAppTheme();
  const labelColor = theme.mode === "dark" ? "#C3D3E2" : theme.textSub;
  const valueColor = theme.mode === "dark" ? "#F4F8FC" : theme.textMain;

  return (
    <View style={styles.summary}>
      <View style={styles.line}>
        <Text style={[styles.label, { color: labelColor }]}>المجموع قبل الضريبة</Text>
        <Text style={[styles.value, { color: valueColor }]}>{props.subtotal.toFixed(2)}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.label, { color: labelColor }]}>الضريبة الانتقائية</Text>
        <Text style={[styles.value, { color: valueColor }]}>{(props.excise ?? 0).toFixed(2)}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.label, { color: labelColor }]}>الضريبة</Text>
        <Text style={[styles.value, { color: valueColor }]}>{props.tax.toFixed(2)}</Text>
      </View>
      {props.showService !== false ? (
        <View style={styles.line}>
          <Text style={[styles.label, { color: labelColor }]}>رسوم الخدمة</Text>
          <Text style={[styles.value, { color: valueColor }]}>{props.service.toFixed(2)}</Text>
        </View>
      ) : null}
      {props.showDeliveryFee ? (
        <View style={styles.line}>
          <Text style={[styles.label, { color: labelColor }]}>رسوم التوصيل</Text>
          <Text style={[styles.value, { color: valueColor }]}>{(props.deliveryFee ?? 0).toFixed(2)}</Text>
        </View>
      ) : null}
      <View style={styles.line}>
        <Text style={[styles.label, { color: labelColor }]}>{props.discountLabel || "الخصم"}</Text>
        <Text style={[styles.value, { color: valueColor }]}>{props.discount.toFixed(2)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  summary: {
    gap: 4,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontWeight: "700",
    textAlign: "right",
    fontSize: 13,
  },
  value: {
    fontWeight: "800",
    fontSize: 13,
  },
});
