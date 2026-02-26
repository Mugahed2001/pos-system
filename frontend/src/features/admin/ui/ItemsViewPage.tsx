import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BRANCH_ID_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import { BRAND_COLORS } from "../../../shared/theme/brand";
import { Button, Input, Modal, Table } from "../../../shared/ui";
import { listAdminCategories, listAdminItems } from "../api/adminApi";
import type { AdminCategory, AdminItem } from "../model/types";

const TEMP_ITEMS_STORAGE_KEY = "pos_admin_temp_items";

const THEME = {
  textMain: BRAND_COLORS.textMain,
  textSub: BRAND_COLORS.textSub,
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  warning: BRAND_COLORS.warning,
  danger: BRAND_COLORS.danger,
  soft: BRAND_COLORS.bg,
};

interface TempProduct {
  id: string;
  name: string;
  code: string;
  price: string;
  categoryName: string;
  createdAt: string;
}

function createTempId() {
  return `tmp-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function parseTempProducts(raw: string | null): TempProduct[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const item = entry as Partial<TempProduct>;
        return {
          id: typeof item.id === "string" ? item.id : createTempId(),
          name: typeof item.name === "string" ? item.name : "",
          code: typeof item.code === "string" ? item.code : "",
          price: typeof item.price === "string" ? item.price : "0.00",
          categoryName: typeof item.categoryName === "string" ? item.categoryName : "",
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        };
      })
      .filter((item) => item.name.trim() && item.code.trim());
  } catch {
    return [];
  }
}

function getItemsErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return "تعذر تحميل الأصناف حاليًا.";
  }

  const status = error.response?.status;
  if (status === 401) {
    return "يجب تسجيل الدخول أولًا لعرض الأصناف.";
  }
  if (status === 403) {
    return "رمز الجهاز غير صالح أو غير مطابق للفرع.";
  }
  return "تعذر تحميل الأصناف من قاعدة البيانات.";
}

function formatPrice(item: AdminItem) {
  const rawValue = item.base_price ?? "";
  const value = Number(rawValue);
  if (Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return "-";
}

function getStatusLabel(item: AdminItem) {
  if (typeof item.is_active === "boolean") {
    return item.is_active ? "نشط" : "غير نشط";
  }
  return "-";
}

export function ItemsViewPage() {
  const [items, setItems] = useState<AdminItem[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [tempProducts, setTempProducts] = useState<TempProduct[]>([]);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const branchId = (await storage.getString(BRANCH_ID_KEY)) ?? "";
      const [itemsData, categoriesData] = await Promise.all([
        listAdminItems({ branchId: branchId || undefined }),
        listAdminCategories({ branchId: branchId || undefined }),
      ]);
      setItems(itemsData);
      setCategories(categoriesData);
    } catch (loadError: unknown) {
      setError(getItemsErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTempProducts = useCallback(async () => {
    const raw = await storage.getString(TEMP_ITEMS_STORAGE_KEY);
    setTempProducts(parseTempProducts(raw));
  }, []);

  const persistTempProducts = useCallback(async (next: TempProduct[]) => {
    setTempProducts(next);
    await storage.setString(TEMP_ITEMS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    void loadItems();
    void loadTempProducts();
  }, [loadItems, loadTempProducts]);

  const categoryById = useMemo(
    () =>
      categories.reduce<Record<string, string>>((acc, category) => {
        acc[category.category_id] = category.name;
        return acc;
      }, {}),
    [categories],
  );

  const tableRows = useMemo(() => {
    const tempRows = tempProducts.map((item) => [
      item.name,
      item.code,
      item.categoryName || "بدون فئة",
      item.price,
      "مؤقت",
      "قابل للتعديل",
    ]);

    const dbRows = items.map((item) => [
      item.item_name,
      item.item_code,
      item.category ? categoryById[item.category] ?? "غير معروفة" : "بدون فئة",
      formatPrice(item),
      "قاعدة البيانات",
      getStatusLabel(item),
    ]);

    return [...tempRows, ...dbRows].slice(0, 150);
  }, [categoryById, items, tempProducts]);

  const addTempProduct = useCallback(async () => {
    const name = newName.trim();
    const code = newCode.trim();
    const categoryName = newCategory.trim();
    const priceNumber = Number(newPrice);

    if (!name || !code) {
      setError("يرجى إدخال اسم الصنف والكود قبل الإضافة.");
      return;
    }
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      setError("يرجى إدخال سعر صحيح للصنف المؤقت.");
      return;
    }

    const nextItem: TempProduct = {
      id: createTempId(),
      name,
      code,
      price: priceNumber.toFixed(2),
      categoryName,
      createdAt: new Date().toISOString(),
    };

    const nextProducts = [nextItem, ...tempProducts];
    await persistTempProducts(nextProducts);
    setNewName("");
    setNewCode("");
    setNewPrice("");
    setNewCategory("");
    setError("");
    setIsProductDialogOpen(false);
  }, [newCategory, newCode, newName, newPrice, persistTempProducts, tempProducts]);

  const clearTempProducts = useCallback(async () => {
    await persistTempProducts([]);
  }, [persistTempProducts]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>عرض الأصناف</Text>
      <Text style={styles.subtitle}>قائمة الأصناف المحفوظة في قاعدة البيانات.</Text>

      <View style={styles.actions}>
        <Button label="تحديث البيانات" onPress={() => void loadItems()} compact />
        <Button label="المزامنة (قريبًا)" onPress={() => {}} variant="secondary" compact disabled />
        <Button label="إضافة صنف مؤقت" onPress={() => setIsProductDialogOpen(true)} compact />
        <Button
          label="مسح المؤقت"
          onPress={() => void clearTempProducts()}
          variant="danger"
          compact
          disabled={!tempProducts.length}
        />
      </View>

      <View style={styles.syncBox}>
        <Text style={styles.syncTitle}>مزامنة الأصناف</Text>
        <Text style={styles.syncBadge}>قريبًا</Text>
        <Text style={styles.syncText}>سيتم دعم مزامنة يدوية مباشرة بين الفرع والخادم في إصدار لاحق.</Text>
      </View>

      <View style={styles.statsBox}>
        <Text style={styles.statsText}>أصناف قاعدة البيانات: {items.length}</Text>
        <Text style={styles.statsText}>أصناف مؤقتة: {tempProducts.length}</Text>
        <Text style={styles.statsText}>عدد الفئات: {categories.length}</Text>
      </View>

      {isLoading ? <Text style={styles.meta}>جار تحميل الأصناف...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Table
        headers={["الصنف", "الكود", "الفئة", "السعر", "المصدر", "الحالة"]}
        rows={tableRows}
        emptyLabel="لا توجد أصناف محفوظة حاليًا"
      />

      <Modal open={isProductDialogOpen} title="إضافة صنف مؤقت" onClose={() => setIsProductDialogOpen(false)}>
        <View style={styles.dialogBody}>
          <Input value={newName} onChangeText={setNewName} placeholder="اسم الصنف" />
          <Input value={newCode} onChangeText={setNewCode} placeholder="كود الصنف" />
          <Input value={newPrice} onChangeText={setNewPrice} placeholder="السعر" keyboardType="decimal-pad" />
          <Input value={newCategory} onChangeText={setNewCategory} placeholder="اسم الفئة (اختياري)" />
          <Text style={styles.dialogHint}>سيتم حفظ الصنف مؤقتًا في هذا الجهاز فقط.</Text>
          <View style={styles.dialogActions}>
            <Button label="حفظ الصنف المؤقت" onPress={() => void addTempProduct()} compact />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: THEME.textMain,
    textAlign: "right",
  },
  subtitle: {
    color: THEME.textSub,
    textAlign: "right",
    fontSize: 15,
  },
  actions: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  syncBox: {
    backgroundColor: THEME.soft,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  syncTitle: {
    color: THEME.textMain,
    textAlign: "right",
    fontWeight: "900",
  },
  syncBadge: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(245,158,11,0.15)",
    color: THEME.warning,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: "900",
  },
  syncText: {
    color: THEME.textSub,
    textAlign: "right",
  },
  statsBox: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  statsText: {
    color: THEME.primary,
    textAlign: "right",
    fontWeight: "900",
  },
  meta: {
    color: THEME.textSub,
    textAlign: "right",
    fontWeight: "700",
  },
  error: {
    color: THEME.danger,
    textAlign: "right",
    fontWeight: "800",
  },
  dialogBody: {
    gap: 10,
  },
  dialogHint: {
    color: THEME.textSub,
    textAlign: "right",
    fontWeight: "700",
  },
  dialogActions: {
    flexDirection: "row-reverse",
  },
});
