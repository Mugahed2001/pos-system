import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BRAND_COLORS } from "../../../../shared/theme/brand";

import { useAuth } from "../../../auth";
import { fetchShifts } from "../../api/opsApi";
import { usePosOpsBootstrap } from "../../model/usePosOpsBootstrap";
import { createCashMovement, fetchCashMovements } from "../api/cashierApi";
import type { CashMovementDto } from "../model/types";

const THEME = {
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  text: BRAND_COLORS.textMain,
  muted: BRAND_COLORS.textSub,
  danger: BRAND_COLORS.danger,
};

export function CashMovementsPage() {
  const { user } = useAuth();
  const { loading, error, branchId } = usePosOpsBootstrap();

  const [movements, setMovements] = useState<CashMovementDto[]>([]);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<"paid_in" | "paid_out">("paid_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pageError, setPageError] = useState("");

  const isStaff = Boolean(user?.is_staff);

  const loadData = async () => {
    if (!branchId) return;
    try {
      const [shifts, cash] = await Promise.all([fetchShifts(branchId), fetchCashMovements(branchId)]);
      const openShift = shifts.find((s: any) => s.status === "open");
      setShiftId(openShift?.id ?? null);
      setMovements(cash);
    } catch {
      setPageError("تعذر تحميل بيانات الكاش.");
    }
  };

  useEffect(() => {
    if (!loading && branchId) {
      void loadData();
    }
  }, [loading, branchId]);

  const handleSubmit = async () => {
    if (!isStaff) {
      setPageError("لا تملك صلاحية تنفيذ هذه العملية.");
      return;
    }
    if (!shiftId || !amount.trim() || !reason.trim()) {
      setPageError("يرجى إدخال جميع الحقول.");
      return;
    }
    try {
      await createCashMovement({
        shiftId,
        movementType,
        amount,
        reason,
      });
      setAmount("");
      setReason("");
      await loadData();
    } catch {
      setPageError("تعذر تسجيل الحركة النقدية.");
    }
  };

  const movementLabel = useMemo(() => (movementType === "paid_in" ? "إيداع" : "سحب"), [movementType]);

  if (loading) return <Text style={styles.meta}>جار تحميل الحركات النقدية...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>السحوبات والإيداعات النقدية</Text>
      {pageError ? <Text style={styles.error}>{pageError}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>تسجيل حركة جديدة</Text>
        <View style={styles.row}>
          <Pressable style={[styles.chip, movementType === "paid_in" && styles.chipActive]} onPress={() => setMovementType("paid_in")}>
            <Text style={[styles.chipText, movementType === "paid_in" && styles.chipTextActive]}>إيداع</Text>
          </Pressable>
          <Pressable style={[styles.chip, movementType === "paid_out" && styles.chipActive]} onPress={() => setMovementType("paid_out")}>
            <Text style={[styles.chipText, movementType === "paid_out" && styles.chipTextActive]}>سحب</Text>
          </Pressable>
        </View>
        <TextInput value={amount} onChangeText={setAmount} placeholder={`قيمة ${movementLabel}`} keyboardType="numeric" style={styles.input} />
        <TextInput value={reason} onChangeText={setReason} placeholder="سبب الحركة" style={styles.input} />
        <Pressable style={styles.primaryButton} onPress={handleSubmit}>
          <Text style={styles.primaryButtonText}>تسجيل الحركة</Text>
        </Pressable>
        {!shiftId ? <Text style={styles.meta}>لا توجد وردية مفتوحة حاليًا.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>حركات اليوم</Text>
        <ScrollView style={{ maxHeight: 240 }}>
          {movements.map((movement) => (
            <View key={movement.id} style={styles.listItem}>
              <Text style={styles.listItemText}>{movement.movement_type === "paid_in" ? "إيداع" : "سحب"} - {movement.amount}</Text>
              <Text style={styles.listItemMeta}>{movement.reason}</Text>
              <Text style={styles.listItemMeta}>بواسطة {movement.username}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 28, fontWeight: "900", textAlign: "right", color: THEME.text },
  meta: { color: THEME.muted, textAlign: "right" },
  error: { color: THEME.danger, fontWeight: "700", textAlign: "right" },
  card: { backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 12, gap: 8 },
  sectionTitle: { fontWeight: "800", textAlign: "right", color: THEME.text },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, minHeight: 40, paddingHorizontal: 10, textAlign: "right" },
  chip: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { color: THEME.text, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  primaryButton: { backgroundColor: THEME.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  listItem: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 8, marginBottom: 6 },
  listItemText: { fontWeight: "800", textAlign: "right", color: THEME.text },
  listItemMeta: { color: THEME.muted, textAlign: "right" },
});




