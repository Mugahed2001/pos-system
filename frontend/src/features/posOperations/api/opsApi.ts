import { apiClient } from "../../../shared/lib/apiClient";
import type {
  ExternalOrderDto,
  PickupWindowOrderDto,
  PosConfigResponse,
  PosCustomer,
  PosDriver,
} from "../../sales/model/posTypes";

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const maybeResults = (payload as { results?: T[] } | undefined)?.results;
  return Array.isArray(maybeResults) ? maybeResults : [];
}

export async function fetchPosOverview(branchId: string): Promise<{
  config: PosConfigResponse;
  customers: PosCustomer[];
  drivers: PosDriver[];
}> {
  const [configRes, customersRes, driversRes] = await Promise.all([
    apiClient.get<PosConfigResponse>("/v1/pos/config", { params: { branch_id: branchId, since_version: 0 } }),
    apiClient.get("/v1/pos/customers/", { params: { branch_id: branchId } }),
    apiClient.get("/v1/admin/drivers/", { params: { branch_id: branchId } }),
  ]);
  return {
    config: configRes.data,
    customers: unwrapList<PosCustomer>(customersRes.data),
    drivers: unwrapList<PosDriver>(driversRes.data),
  };
}

export async function fetchPosConfig(branchId: string): Promise<PosConfigResponse> {
  const response = await apiClient.get<PosConfigResponse>("/v1/pos/config", {
    params: { branch_id: branchId, since_version: 0 },
  });
  return response.data;
}

export async function fetchDailyOpsReports(branchId: string, date?: string) {
  const params = { branch_id: branchId, ...(date ? { date } : {}) };
  const [sales, payments, voids] = await Promise.all([
    apiClient.get("/v1/reports/daily-sales", { params }),
    apiClient.get("/v1/reports/payments-summary", { params }),
    apiClient.get("/v1/reports/voids-discounts-refunds", { params }),
  ]);
  return { sales: sales.data, payments: payments.data, voids: voids.data };
}

export async function fetchShifts(branchId: string, date?: string) {
  const response = await apiClient.get("/v1/pos/shifts", { params: { branch_id: branchId, ...(date ? { date } : {}) } });
  return unwrapList<any>(response.data);
}

export async function fetchKdsQueue(branchId: string, station?: string) {
  const response = await apiClient.get("/v1/kds/queue", { params: { branch_id: branchId, ...(station ? { station } : {}) } });
  return unwrapList<any>(response.data);
}

export async function markKdsItemStatus(itemId: string, status: "new" | "preparing" | "ready" | "served") {
  const response = await apiClient.post(`/v1/kds/items/${itemId}/status`, { status });
  return response.data as { id: string; status: "new" | "preparing" | "ready" | "served" };
}

export async function updateOrderPriority(orderId: string, kitchenPriority: "low" | "normal" | "high" | "urgent") {
  const response = await apiClient.post(`/v1/pos/orders/${orderId}/priority/`, { kitchen_priority: kitchenPriority });
  return response.data as { id: string; kitchen_priority: "low" | "normal" | "high" | "urgent" };
}

export async function fetchOrders(branchId: string) {
  const response = await apiClient.get("/v1/pos/orders/", { params: { branch_id: branchId, page_size: 100 } });
  return unwrapList<any>(response.data);
}

export async function fetchExternalOrders(branchId: string, status?: string, date?: string): Promise<ExternalOrderDto[]> {
  const response = await apiClient.get("/v1/pos/external-orders", {
    params: {
      branch_id: branchId,
      ...(status ? { status } : {}),
      ...(date ? { date } : {}),
    },
  });
  return unwrapList<ExternalOrderDto>(response.data);
}

export async function markExternalOrderReady(externalOrderId: string) {
  const response = await apiClient.post(`/v1/integrations/external-orders/${externalOrderId}/mark-ready`);
  return response.data;
}

export async function retryExternalOrder(externalOrderId: string) {
  const response = await apiClient.post(`/v1/integrations/external-orders/${externalOrderId}/retry`);
  return response.data;
}

