import { apiClient } from "../../../shared/lib/apiClient";
import type { CreatePosOrderPayload } from "../model/posTypes";

export async function createPosOrder(payload: CreatePosOrderPayload): Promise<{
  id: string;
  local_id: string;
  status: string;
  grand_total: string;
  mapping: { local_id: string; server_id: string };
}> {
  const response = await apiClient.post("/v1/pos/orders/", payload);
  return response.data;
}

export async function submitPosOrder(orderId: string): Promise<{
  id: string;
  status: string;
}> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/submit/`, {});
  return response.data;
}

export async function payPosOrder(input: {
  orderId: string;
  idempotencyKey: string;
  method: "cash" | "card" | "wallet";
  amount: string;
  referenceNo?: string;
}): Promise<{
  id: string;
  order_id: string;
  method: string;
  amount: string;
  order_status: string;
}> {
  const response = await apiClient.post(`/v1/pos/orders/${input.orderId}/payments/`, {
    idempotency_key: input.idempotencyKey,
    method: input.method,
    amount: input.amount,
    reference_no: input.referenceNo ?? "",
  });
  return response.data;
}
