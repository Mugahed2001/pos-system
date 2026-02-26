import { apiClient } from "../../../../shared/lib/apiClient";
import type { OrderChannelCode } from "../../../sales/model/posTypes";
import type {
  CashierOrderDetail,
  CashierOrderListItem,
  CashierPayment,
  CashMovementDto,
  PrintJobDto,
} from "../model/types";

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const maybeResults = (payload as { results?: T[] } | undefined)?.results;
  return Array.isArray(maybeResults) ? maybeResults : [];
}

export async function fetchCashierOrders(params: {
  branchId: string;
  shiftId?: string;
  status?: string;
  channel?: OrderChannelCode | "";
  query?: string;
  held?: boolean | null;
}): Promise<CashierOrderListItem[]> {
  const response = await apiClient.get("/v1/pos/orders/", {
    params: {
      branch_id: params.branchId,
      ...(params.shiftId ? { shift_id: params.shiftId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.channel ? { channel: params.channel } : {}),
      ...(params.query ? { q: params.query } : {}),
      ...(typeof params.held === "boolean" ? { held: params.held } : {}),
      page_size: 100,
    },
  });
  return unwrapList<CashierOrderListItem>(response.data);
}

export async function fetchOrderDetail(orderId: string): Promise<CashierOrderDetail> {
  const response = await apiClient.get(`/v1/pos/orders/${orderId}/`);
  return response.data;
}

export async function updateOrder(orderId: string, payload: Record<string, unknown>): Promise<CashierOrderDetail> {
  const response = await apiClient.patch(`/v1/pos/orders/${orderId}/`, payload);
  return response.data;
}

export async function holdOrder(orderId: string): Promise<CashierOrderDetail> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/hold/`, {});
  return response.data;
}

export async function resumeOrder(orderId: string): Promise<CashierOrderDetail> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/resume/`, {});
  return response.data;
}

export async function submitOrder(orderId: string): Promise<CashierOrderDetail> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/submit/`, {});
  return response.data;
}

export async function updateOrderStatus(orderId: string, status: string): Promise<CashierOrderDetail> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/status/`, { status });
  return response.data;
}

export async function cancelOrder(orderId: string, input: { reason: string; managerPin: string }): Promise<CashierOrderDetail> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/cancel/`, {
    reason: input.reason,
    manager_pin: input.managerPin,
  });
  return response.data;
}

export async function refundOrder(
  orderId: string,
  input: {
    reason: string;
    managerPin: string;
    idempotencyKey?: string;
    method?: "cash" | "card" | "wallet";
    refundType?: "full" | "partial";
    amount?: string;
  },
): Promise<CashierOrderDetail> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/refund/`, {
    idempotency_key: input.idempotencyKey ?? `${orderId}-refund-${Date.now()}`,
    reason: input.reason,
    manager_pin: input.managerPin,
    method: input.method ?? "cash",
    refund_type: input.refundType ?? "full",
    ...(input.amount ? { amount: input.amount } : {}),
  });
  return response.data;
}

export async function listPayments(orderId: string): Promise<CashierPayment[]> {
  const response = await apiClient.get(`/v1/pos/orders/${orderId}/payments/`);
  return unwrapList<CashierPayment>(response.data);
}

export async function addPayment(orderId: string, payload: {
  idempotencyKey: string;
  method: "cash" | "card" | "wallet";
  amount: string;
  referenceNo?: string;
}): Promise<{ id: string; order_id: string; method: string; amount: string; order_status: string }> {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/payments/`, {
    idempotency_key: payload.idempotencyKey,
    method: payload.method,
    amount: payload.amount,
    reference_no: payload.referenceNo ?? "",
  });
  return response.data;
}

export async function searchCustomers(branchId: string, query: string) {
  const response = await apiClient.get("/v1/pos/customers/", { params: { branch_id: branchId, q: query } });
  return unwrapList<any>(response.data);
}

export async function createCustomer(input: { branchId: string; name: string; phone?: string; notes?: string }) {
  const response = await apiClient.post("/v1/pos/customers/", {
    branch: input.branchId,
    name: input.name,
    phone: input.phone ?? "",
    notes: input.notes ?? "",
  });
  return response.data;
}

export async function attachCustomerToOrder(orderId: string, input: { customerId: string; addressId?: string | null }) {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/attach-customer/`, {
    customer_id: input.customerId,
    address_id: input.addressId ?? null,
  });
  return response.data;
}

export async function fetchCashMovements(branchId: string, date?: string): Promise<CashMovementDto[]> {
  const response = await apiClient.get("/v1/pos/cash-movements", {
    params: {
      branch_id: branchId,
      ...(date ? { date } : {}),
    },
  });
  return unwrapList<CashMovementDto>(response.data);
}

export async function createCashMovement(payload: {
  shiftId: string;
  movementType: "paid_in" | "paid_out";
  amount: string;
  reason: string;
}) {
  const response = await apiClient.post("/v1/pos/cash-movements", {
    shift_id: payload.shiftId,
    movement_type: payload.movementType,
    amount: payload.amount,
    reason: payload.reason,
  });
  return response.data;
}

export async function printReceipt(orderId: string): Promise<PrintJobDto> {
  const response = await apiClient.post("/v1/pos/print/receipt", { order_id: orderId });
  return response.data;
}
