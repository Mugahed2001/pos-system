import { apiClient } from "../../../shared/lib/apiClient";
import type { LoginPayload, LoginResponse, MeResponse } from "../model/types";
import { ENV } from "../../../app/config/env";

const authEndpoints = ["/v1/auth/login", "/auth/token/", "/token/", "/api-token-auth/"];
type LoginEndpointResponse = {
  token: string;
  id?: number;
  username?: string;
  is_staff?: boolean;
  roles?: string[];
  branch_id?: string | null;
};

export async function loginApi(payload: LoginPayload): Promise<LoginResponse> {
  let lastError: unknown;

  for (const endpoint of authEndpoints) {
    try {
      const body =
        endpoint === "/v1/auth/login"
          ? {
              username: payload.username,
              password: payload.password,
              pin: payload.pin ?? "",
              branch_id: payload.branchId,
              device_id: payload.deviceId,
              device_token: ENV.defaultDeviceToken,
            }
          : payload;
      const response = await apiClient.post<LoginEndpointResponse>(endpoint, body, { skipAuth: true });
      const data = response.data;
      return {
        token: data.token,
        id: typeof data.id === "number" ? data.id : 0,
        username: typeof data.username === "string" ? data.username : payload.username,
        is_staff: typeof data.is_staff === "boolean" ? data.is_staff : false,
        roles: Array.isArray(data.roles) ? data.roles.filter((x): x is string => typeof x === "string") : [],
        branch_id: typeof data.branch_id === "string" ? data.branch_id : null,
      };
    } catch (error: unknown) {
      lastError = error;
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 404) {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function getMeApi(): Promise<MeResponse> {
  const response = await apiClient.get<MeResponse>("/v1/auth/me");
  return response.data;
}
