import { View } from "react-native";
import { SalesReport } from "./components/SalesReport";
import { ZReport } from "./components/ZReport";

export function ReportsPage() {
  return (
    <View style={{ gap: 10 }}>
      <SalesReport />
      <ZReport />
    </View>
  );
}
