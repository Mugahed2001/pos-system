import { useEffect, useState } from "react";

import { BRANCH_ID_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import type { PosConfigResponse, PosCustomer, PosDriver } from "../../sales/model/posTypes";
import { fetchPosOverview } from "../api/opsApi";

interface BootstrapState {
  loading: boolean;
  error: string;
  branchId: string;
  config: PosConfigResponse | null;
  customers: PosCustomer[];
  drivers: PosDriver[];
}

interface OverviewPayload {
  branchId: string;
  config: PosConfigResponse;
  customers: PosCustomer[];
  drivers: PosDriver[];
}

const BOOTSTRAP_CACHE_TTL_MS = 60_000;
const BRANCH_NOT_SET_ERROR = "الفرع غير محدد.";
const DEFAULT_BOOTSTRAP_ERROR = "تعذر تحميل بيانات التشغيل الخاصة بنقطة البيع.";

let cachedPayload: OverviewPayload | null = null;
let cachedAt = 0;
let inFlightLoad: Promise<OverviewPayload> | null = null;

async function loadOverview(): Promise<OverviewPayload> {
  const branchId = (await storage.getString(BRANCH_ID_KEY)) ?? "";
  if (!branchId) {
    throw new Error(BRANCH_NOT_SET_ERROR);
  }

  const now = Date.now();
  if (cachedPayload && now - cachedAt < BOOTSTRAP_CACHE_TTL_MS && cachedPayload.branchId === branchId) {
    return cachedPayload;
  }

  if (!inFlightLoad) {
    inFlightLoad = fetchPosOverview(branchId)
      .then((payload) => {
        cachedPayload = {
          branchId,
          config: payload.config,
          customers: payload.customers,
          drivers: payload.drivers,
        };
        cachedAt = Date.now();
        return cachedPayload;
      })
      .finally(() => {
        inFlightLoad = null;
      });
  }

  return inFlightLoad;
}

export function usePosOpsBootstrap() {
  const [state, setState] = useState<BootstrapState>({
    loading: true,
    error: "",
    branchId: "",
    config: null,
    customers: [],
    drivers: [],
  });

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        const payload = await loadOverview();
        if (!mounted) return;
        setState({
          loading: false,
          error: "",
          branchId: payload.branchId,
          config: payload.config,
          customers: payload.customers,
          drivers: payload.drivers,
        });
      } catch (error) {
        if (!mounted) return;
        const message = error instanceof Error && error.message === BRANCH_NOT_SET_ERROR
          ? BRANCH_NOT_SET_ERROR
          : DEFAULT_BOOTSTRAP_ERROR;
        setState((prev) => ({ ...prev, loading: false, error: message }));
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
