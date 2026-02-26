import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BRAND_COLORS } from "../../../../shared/theme/brand";

import type { PosAddress, PosCustomer } from "../../../sales/model/posTypes";
import { listCustomerAddresses } from "../../../sales/api/customersApi";
import { usePosOpsBootstrap } from "../../model/usePosOpsBootstrap";
import { attachCustomerToOrder, createCustomer, fetchCashierOrders, searchCustomers } from "../api/cashierApi";
import type { CashierOrderListItem } from "../model/types";

const THEME = {
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  text: BRAND_COLORS.textMain,
  muted: BRAND_COLORS.textSub,
  danger: BRAND_COLORS.danger,
};

export function QuickCustomersPage() {
  const { loading, error, branchId } = usePosOpsBootstrap();

  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [addresses, setAddresses] = useState<PosAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [orderQuery, setOrderQuery] = useState("");
  const [orderResults, setOrderResults] = useState<CashierOrderListItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CashierOrderListItem | null>(null);

  const [pageError, setPageError] = useState("");

  const handleSearch = async () => {
    if (!branchId) return;
    try {
      const data = await searchCustomers(branchId, query.trim());
      setCustomers(data);
    } catch {
      setPageError("تعذر البحث عن العملاء.");
    }
  };

  const handleCreate = async () => {
    if (!branchId || !newName.trim()) {
      setPageError("يرجى إدخال اسم العميل.");
      return;
    }
    try {
      const created = await createCustomer({
        branchId,
        name: newName.trim(),
        phone: newPhone.trim(),
        notes: newNotes.trim(),
      });
      setCustomers((current) => [created, ...current]);
      setSelectedCustomer(created);
      setNewName("");
      setNewPhone("");
      setNewNotes("");
    } catch {
      setPageError("تعذر إنشاء العميل.");
    }
  };

  const handleFetchOrders = async () => {
    if (!branchId) return;
    try {
      const results = await fetchCashierOrders({ branchId, query: orderQuery.trim() });
      setOrderResults(results);
    } catch {
      setPageError("تعذر تحميل الطلبات.");
    }
  };

  const handleAttach = async () => {
    if (!selectedCustomer || !selectedOrder) {
      setPageError("يرجى تحديد العميل والطلب.");
      return;
    }
    try {
      await attachCustomerToOrder(selectedOrder.id, {
        customerId: selectedCustomer.id,
        addressId: selectedAddressId,
      });
      setPageError("");
    } catch {
      setPageError("تعذر ربط العميل بالطلب.");
    }
  };

  useEffect(() => {
    if (!selectedCustomer) {
      setAddresses([]);
      setSelectedAddressId(null);
      return;
    }
    void listCustomerAddresses(selectedCustomer.id).then((data) => {
      setAddresses(data);
      setSelectedAddressId((current) => current ?? data[0]?.id ?? null);
    });
  }, [selectedCustomer]);

  if (loading) return <Text style={styles.meta}>جار تحميل العملاء...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>العملاء السريعون</Text>
      {pageError ? <Text style={styles.error}>{pageError}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>بحث عن عميل</Text>
        <View style={styles.row}>
          <TextInput value={query} onChangeText={setQuery} placeholder="الاسم أو الهاتف" style={styles.input} />
          <Pressable style={styles.primaryButton} onPress={handleSearch}>
            <Text style={styles.primaryButtonText}>بحث</Text>
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 160 }}>
          {customers.map((cust) => (
            <Pressable key={cust.id} style={[styles.listItem, selectedCustomer?.id === cust.id && styles.listItemActive]} onPress={() => setSelectedCustomer(cust)}>
              <Text style={styles.listItemText}>{cust.name}</Text>
              <Text style={styles.listItemMeta}>{cust.phone || "بدون هاتف"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>إنشاء عميل سريع</Text>
        <TextInput value={newName} onChangeText={setNewName} placeholder="اسم العميل" style={styles.input} />
        <TextInput value={newPhone} onChangeText={setNewPhone} placeholder="الهاتف" style={styles.input} />
        <TextInput value={newNotes} onChangeText={setNewNotes} placeholder="ملاحظات" style={styles.input} />
        <Pressable style={styles.primaryButton} onPress={handleCreate}>
          <Text style={styles.primaryButtonText}>إضافة</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ربط العميل بطلب</Text>
        <View style={styles.row}>
          <TextInput value={orderQuery} onChangeText={setOrderQuery} placeholder="رقم الطلب أو الهاتف" style={styles.input} />
          <Pressable style={styles.primaryButton} onPress={handleFetchOrders}>
            <Text style={styles.primaryButtonText}>بحث</Text>
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 140 }}>
          {orderResults.map((order) => (
            <Pressable key={order.id} style={[styles.listItem, selectedOrder?.id === order.id && styles.listItemActive]} onPress={() => setSelectedOrder(order)}>
              <Text style={styles.listItemText}>#{order.order_number ?? "-"}</Text>
              <Text style={styles.listItemMeta}>الإجمالي: {order.grand_total}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {selectedCustomer ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {addresses.map((addr) => (
              <Pressable key={addr.id} style={[styles.chip, selectedAddressId === addr.id && styles.chipActive]} onPress={() => setSelectedAddressId(addr.id)}>
                <Text style={[styles.chipText, selectedAddressId === addr.id && styles.chipTextActive]}>{addr.line1}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Pressable style={styles.primaryButton} onPress={handleAttach}>
          <Text style={styles.primaryButtonText}>ربط العميل</Text>
        </Pressable>
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
  row: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  input: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, minHeight: 40, paddingHorizontal: 10, textAlign: "right", flex: 1 },
  primaryButton: { backgroundColor: THEME.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  listItem: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 8, marginBottom: 6 },
  listItemActive: { borderColor: THEME.primary, backgroundColor: "rgba(37,99,235,0.12)" },
  listItemText: { fontWeight: "800", textAlign: "right", color: THEME.text },
  listItemMeta: { color: THEME.muted, textAlign: "right" },
  chip: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { color: THEME.text, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
});




