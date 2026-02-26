import { apiClient } from "../../../shared/lib/apiClient";
import type { AdminCategory, AdminItem, AdminOrder } from "../model/types";

interface PaginatedPayload<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

interface PosConfigMenuSnapshot {
  branch: string;
  menu_categories: Array<{
    id: string;
    name: string;
  }>;
  menu_items: Array<{
    id: string;
    category: string | null;
    code: string;
    name: string;
    base_price: string;
    is_active: boolean;
  }>;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function asList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (
    payload &&
    typeof payload === "object" &&
    "results" in payload &&
    Array.isArray((payload as PaginatedPayload<T>).results)
  ) {
    return (payload as PaginatedPayload<T>).results;
  }
  return [];
}

async function fetchAllPages<T>(path: string, params: Record<string, string | number | undefined>) {
  const mergedParams = { ...params, page_size: PAGE_SIZE };
  const all: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await apiClient.get<T[] | PaginatedPayload<T>>(path, {
      params: {
        ...mergedParams,
        page,
      },
    });

    const chunk = asList<T>(response.data);
    if (!chunk.length) {
      break;
    }

    all.push(...chunk);
    if (!("next" in (response.data as object)) || !(response.data as PaginatedPayload<T>).next) {
      break;
    }
  }

  return all;
}

async function getPosMenuSnapshot(branchId?: string) {
  const response = await apiClient.get<PosConfigMenuSnapshot>("/v1/pos/config", {
    params: {
      since_version: 0,
      ...(branchId ? { branch_id: branchId } : {}),
    },
  });
  return response.data;
}

function mapPosCategoriesToAdmin(snapshot: PosConfigMenuSnapshot): AdminCategory[] {
  return snapshot.menu_categories.map((category) => ({
    category_id: category.id,
    subsidiary: null,
    name: category.name,
    parent_category: null,
  }));
}

function mapPosItemsToAdmin(snapshot: PosConfigMenuSnapshot): AdminItem[] {
  return snapshot.menu_items.map((item) => ({
    item_id: item.id,
    subsidiary: null,
    category: item.category,
    uom: null,
    item_code: item.code,
    item_name: item.name,
    barcode: null,
    description: item.is_active ? "نشط" : "غير نشط",
    is_taxable: true,
    created_at: null,
    base_price: item.base_price,
    is_active: item.is_active,
  }));
}

function mergeCategories(catalogCategories: AdminCategory[], posCategories: AdminCategory[]) {
  const seen = new Set<string>();
  const merged: AdminCategory[] = [];

  for (const category of [...catalogCategories, ...posCategories]) {
    const key = category.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(category);
  }

  return merged;
}

function mergeItems(catalogItems: AdminItem[], posItems: AdminItem[]) {
  const byKey = new Map<string, AdminItem>();

  for (const item of [...catalogItems, ...posItems]) {
    const codeKey = item.item_code.trim().toLowerCase();
    const nameKey = item.item_name.trim().toLowerCase();
    const key = codeKey || nameKey || item.item_id;
    if (!key) {
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }

    byKey.set(key, {
      ...existing,
      ...item,
      item_id: existing.item_id || item.item_id,
      item_name: existing.item_name || item.item_name,
      item_code: existing.item_code || item.item_code,
      category: existing.category || item.category,
      base_price: existing.base_price || item.base_price,
    });
  }

  return Array.from(byKey.values());
}

function resolveSettledOrEmpty<T>(result: PromiseSettledResult<T>) {
  return result.status === "fulfilled" ? result.value : null;
}

function resolveErrorFromSettled(...results: PromiseSettledResult<unknown>[]) {
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected && rejected.status === "rejected") {
    return rejected.reason;
  }
  return new Error("Failed to load local database data.");
}

export async function listAdminCategories(params?: { subsidiaryId?: string; branchId?: string }) {
  const posSnapshotPromise = params?.branchId
    ? getPosMenuSnapshot(params.branchId)
    : Promise.reject(new Error("Skip POS snapshot: missing branch id."));
  const [catalogResult, posResult] = await Promise.allSettled([
    fetchAllPages<AdminCategory>("/catalog/categories/", {
      subsidiary_id: params?.subsidiaryId,
    }),
    posSnapshotPromise,
  ]);

  const catalogCategories = resolveSettledOrEmpty(catalogResult) ?? [];
  const posSnapshot = resolveSettledOrEmpty(posResult);
  const posCategories = posSnapshot ? mapPosCategoriesToAdmin(posSnapshot) : [];
  const merged = mergeCategories(catalogCategories, posCategories);

  if (merged.length) {
    return merged;
  }

  throw resolveErrorFromSettled(catalogResult, posResult);
}

export async function listAdminItems(params?: { categoryId?: string; subsidiaryId?: string; branchId?: string }) {
  const posSnapshotPromise = params?.branchId
    ? getPosMenuSnapshot(params.branchId)
    : Promise.reject(new Error("Skip POS snapshot: missing branch id."));
  const [catalogResult, posResult] = await Promise.allSettled([
    fetchAllPages<AdminItem>("/catalog/items/", {
      category_id: params?.categoryId,
      subsidiary_id: params?.subsidiaryId,
    }),
    posSnapshotPromise,
  ]);

  const catalogItems = resolveSettledOrEmpty(catalogResult) ?? [];
  const posSnapshot = resolveSettledOrEmpty(posResult);
  const posItems = posSnapshot ? mapPosItemsToAdmin(posSnapshot) : [];

  const filteredPosItems = params?.categoryId
    ? posItems.filter((item) => item.category === params.categoryId)
    : posItems;

  const merged = mergeItems(catalogItems, filteredPosItems);

  if (merged.length) {
    return merged;
  }

  throw resolveErrorFromSettled(catalogResult, posResult);
}

export async function listAdminOrders(params?: { branchId?: string; status?: string }) {
  return fetchAllPages<AdminOrder>("/v1/pos/orders/", {
    branch_id: params?.branchId,
    status: params?.status,
  });
}
