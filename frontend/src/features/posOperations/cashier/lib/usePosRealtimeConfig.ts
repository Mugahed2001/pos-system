import { useEffect, useRef } from "react";

import { ENV } from "../../../../app/config/env";
import { AUTH_TOKEN_KEY, DEVICE_TOKEN_KEY } from "../../../../shared/constants/keys";
import { storage } from "../../../../shared/lib/storage";

export type PosRealtimeMessageType =
  | "CONFIG_SNAPSHOT"
  | "CONFIG_PATCH"
  | "MENU_PATCH"
  | "PRICE_PATCH"
  | "PERMISSION_PATCH"
  | "FORCE_LOGOUT"
  | "ORDER_UPDATE";

export interface PosRealtimeMessage {
  type: PosRealtimeMessageType;
  branch_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

function buildWsBaseUrl() {
  const apiUrl = ENV.apiBaseUrl;
  const wsUrl = apiUrl.replace(/^http/, "ws");
  const withoutApi = wsUrl.endsWith("/api") ? wsUrl.slice(0, -4) : wsUrl;
  return withoutApi;
}

interface UsePosRealtimeConfigInput {
  branchId: string;
  onConfigChange: (msg: PosRealtimeMessage) => void;
  onForceLogout?: (msg: PosRealtimeMessage) => void;
}

export function usePosRealtimeConfig(input: UsePosRealtimeConfigInput) {
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);
  const failedAttemptsRef = useRef(0);

  const { branchId, onConfigChange, onForceLogout } = input;

  useEffect(() => {
    stoppedRef.current = false;
    failedAttemptsRef.current = 0;
    if (!ENV.enablePosWs) return;

    async function connect() {
      if (!branchId) return;
      if (failedAttemptsRef.current >= 5) return;

      const [token, storedDeviceToken] = await Promise.all([
        storage.getString(AUTH_TOKEN_KEY),
        storage.getString(DEVICE_TOKEN_KEY),
      ]);

      if (!token) return;
      const deviceToken = storedDeviceToken || ENV.defaultDeviceToken;
      const base = buildWsBaseUrl();
      const url = `${base}/ws/pos/config/${branchId}/?token=${encodeURIComponent(token)}&device_token=${encodeURIComponent(deviceToken || "")}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      const connectedAt = Date.now();
      let opened = false;

      ws.onopen = () => {
        opened = true;
        failedAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as PosRealtimeMessage;
          failedAttemptsRef.current = 0;
          if (parsed.type === "FORCE_LOGOUT") {
            onForceLogout?.(parsed);
            return;
          }
          onConfigChange(parsed);
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onclose = () => {
        if (stoppedRef.current) return;
        const closedBeforeOpen = !opened && Date.now() - connectedAt < 2000;
        if (closedBeforeOpen) {
          // Endpoint likely unsupported in current backend runtime (e.g. dev runserver without WS routing).
          failedAttemptsRef.current = 5;
          return;
        }
        failedAttemptsRef.current += 1;
        if (failedAttemptsRef.current >= 5) return;
        const backoffMs = Math.min(15000, 2000 * failedAttemptsRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          void connect();
        }, backoffMs);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    void connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [branchId, onConfigChange, onForceLogout]);
}
