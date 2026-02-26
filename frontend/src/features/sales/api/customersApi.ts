import { apiClient } from "../../../shared/lib/apiClient";
import type { PosAddress, PosCustomer } from "../model/posTypes";

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  const maybeResults = (payload as { results?: T[] } | undefined)?.results;
  return Array.isArray(maybeResults) ? maybeResults : [];
}

export async function listPosCustomers(branchId?: string): Promise<PosCustomer[]> {
  const response = await apiClient.get("/v1/pos/customers/", {
    params: branchId ? { branch_id: branchId } : {},
  });
  return unwrapList<PosCustomer>(response.data);
}

export async function createPosCustomer(input: {
  branchId: string;
  name: string;
  phone?: string;
  notes?: string;
}): Promise<PosCustomer> {
  const response = await apiClient.post<PosCustomer>("/v1/pos/customers/", {
    branch: input.branchId,
    name: input.name,
    phone: input.phone ?? "",
    notes: input.notes ?? "",
  });
  return response.data;
}

export async function listCustomerAddresses(customerId: string): Promise<PosAddress[]> {
  const response = await apiClient.get(`/v1/pos/customers/${customerId}/addresses/`);
  return unwrapList<PosAddress>(response.data);
}

export async function createCustomerAddress(input: {
  customerId: string;
  line1: string;
  city?: string;
  label?: string;
}): Promise<PosAddress> {
  const response = await apiClient.post<PosAddress>(`/v1/pos/customers/${input.customerId}/addresses/`, {
    line1: input.line1,
    city: input.city ?? "",
    label: input.label ?? "",
  });
  return response.data;
}
