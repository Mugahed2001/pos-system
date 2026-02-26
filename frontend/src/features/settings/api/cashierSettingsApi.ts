import { apiClient } from "../../../shared/lib/apiClient";

export async function saveCashierUiToggles(branchId: string, uiToggles: Record<string, unknown>) {
  const response = await apiClient.post("/v1/config-engine/cashier-settings", {
    branch_id: branchId,
    ui_toggles: uiToggles,
    name: "Cashier Settings",
  });
  return response.data as {
    branch_id: string;
    release_id: string;
    version: number;
    ui_toggles: Record<string, unknown>;
  };
}
