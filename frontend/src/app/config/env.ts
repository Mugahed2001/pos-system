function normalizeUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const defaultApiUrl = "http://127.0.0.1:8000/api";
const defaultDeviceId = "POS-DEVICE-001";
const defaultDeviceToken = "device-demo-token";
const defaultEnablePosWs = true;

export const ENV = {
  appName: "POS Frontend",
  apiBaseUrl: normalizeUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiUrl),
  defaultDeviceId: process.env.EXPO_PUBLIC_DEVICE_ID ?? defaultDeviceId,
  defaultDeviceToken: process.env.EXPO_PUBLIC_DEVICE_TOKEN ?? defaultDeviceToken,
  defaultBranchId: process.env.EXPO_PUBLIC_BRANCH_ID ?? "",
  enablePosWs:
    (process.env.EXPO_PUBLIC_ENABLE_POS_WS ?? String(defaultEnablePosWs)).toLowerCase() === "true",
};