export async function fetchPickupWindowOrders(
  branchId: string,
  query?: string,
  status?: string,
): Promise<PickupWindowOrderDto[]> {
  const response = await apiClient.get("/v1/pos/pickup-window/orders", {
    params: {
      branch_id: branchId,
      ...(query ? { q: query } : {}),
      ...(status ? { status } : {}),
    },
  });
  return unwrapList<PickupWindowOrderDto>(response.data);
}

export async function markPickupArrived(orderId: string) {
  const response = await apiClient.post(`/v1/pos/pickup-window/orders/${orderId}/mark-arrived`);
  return response.data;
}

export async function markPickupReady(orderId: string) {
  const response = await apiClient.post(`/v1/pos/pickup-window/orders/${orderId}/mark-ready`);
  return response.data;
}

export async function markPickupHandedOver(orderId: string) {
  const response = await apiClient.post(`/v1/pos/pickup-window/orders/${orderId}/mark-handed-over`);
  return response.data;
}

export async function markWaiterOrderDelivered(orderId: string) {
  const response = await apiClient.post(`/v1/pos/waiter/orders/${orderId}/mark-delivered`);
  return response.data;
}

export async function fetchDeviceContext(branchId?: string) {
  const response = await apiClient.get("/v1/pos/device/context", {
    params: branchId ? { branch_id: branchId } : undefined,
  });
  return response.data;
}

export async function selectDevice(input: { branchId: string; deviceId: string; displayName: string }) {
  const response = await apiClient.post("/v1/pos/device/select", {
    branch_id: input.branchId,
    device_id: input.deviceId,
    display_name: input.displayName,
  });
  return response.data as { device_id: string; branch_id: string; token: string; config_version: number };
}

export async function fetchActiveShift(branchId: string, deviceId: string) {
  const response = await apiClient.get("/v1/pos/shifts/active", {
    params: { branch_id: branchId, device_id: deviceId },
  });
  return response.data as { active: boolean; shift: any | null };
}

export async function openShift(input: {
  branchId: string;
  deviceId: string;
  openingCash?: string;
  idempotencyKey?: string;
  openedAt?: string;
}) {
  const response = await apiClient.post("/v1/pos/shifts/open", {
    branch_id: input.branchId,
    device_id: input.deviceId,
    ...(input.openingCash ? { opening_cash: input.openingCash } : {}),
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
    ...(input.openedAt ? { opened_at: input.openedAt } : {}),
  });
  return response.data as {
    id: string;
    status: string;
    reused?: boolean;
    numeric_id?: string;
    opened_at?: string;
    opened_at_local?: string;
    sync_status?: "pending_sync" | "synced" | "failed";
  };
}

export async function closeShift(input: { shiftId: string; closingCash: string; closedAt?: string }) {
  const response = await apiClient.post(`/v1/pos/shifts/${input.shiftId}/close`, {
    closing_cash: input.closingCash,
    ...(input.closedAt ? { closed_at: input.closedAt } : {}),
  });
  return response.data as {
    id: string;
    numeric_id?: string;
    status: string;
    variance: string;
  };
}

export async function fetchDeviceChecks(branchId: string, deviceId: string, date?: string) {
  const response = await apiClient.get("/v1/pos/device-checks", {
    params: { branch_id: branchId, device_id: deviceId, ...(date ? { date } : {}) },
  });
  return unwrapList<any>(response.data);
}

export async function createDeviceChecks(payload: {
  branchId: string;
  deviceId: string;
  shiftId: string;
  checks: Array<{ type: string; status: "pass" | "warn" | "fail"; details?: Record<string, unknown> }>;
}) {
  const response = await apiClient.post("/v1/pos/device-checks", {
    branch_id: payload.branchId,
    device_id: payload.deviceId,
    shift_id: payload.shiftId,
    checks: payload.checks,
  });
  return response.data;
}

export async function testReceiptPrint() {
  const response = await apiClient.post("/v1/pos/print/test-receipt");
  return response.data;
}

export async function openCashDrawer() {
  const response = await apiClient.post("/v1/pos/cash-drawer/open");
  return response.data;
}

export async function fetchSyncStatus(deviceId: string) {
  const response = await apiClient.get("/v1/pos/sync/status", { params: { device_id: deviceId } });
  return response.data as {
    device_id: string;
    pending_idempotency: number;
    mapped_orders: number;
    last_sync: string | null;
  };
}
