import { useCallback, useState } from "react";
import { saveCashierUiToggles } from "../api/cashierSettingsApi";
import { useNotification } from "../../../shared/notifications";
import { CashierSettings } from "./useCashierSettings";

type SyncableSettings = Pick<
  CashierSettings,
  "showHeldOrdersBar" | "showDeferredOrdersBar" | "enableServiceCharge" | "dineInPaymentTiming"
>;

export function useSettingsSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const notify = useNotification();

  const syncServerSettings = useCallback(
    async (branchId: string, settings: SyncableSettings) => {
      if (!branchId) {
        notify.warning("لا يمكن مزامنة إعدادات الكاشير بدون تحديد الفرع.");
        return false;
      }

      setIsSyncing(true);
      try {
        await saveCashierUiToggles(branchId, {
          show_held_orders: settings.showHeldOrdersBar,
          show_deferred_orders: settings.showDeferredOrdersBar,
          enable_service_charge: settings.enableServiceCharge,
          dine_in_payment_timing: settings.dineInPaymentTiming,
        });
        notify.success("تم تحديث إعدادات الكاشير.");
        return true;
      } catch (error) {
        notify.error("تعذر مزامنة إعدادات الكاشير مع الخادم.");
        console.error("Settings sync error:", error);
        return false;
      } finally {
        setIsSyncing(false);
      }
    },
    [notify]
  );

  return {
    syncServerSettings,
    isSyncing,
  };
}
