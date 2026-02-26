import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BRANCH_ID_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import { BRAND_COLORS } from "../../../shared/theme/brand";
import { Button, Input, Modal, Table } from "../../../shared/ui";
import { listAdminCategories, listAdminItems } from "../api/adminApi";
import type { AdminCategory, AdminItem } from "../model/types";

const TEMP_CATEGORIES_STORAGE_KEY = "pos_admin_temp_categories";

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

interface TempCategory {
  id: string;
  name: string;
  parentName: string;
  createdAt: string;
}

function createTempId() {
  return `tmp-cat-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

function parseTempCategories(raw: string | null): TempCategory[] {
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
        const item = entry as Partial<TempCategory>;
        return {
          id: typeof item.id === "string" ? item.id : createTempId(),
          name: typeof item.name === "string" ? item.name : "",
          parentName: typeof item.parentName === "string" ? item.parentName : "",
          createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        };
      })
      .filter((item) => item.name.trim());
  } catch {
    return [];
  }
}

function getCategoriesErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return "تعذر تحميل الفئات حاليًا.";
  }

  const status = error.response?.status;
  if (status === 401) {
    return "يجب تسجيل الدخول أولًا لعرض الفئات.";
  }
  if (status === 403) {
    return "رمز الجهاز غير صالح أو غير مطابق للفرع.";
  }
  return "تعذر تحميل الفئات من قاعدة البيانات.";
}

export function CategoriesViewPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [items, setItems] = useState<AdminItem[]>([]);
  const [tempCategories, setTempCategories] = useState<TempCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newParentName, setNewParentName] = useState("");
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const branchId = (await storage.getString(BRANCH_ID_KEY)) ?? "";
      const [categoriesData, itemsData] = await Promise.all([
        listAdminCategories({ branchId: branchId || undefined }),
        listAdminItems({ branchId: branchId || undefined }),
      ]);
      setCategories(categoriesData);
      setItems(itemsData);
    } catch (loadError: unknown) {
      setError(getCategoriesErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTempCategories = useCallback(async () => {
    const raw = await storage.getString(TEMP_CATEGORIES_STORAGE_KEY);
    setTempCategories(parseTempCategories(raw));
  }, []);

  const persistTempCategories = useCallback(async (next: TempCategory[]) => {
    setTempCategories(next);
    await storage.setString(TEMP_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadTempCategories();
  }, [loadCategories, loadTempCategories]);

  const categoryById = useMemo(
    () =>
      categories.reduce<Record<string, string>>((acc, category) => {
        acc[category.category_id] = category.name;
        return acc;
      }, {}),
    [categories],
  );

  const itemsCountByCategory = useMemo(
    () =>
      items.reduce<Record<string, number>>((acc, item) => {
        if (!item.category) {
          return acc;
        }
        acc[item.category] = (acc[item.category] ?? 0) + 1;
        return acc;
      }, {}),
    [items],
  );

  const tableRows = useMemo(() => {
    const tempRows = tempCategories.map((category) => [category.name, category.parentName || "-", "0", "مؤقت"]);

    const dbRows = categories.map((category) => [
      category.name,
      category.parent_category ? categoryById[category.parent_category] ?? "غير معروفة" : "-",
      String(itemsCountByCategory[category.category_id] ?? 0),
      "قاعدة البيانات",
    ]);

    return [...tempRows, ...dbRows].slice(0, 150);
  }, [categories, categoryById, itemsCountByCategory, tempCategories]);

  const addTempCategory = useCallback(async () => {
    const name = newCategoryName.trim();
    const parentName = newParentName.trim();

    if (!name) {
      setError("يرجى إدخال اسم الفئة قبل الإضافة.");
      return;
    }

    const nextCategory: TempCategory = {
      id: createTempId(),
      name,
      parentName,
      createdAt: new Date().toISOString(),
    };

    const nextCategories = [nextCategory, ...tempCategories];
    await persistTempCategories(nextCategories);
    setNewCategoryName("");
    setNewParentName("");
    setError("");
    setIsCategoryDialogOpen(false);
  }, [newCategoryName, newParentName, persistTempCategories, tempCategories]);

  const clearTempCategories = useCallback(async () => {
    await persistTempCategories([]);
  }, [persistTempCategories]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>عرض الفئات</Text>
      <Text style={styles.subtitle}>الفئات المسجلة في قاعدة البيانات مع عدد الأصناف.</Text>

      <View style={styles.actions}>
        <Button label="تحديث البيانات" onPress={() => void loadCategories()} compact />
        <Button label="المزامنة (قريبًا)" onPress={() => {}} variant="secondary" compact disabled />
        <Button label="إضافة فئة مؤقتة" onPress={() => setIsCategoryDialogOpen(true)} compact />
        <Button
          label="مسح المؤقت"
          onPress={() => void clearTempCategories()}
          variant="danger"
          compact
          disabled={!tempCategories.length}
        />
      </View>

      <View style={styles.syncBox}>
        <Text style={styles.syncTitle}>مزامنة الفئات</Text>
        <Text style={styles.syncBadge}>قريبًا</Text>
        <Text style={styles.syncText}>سيتم إضافة مزامنة الفئات يدويًا مع مركز البيانات في إصدار لاحق.</Text>
      </View>

      <View style={styles.statsBox}>
        <Text style={styles.statsText}>فئات قاعدة البيانات: {categories.length}</Text>
        <Text style={styles.statsText}>فئات مؤقتة: {tempCategories.length}</Text>
        <Text style={styles.statsText}>عدد الأصناف المرتبطة: {items.length}</Text>
      </View>

      {isLoading ? <Text style={styles.meta}>جار تحميل الفئات...</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Table
        headers={["الفئة", "الفئة الأب", "عدد الأصناف", "المصدر"]}
        rows={tableRows}
        emptyLabel="لا توجد فئات محفوظة حاليًا"
      />

      <Modal open={isCategoryDialogOpen} title="إضافة فئة مؤقتة" onClose={() => setIsCategoryDialogOpen(false)}>
        <View style={styles.dialogBody}>
          <Input value={newCategoryName} onChangeText={setNewCategoryName} placeholder="اسم الفئة" />
          <Input value={newParentName} onChangeText={setNewParentName} placeholder="الفئة الأب (اختياري)" />
          <Text style={styles.dialogHint}>سيتم حفظ الفئة مؤقتًا في هذا الجهاز فقط.</Text>
          <View style={styles.dialogActions}>
            <Button label="حفظ الفئة المؤقتة" onPress={() => void addTempCategory()} compact />
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
