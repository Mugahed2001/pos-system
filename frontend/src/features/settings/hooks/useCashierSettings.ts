import { useEffect, useState } from "react";
import { BRANCH_ID_KEY, POS_CASHIER_SETTINGS_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";

export type CashierSettings = {
  autoPrintReceipt: boolean;
  autoOpenPaymentAfterSale: boolean;
  requireTableForDineIn: boolean;
  dineInPaymentTiming: "before_meal" | "after_meal";
  compactProductsGrid: boolean;
  enableServiceCharge: boolean;
  serviceChargePercent: number;
  deliveryFeeAmount: number;
  showHeldOrdersBar: boolean;
  showDeferredOrdersBar: boolean;
  soundAlerts: boolean;
  autoFocusSearch: boolean;
  defaultSeats: number;
  receiptCopies: number;
};

export const DEFAULT_SETTINGS: CashierSettings = {
  autoPrintReceipt: false,
  autoOpenPaymentAfterSale: true,
  requireTableForDineIn: true,
  dineInPaymentTiming: "before_meal",
  compactProductsGrid: true,
  enableServiceCharge: true,
  serviceChargePercent: 0,
  deliveryFeeAmount: 0,
  showHeldOrdersBar: true,
  showDeferredOrdersBar: true,
  soundAlerts: true,
  autoFocusSearch: true,
  defaultSeats: 1,
  receiptCopies: 1,
};

function parseSettings(raw: string | null): CashierSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<CashierSettings>;
    return {
      autoPrintReceipt: typeof parsed.autoPrintReceipt === "boolean" ? parsed.autoPrintReceipt : DEFAULT_SETTINGS.autoPrintReceipt,
      autoOpenPaymentAfterSale:
        typeof parsed.autoOpenPaymentAfterSale === "boolean"
          ? parsed.autoOpenPaymentAfterSale
          : DEFAULT_SETTINGS.autoOpenPaymentAfterSale,
      requireTableForDineIn:
        typeof parsed.requireTableForDineIn === "boolean" ? parsed.requireTableForDineIn : DEFAULT_SETTINGS.requireTableForDineIn,
      dineInPaymentTiming:
        parsed.dineInPaymentTiming === "after_meal" || parsed.dineInPaymentTiming === "before_meal"
          ? parsed.dineInPaymentTiming
          : DEFAULT_SETTINGS.dineInPaymentTiming,
      compactProductsGrid:
        typeof parsed.compactProductsGrid === "boolean" ? parsed.compactProductsGrid : DEFAULT_SETTINGS.compactProductsGrid,
      enableServiceCharge:
        typeof parsed.enableServiceCharge === "boolean" ? parsed.enableServiceCharge : DEFAULT_SETTINGS.enableServiceCharge,
      serviceChargePercent:
        Number.isFinite(Number(parsed.serviceChargePercent)) &&
        Number(parsed.serviceChargePercent) >= 0 &&
        Number(parsed.serviceChargePercent) <= 100
          ? Math.floor(Number(parsed.serviceChargePercent))
          : DEFAULT_SETTINGS.serviceChargePercent,
      deliveryFeeAmount:
        Number.isFinite(Number(parsed.deliveryFeeAmount)) && Number(parsed.deliveryFeeAmount) >= 0
          ? Number(parsed.deliveryFeeAmount)
          : DEFAULT_SETTINGS.deliveryFeeAmount,
      showHeldOrdersBar: typeof parsed.showHeldOrdersBar === "boolean" ? parsed.showHeldOrdersBar : DEFAULT_SETTINGS.showHeldOrdersBar,
      showDeferredOrdersBar:
        typeof parsed.showDeferredOrdersBar === "boolean" ? parsed.showDeferredOrdersBar : DEFAULT_SETTINGS.showDeferredOrdersBar,
      soundAlerts: typeof parsed.soundAlerts === "boolean" ? parsed.soundAlerts : DEFAULT_SETTINGS.soundAlerts,
      autoFocusSearch: typeof parsed.autoFocusSearch === "boolean" ? parsed.autoFocusSearch : DEFAULT_SETTINGS.autoFocusSearch,
      defaultSeats:
        Number.isFinite(Number(parsed.defaultSeats)) && Number(parsed.defaultSeats) > 0
          ? Number(parsed.defaultSeats)
          : DEFAULT_SETTINGS.defaultSeats,
      receiptCopies:
        Number.isFinite(Number(parsed.receiptCopies)) && Number(parsed.receiptCopies) > 0
          ? Number(parsed.receiptCopies)
          : DEFAULT_SETTINGS.receiptCopies,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useCashierSettings() {
  const [settings, setSettings] = useState<CashierSettings>(DEFAULT_SETTINGS);
  const [branchId, setBranchId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [raw, storedBranchId] = await Promise.all([
        storage.getString(POS_CASHIER_SETTINGS_KEY),
        storage.getString(BRANCH_ID_KEY),
      ]);
      if (!mounted) return;
      const parsed = parseSettings(raw);
      setSettings(parsed);
      setBranchId(storedBranchId ?? "");
      setIsLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const updateSetting = <K extends keyof CashierSettings>(key: K, value: CashierSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    void storage.setString(POS_CASHIER_SETTINGS_KEY, JSON.stringify(next));
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    void storage.setString(POS_CASHIER_SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  };

  return {
    settings,
    branchId,
    isLoading,
    updateSetting,
    resetToDefaults,
  };
}
