import { apiClient } from "../../../shared/lib/apiClient";
import type { PosConfigResponse } from "../model/posTypes";

export async function registerPosDevice(payload: {
  branchId: string;
  deviceId: string;
  displayName: string;
}): Promise<{ device_id: string; branch_id: string; token: string; config_version: number }> {
  const response = await apiClient.post(
    "/v1/auth/device/register",
    {
      branch_id: payload.branchId,
      device_id: payload.deviceId,
      display_name: payload.displayName,
    },
    { skipAuth: true },
  );
  return response.data;
}

export async function getPosConfig(params: {
  branchId?: string;
  sinceVersion?: number;
}): Promise<PosConfigResponse> {
  const response = await apiClient.get<PosConfigResponse>("/v1/pos/config", {
    params: {
      ...(params.branchId ? { branch_id: params.branchId } : {}),
      since_version: params.sinceVersion ?? 0,
    },
  });
  return response.data;
}

export async function getPosConfigVersion(branchId?: string): Promise<{ branch_id: string; version: number }> {
  const response = await apiClient.get<{ branch_id: string; version: number }>("/v1/pos/config/version", {
    params: branchId ? { branch_id: branchId } : {},
  });
  return response.data;
}

export async function getSyncStatus(deviceId: string): Promise<{
  device_id: string;
  pending_idempotency: number;
  mapped_orders: number;
  last_sync: string | null;
}> {
  const response = await apiClient.get("/v1/pos/sync/status", {
    params: { device_id: deviceId },
  });
  return response.data;
}
