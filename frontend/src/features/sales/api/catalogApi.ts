import { apiClient } from "../../../shared/lib/apiClient";
import type { CategoryDto, ItemDto } from "../model/posTypes";

function unwrapList<T>(payload: any): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  return (payload?.results ?? []) as T[];
}

export async function listCategories(): Promise<CategoryDto[]> {
  const response = await apiClient.get("/catalog/categories/");
  return unwrapList<CategoryDto>(response.data);
}

export async function listItems(params?: { category_id?: string; subsidiary_id?: string }): Promise<ItemDto[]> {
  const response = await apiClient.get("/catalog/items/", { params: params ?? {} });
  return unwrapList<ItemDto>(response.data);
}

