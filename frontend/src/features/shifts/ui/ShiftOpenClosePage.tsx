import { View } from "react-native";
import { CloseShiftSummary } from "./components/CloseShiftSummary";
import { OpenShiftForm } from "./components/OpenShiftForm";
import { SystemPrinciplesCard } from "./components/SystemPrinciplesCard";

export function ShiftOpenClosePage() {
  return (
    <View style={{ gap: 10 }}>
      <SystemPrinciplesCard />
      <OpenShiftForm />
      <CloseShiftSummary />
    </View>
  );
}
