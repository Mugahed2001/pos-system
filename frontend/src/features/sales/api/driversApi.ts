import { apiClient } from "../../../shared/lib/apiClient";
import type { PosDriver } from "../model/posTypes";

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  const maybeResults = (payload as { results?: T[] } | undefined)?.results;
  return Array.isArray(maybeResults) ? maybeResults : [];
}

export async function listDrivers(branchId?: string): Promise<PosDriver[]> {
  const response = await apiClient.get("/v1/admin/drivers/", {
    params: branchId ? { branch_id: branchId } : {},
  });
  return unwrapList<PosDriver>(response.data);
}

export async function assignDriverToOrder(input: {
  orderId: string;
  driverId: string;
}): Promise<{ id: string; order_id: string; driver_id: string; status: string }> {
  const response = await apiClient.post("/v1/pos/delivery/assignments", {
    order_id: input.orderId,
    driver_id: input.driverId,
  });
  return response.data;
}
