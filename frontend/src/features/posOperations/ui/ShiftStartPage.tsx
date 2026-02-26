import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useAuth } from "../../auth";
import {
  createDeviceChecks,
  fetchActiveShift,
  fetchDeviceChecks,
  fetchDeviceContext,
  fetchSyncStatus,
  closeShift,
  openCashDrawer,
  openShift,
  selectDevice,
  testReceiptPrint,
} from "../api/opsApi";
import {
  ACTIVE_SHIFT_ID_KEY,
  BRANCH_ID_KEY,
  DEVICE_CHECKS_CACHE_KEY,
  DEVICE_ID_KEY,
  DEVICE_TOKEN_KEY,
} from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import { BRAND_COLORS } from "../../../shared/theme/brand";

type DeviceCheckStatus = "pass" | "warn" | "fail" | "idle";

type DeviceCheck = {
  type: string;
  status: DeviceCheckStatus;
  details?: Record<string, unknown>;
  at?: string;
};

const THEME = {
  bg: BRAND_COLORS.bg,
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  danger: BRAND_COLORS.danger,
  warn: BRAND_COLORS.warning,
  success: BRAND_COLORS.success,
  text: BRAND_COLORS.textMain,
  muted: BRAND_COLORS.textSub,
};
const PENDING_SHIFT_START_KEY = "pos_pending_shift_start";

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ar-EG");
  } catch {
    return value;
  }
};

const toNumericShiftId = (value?: string | null) => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits || "-";
};

const dedupeChecks = (items: DeviceCheck[]) => {
  const byType = new Map<string, DeviceCheck>();
  items.forEach((item) => {
    const existing = byType.get(item.type);
    if (!existing) {
      byType.set(item.type, item);
      return;
    }
    const existingAt = existing.at ? new Date(existing.at).getTime() : 0;
    const nextAt = item.at ? new Date(item.at).getTime() : 0;
    if (nextAt >= existingAt) byType.set(item.type, item);
  });
  return Array.from(byType.values()).sort((a, b) => {
    const aAt = a.at ? new Date(a.at).getTime() : 0;
    const bAt = b.at ? new Date(b.at).getTime() : 0;
    return bAt - aAt;
  });
};

const extractErrorMessage = (error: unknown, fallback: string) => {
  const maybeResponse = (error as { response?: { data?: { detail?: string; non_field_errors?: string[] | string } } })?.response;
  if (!maybeResponse?.data) return fallback;
  const { detail, non_field_errors: nonFieldErrors } = maybeResponse.data;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(nonFieldErrors) && nonFieldErrors.length > 0) return String(nonFieldErrors[0]);
  if (typeof nonFieldErrors === "string" && nonFieldErrors.trim()) return nonFieldErrors;
  return fallback;
};

export function ShiftStartPage() {
  const navigation = useNavigation<any>();
  const { user, isAuthenticated, signIn } = useAuth();

  const [step, setStep] = useState(1);
  const [loginMode, setLoginMode] = useState<"pin" | "password">("pin");
  const [username, setUsername] = useState(user?.username ?? "");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [branchId, setBranchId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string; requires_opening_cash: boolean }>>([]);
  const [devices, setDevices] = useState<Array<{ device_id: string; display_name: string; branch_id: string }>>([]);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [requiresOpeningCash, setRequiresOpeningCash] = useState(true);

  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [shiftError, setShiftError] = useState("");
  const [shiftSuccess, setShiftSuccess] = useState("");
  const [closingShift, setClosingShift] = useState(false);
  const [activeShiftId, setActiveShiftId] = useState("");
  const [openShiftRequestKey, setOpenShiftRequestKey] = useState("");

  const [networkStatus, setNetworkStatus] = useState<DeviceCheckStatus>("idle");
  const [syncStatus, setSyncStatus] = useState<{ last_sync: string | null; pending_idempotency: number; mapped_orders: number } | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<DeviceCheckStatus>("idle");
  const [drawerStatus, setDrawerStatus] = useState<DeviceCheckStatus>("idle");
  const [checks, setChecks] = useState<DeviceCheck[]>([]);
  const [deviceCheckError, setDeviceCheckError] = useState("");
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingShift, setLoadingShift] = useState(false);

  const hydratePendingShift = async (expectedBranchId: string, expectedDeviceId: string) => {
    const pendingRaw = await storage.getString(PENDING_SHIFT_START_KEY);
    if (!pendingRaw) return false;
    try {
      const pending = JSON.parse(pendingRaw) as {
        id: string;
        branch_id: string;
        device_id: string;
        opening_cash: string;
        opened_at: string;
        opened_at_local: string;
        sync_status: "pending_sync";
      };
      if (pending.branch_id !== expectedBranchId || pending.device_id !== expectedDeviceId) {
        return false;
      }
      setActiveShift({
        id: pending.id,
        branch_id: pending.branch_id,
        device_id: pending.device_id,
        username: user?.username ?? "-",
        status: "open",
        opening_cash: pending.opening_cash,
        opened_at: pending.opened_at,
        opened_at_local: pending.opened_at_local,
        sync_status: pending.sync_status,
      });
      setActiveShiftId(pending.id);
      await storage.setString(ACTIVE_SHIFT_ID_KEY, pending.id);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadContext = async () => {
      setLoadingContext(true);
      const [storedBranchId, storedDeviceId, storedDeviceToken] = await Promise.all([
        storage.getString(BRANCH_ID_KEY),
        storage.getString(DEVICE_ID_KEY),
        storage.getString(DEVICE_TOKEN_KEY),
      ]);
      const branch = storedBranchId ?? "";
      const device = storedDeviceId ?? "";
      if (!mounted) return;
      setBranchId(branch);
      setDeviceId(device);
      setSelectedBranchId(branch);
      setSelectedDeviceId(device);
      setDeviceName(device ? `جهاز ${device}` : "");

      try {
        const context = await fetchDeviceContext(branch || undefined);
        if (!mounted) return;
        setBranches(context.branches ?? []);
        setDevices(context.devices ?? []);
        const currentBranch = context.current_branch;
        if (currentBranch?.requires_opening_cash !== undefined) {
          setRequiresOpeningCash(Boolean(currentBranch.requires_opening_cash));
        }
      } catch {
        if (!mounted) return;
        setBranches([]);
        setDevices([]);
      } finally {
        if (mounted) setLoadingContext(false);
      }
    };

    void loadContext();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setUsername(user?.username ?? "");
  }, [user]);

  useEffect(() => {
    if (!showDevicePicker || !selectedBranchId) return;
    const loadDevices = async () => {
      try {
        const context = await fetchDeviceContext(selectedBranchId);
        setDevices(context.devices ?? []);
      } catch {
        setDevices([]);
      }
    };
    void loadDevices();
  }, [showDevicePicker, selectedBranchId]);

  useEffect(() => {
    if (step !== 2 || !branchId || !deviceId) return;
    setLoadingShift(true);
    setShiftError("");
    void fetchActiveShift(branchId, deviceId)
      .then((payload) => {
        setActiveShift(payload.active ? payload.shift : null);
        if (payload.active && payload.shift?.id) {
          setActiveShiftId(payload.shift.id);
          storage.setString(ACTIVE_SHIFT_ID_KEY, payload.shift.id);
        }
      })
      .catch(async () => {
        const hydrated = await hydratePendingShift(branchId, deviceId);
        if (!hydrated) {
          setShiftError("تعذر التحقق من الوردية الحالية.");
          return;
        }
        setShiftError("تم تحميل وردية محلية بانتظار المزامنة.");
      })
      .finally(() => setLoadingShift(false));
  }, [step, branchId, deviceId, user?.username]);

  useEffect(() => {
    if (step !== 1 || !isAuthenticated || !branchId || !deviceId) return;
    setLoadingShift(true);
    setShiftError("");
    void fetchActiveShift(branchId, deviceId)
      .then((payload) => {
        if (!payload.active || !payload.shift?.id) return;
        setActiveShift(payload.shift);
        setActiveShiftId(payload.shift.id);
        storage.setString(ACTIVE_SHIFT_ID_KEY, payload.shift.id);
        setStep(2);
      })
      .catch(async () => {
        const hydrated = await hydratePendingShift(branchId, deviceId);
        if (!hydrated) return;
        setShiftError("تم تحميل وردية محلية بانتظار المزامنة.");
        setStep(2);
      })
      .finally(() => setLoadingShift(false));
  }, [step, isAuthenticated, branchId, deviceId, user?.username]);

  useEffect(() => {
    if (step !== 3 || !deviceId || !branchId) return;
    let mounted = true;
    const loadChecks = async () => {
      try {
        const status = await fetchSyncStatus(deviceId);
        if (!mounted) return;
        setSyncStatus(status);
        setNetworkStatus("pass");
      } catch {
        if (!mounted) return;
        setNetworkStatus("fail");
      }
      try {
        const history = await fetchDeviceChecks(branchId, deviceId);
        if (!mounted) return;
        const last = history[0];
        if (last?.checks) {
          setChecks(dedupeChecks(last.checks as DeviceCheck[]));
        }
      } catch {
        if (!mounted) return;
      }
    };
    void loadChecks();
    return () => {
      mounted = false;
    };
  }, [step, branchId, deviceId]);

  const handleLogin = async () => {
    setLoginError("");
    if (isAuthenticated && !pin && !password) {
      setStep(2);
      return;
    }
    if (!username.trim()) {
      setLoginError("يرجى إدخال اسم المستخدم.");
      return;
    }
    try {
      await signIn({
        username: username.trim(),
        password: loginMode === "password" ? password : "",
        pin: loginMode === "pin" ? pin : "",
        branchId: selectedBranchId || branchId || undefined,
        deviceId: selectedDeviceId || deviceId || undefined,
      });
      setStep(2);
    } catch {
      setLoginError("تعذر تسجيل الدخول. تحقق من البيانات.");
    }
  };

  const handleSelectDevice = async () => {
    if (!selectedBranchId || !selectedDeviceId || !deviceName.trim()) {
      setLoginError("يرجى تحديد الفرع والجهاز واسم الجهاز.");
      return;
    }
    try {
      const payload = await selectDevice({
        branchId: selectedBranchId,
        deviceId: selectedDeviceId,
        displayName: deviceName.trim(),
      });
      await Promise.all([
        storage.setString(BRANCH_ID_KEY, payload.branch_id),
        storage.setString(DEVICE_ID_KEY, payload.device_id),
        storage.setString(DEVICE_TOKEN_KEY, payload.token),
      ]);
      setBranchId(payload.branch_id);
      setDeviceId(payload.device_id);
      setShowDevicePicker(false);
      setLoginError("");
    } catch {
      setLoginError("تعذر تحديث الجهاز.");
    }
  };

  const handleOpenShift = async () => {
    if (!branchId || !deviceId) {
      setShiftError("الفرع أو الجهاز غير محدد.");
      return;
    }
    if (requiresOpeningCash && !openingCash.trim()) {
      setShiftError("يرجى إدخال رصيد الافتتاح.");
      return;
    }
    setShiftError("");
    setShiftSuccess("");
    const idempotencyKey = openShiftRequestKey || `shift-open-${Date.now()}`;
    setOpenShiftRequestKey(idempotencyKey);
    try {
      const response = await openShift({
        branchId,
        deviceId,
        openingCash: openingCash.trim() || undefined,
        idempotencyKey,
        openedAt: new Date().toISOString(),
      });
      setActiveShiftId(response.id);
      setOpenShiftRequestKey("");
      await storage.remove(PENDING_SHIFT_START_KEY);
      await storage.setString(ACTIVE_SHIFT_ID_KEY, response.id);
      setStep(3);
    } catch {
      const now = new Date().toISOString();
      const localShiftId = String(Date.now());
      const pendingShift = {
        id: localShiftId,
        branch_id: branchId,
        device_id: deviceId,
        opening_cash: openingCash.trim() || "0.00",
        opened_at: now,
        opened_at_local: now,
        sync_status: "pending_sync" as const,
      };
      await storage.setString(PENDING_SHIFT_START_KEY, JSON.stringify(pendingShift));
      await storage.setString(ACTIVE_SHIFT_ID_KEY, localShiftId);
      setActiveShift({
        id: localShiftId,
        branch_id: branchId,
        device_id: deviceId,
        username: user?.username ?? "-",
        status: "open",
        opening_cash: pendingShift.opening_cash,
        opened_at: now,
        opened_at_local: now,
        sync_status: "pending_sync",
      });
      setActiveShiftId(localShiftId);
      setShiftError("تعذر الاتصال بالخادم. تم حفظ فتح الوردية محليًا بانتظار المزامنة.");
      setStep(3);
    }
  };

  const handleCloseOwnShift = async () => {
    if (closingShift) return;
    if (!activeShiftId) {
      setShiftError("لا توجد وردية مفتوحة لإغلاقها.");
      setShiftSuccess("");
      return;
    }
    const closeValue = closingCash.trim();
    if (!closeValue) {
      setShiftError("يرجى إدخال رصيد الإغلاق.");
      setShiftSuccess("");
      return;
    }
    if (Number(closeValue) < 0) {
      setShiftError("رصيد الإغلاق لا يمكن أن يكون سالبًا.");
      setShiftSuccess("");
      return;
    }
    setClosingShift(true);
    setShiftError("");
    setShiftSuccess("");
    try {
      if (activeShift?.sync_status === "pending_sync") {
        await storage.remove(PENDING_SHIFT_START_KEY);
        await storage.remove(ACTIVE_SHIFT_ID_KEY);
        setActiveShift(null);
        setActiveShiftId("");
        setClosingCash("");
        setShiftSuccess("تم إغلاق الوردية المحلية بنجاح.");
        return;
      }
      await closeShift({
        shiftId: activeShiftId,
        closingCash: Number(closeValue).toFixed(2),
        closedAt: new Date().toISOString(),
      });
      await storage.remove(ACTIVE_SHIFT_ID_KEY);
      setActiveShift(null);
      setActiveShiftId("");
      setClosingCash("");
      setShiftSuccess("تم إغلاق الوردية بنجاح.");
    } catch (error) {
      setShiftError(extractErrorMessage(error, "تعذر إغلاق الوردية الحالية."));
    } finally {
      setClosingShift(false);
    }
  };

  const updateCheck = (type: string, status: DeviceCheckStatus, details?: Record<string, unknown>) => {
    setChecks((current) => {
      const now = new Date().toISOString();
      const next = current.filter((c) => c.type !== type);
      next.unshift({ type, status, details, at: now });
      return dedupeChecks(next);
    });
  };

  const handleTestReceipt = async () => {
    try {
      await testReceiptPrint();
      setReceiptStatus("pass");
      updateCheck("receipt_printer", "pass");
    } catch {
      setReceiptStatus("fail");
      updateCheck("receipt_printer", "fail", { message: "تعذر طباعة الاختبار" });
    }
  };

  const handleOpenDrawer = async () => {
    try {
      await openCashDrawer();
      setDrawerStatus("pass");
      updateCheck("cash_drawer", "pass");
    } catch {
      setDrawerStatus("fail");
      updateCheck("cash_drawer", "fail", { message: "تعذر فتح درج الكاش" });
    }
  };

  const handleStartWork = async () => {
    if (!branchId || !deviceId || !activeShiftId) {
      setDeviceCheckError("تعذر بدء العمل بدون وردية فعالة.");
      return;
    }
    const checksPayload = dedupeChecks([
      { type: "network", status: networkStatus === "idle" ? "warn" : networkStatus, details: {} },
      { type: "sync_status", status: syncStatus ? "pass" : "warn", details: syncStatus ?? {} },
      { type: "receipt_printer", status: receiptStatus === "idle" ? "warn" : receiptStatus, details: {} },
      { type: "cash_drawer", status: drawerStatus === "idle" ? "warn" : drawerStatus, details: {} },
      ...checks,
    ]);
    try {
      await createDeviceChecks({
        branchId,
        deviceId,
        shiftId: activeShiftId,
        checks: checksPayload.map((check) => ({
          type: check.type,
          status: check.status === "idle" ? "warn" : check.status,
          details: check.details ?? {},
        })),
      });
      await storage.setString(DEVICE_CHECKS_CACHE_KEY, JSON.stringify(checksPayload));
    } catch {
      await storage.setString(DEVICE_CHECKS_CACHE_KEY, JSON.stringify(checksPayload));
      setDeviceCheckError("تعذر حفظ نتائج الفحص، وتم حفظها محليًا.");
    }
    navigation.navigate("PosCashierSales");
  };

  const currentBranchLabel = useMemo(() => {
    const branch = branches.find((b) => b.id === branchId);
    return branch ? `${branch.name} (${branch.code})` : "غير محدد";
  }, [branches, branchId]);

  const currentDeviceLabel = deviceId ? deviceId : "غير محدد";

  if (loadingContext) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={THEME.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>

      <View style={styles.stepsRow}>
        {[1, 2, 3].map((idx) => (
          <View key={idx} style={[styles.stepBubble, step >= idx && styles.stepBubbleActive]}>
            <Text style={[styles.stepText, step >= idx && styles.stepTextActive]}>{idx}</Text>
          </View>
        ))}
      </View>

      {step === 1 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الخطوة 1: تسجيل الدخول</Text>
          <Text style={styles.meta}>الفرع الحالي: {currentBranchLabel}</Text>
          <Text style={styles.meta}>الجهاز الحالي: {currentDeviceLabel}</Text>

          <Pressable style={styles.linkButton} onPress={() => setShowDevicePicker((prev) => !prev)}>
            <Text style={styles.linkText}>{showDevicePicker ? "إخفاء تغيير الجهاز" : "تغيير الجهاز/الفرع"}</Text>
          </Pressable>

          {showDevicePicker ? (
            <View style={styles.devicePicker}>
              <Text style={styles.sectionLabel}>اختر الفرع</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {branches.map((branch) => (
                  <Pressable
                    key={branch.id}
                    style={[styles.chip, selectedBranchId === branch.id && styles.chipActive]}
                    onPress={() => {
                      setSelectedBranchId(branch.id);
                      setRequiresOpeningCash(Boolean(branch.requires_opening_cash));
                    }}
                  >
                    <Text style={[styles.chipText, selectedBranchId === branch.id && styles.chipTextActive]}>
                      {branch.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.sectionLabel}>اختر الجهاز</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {devices.map((device) => (
                  <Pressable
                    key={device.device_id}
                    style={[styles.chip, selectedDeviceId === device.device_id && styles.chipActive]}
                    onPress={() => setSelectedDeviceId(device.device_id)}
                  >
                    <Text style={[styles.chipText, selectedDeviceId === device.device_id && styles.chipTextActive]}>
                      {device.display_name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                value={selectedDeviceId}
                onChangeText={setSelectedDeviceId}
                placeholder="معرف الجهاز"
                style={styles.input}
              />
              <TextInput
                value={deviceName}
                onChangeText={setDeviceName}
                placeholder="اسم الجهاز"
                style={styles.input}
              />
              <Pressable style={styles.primaryButton} onPress={handleSelectDevice}>
                <Text style={styles.primaryButtonText}>حفظ الجهاز</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.row}>
            <Pressable
              style={[styles.chip, loginMode === "pin" && styles.chipActive]}
              onPress={() => setLoginMode("pin")}
            >
              <Text style={[styles.chipText, loginMode === "pin" && styles.chipTextActive]}>رمز الدخول</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, loginMode === "password" && styles.chipActive]}
              onPress={() => setLoginMode("password")}
            >
              <Text style={[styles.chipText, loginMode === "password" && styles.chipTextActive]}>كلمة المرور</Text>
            </Pressable>
          </View>

          {!isAuthenticated ? (
            <TextInput value={username} onChangeText={setUsername} placeholder="اسم المستخدم" style={styles.input} />
          ) : (
            <Text style={styles.meta}>المستخدم الحالي: {user?.username ?? "-"}</Text>
          )}

          {loginMode === "pin" ? (
            <TextInput value={pin} onChangeText={setPin} placeholder="أدخل رمز الدخول" style={styles.input} secureTextEntry />
          ) : (
            <TextInput value={password} onChangeText={setPassword} placeholder="أدخل كلمة المرور" style={styles.input} secureTextEntry />
          )}

          {loginError ? <Text style={styles.error}>{loginError}</Text> : null}

          <Pressable style={styles.primaryButton} onPress={handleLogin}>
            <Text style={styles.primaryButtonText}>{isAuthenticated ? "متابعة" : "تسجيل الدخول"}</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الخطوة 2: فتح وردية</Text>
          {loadingShift ? <ActivityIndicator size="small" color={THEME.primary} /> : null}
          {shiftError ? <Text style={styles.error}>{shiftError}</Text> : null}
          {shiftSuccess ? <Text style={styles.success}>{shiftSuccess}</Text> : null}
          {activeShift ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>وردية مفتوحة بالفعل</Text>
              <Text style={styles.meta}>رقم الوردية: {toNumericShiftId(activeShift.numeric_id ?? activeShift.id)}</Text>
              <Text style={styles.meta}>الافتتاح: {activeShift.opening_cash}</Text>
              <Text style={styles.meta}>بواسطة: {activeShift.username}</Text>
              <Text style={styles.meta}>وقت فتح الوردية : {formatDateTime(activeShift.opened_at_local ?? activeShift.opened_at)}</Text>
              <Text style={styles.meta}>المزامنة: {syncStatusLabel(activeShift.sync_status)}</Text>
              <TextInput
                value={closingCash}
                onChangeText={setClosingCash}
                placeholder="رصيد الإغلاق"
                keyboardType="numeric"
                style={styles.input}
              />
              <Pressable style={[styles.secondaryButton, closingShift && styles.disabledButton]} onPress={handleCloseOwnShift}>
                <Text style={styles.secondaryButtonText}>{closingShift ? "جارٍ الإغلاق..." : "إغلاق ورديتي"}</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => setStep(3)}>
                <Text style={styles.primaryButtonText}>متابعة</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>رصيد الافتتاح</Text>
              <TextInput
                value={openingCash}
                onChangeText={setOpeningCash}
                placeholder={requiresOpeningCash ? "مطلوب" : "اختياري"}
                keyboardType="numeric"
                style={styles.input}
              />
              <Pressable style={styles.primaryButton} onPress={handleOpenShift}>
                <Text style={styles.primaryButtonText}>فتح وردية</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الخطوة 3: فحص الأجهزة</Text>
          <DeviceStatusPanel networkStatus={networkStatus} syncStatus={syncStatus} />

          <View style={styles.row}>
            <Pressable style={styles.secondaryButton} onPress={handleTestReceipt}>
              <Text style={styles.secondaryButtonText}>اختبار طباعة الإيصال</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleOpenDrawer}>
              <Text style={styles.secondaryButtonText}>فتح درج الكاش</Text>
            </Pressable>
          </View>

          <View style={styles.checksList}>
            {checks.length === 0 ? <Text style={styles.meta}>لا توجد نتائج فحص مسجلة.</Text> : null}
            {checks.map((check, index) => (
              <View key={`${check.type}-${index}`} style={styles.checkRow}>
                <Text style={styles.checkText}>{toCheckLabel(check.type)}</Text>
                <StatusBadge status={check.status} />
                <Text style={styles.meta}>{formatDateTime(check.at)}</Text>
              </View>
            ))}
          </View>

          {deviceCheckError ? <Text style={styles.warn}>{deviceCheckError}</Text> : null}

          <Pressable style={styles.primaryButton} onPress={handleStartWork}>
            <Text style={styles.primaryButtonText}>بدء العمل</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function DeviceStatusPanel({
  networkStatus,
  syncStatus,
}: {
  networkStatus: DeviceCheckStatus;
  syncStatus: { last_sync: string | null; pending_idempotency: number; mapped_orders: number } | null;
}) {
  return (
    <View style={styles.statusPanel}>
      <View style={styles.checkRow}>
        <Text style={styles.checkText}>الشبكة</Text>
        <StatusBadge status={networkStatus} />
      </View>
      <View style={styles.checkRow}>
        <Text style={styles.checkText}>آخر مزامنة</Text>
        <Text style={styles.meta}>{formatDateTime(syncStatus?.last_sync)}</Text>
      </View>
      <View style={styles.checkRow}>
        <Text style={styles.checkText}>عمليات معلقة</Text>
        <Text style={styles.meta}>{syncStatus?.pending_idempotency ?? "-"}</Text>
      </View>
      <View style={styles.checkRow}>
        <Text style={styles.checkText}>طلبات مرصودة</Text>
        <Text style={styles.meta}>{syncStatus?.mapped_orders ?? "-"}</Text>
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: DeviceCheckStatus }) {
  const style = status === "pass" ? styles.badgePass : status === "fail" ? styles.badgeFail : styles.badgeWarn;
  const label = status === "pass" ? "ناجح" : status === "fail" ? "فشل" : "تحذير";
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function toCheckLabel(type: string) {
  const labels: Record<string, string> = {
    network: "الشبكة",
    sync_status: "حالة المزامنة",
    receipt_printer: "طابعة الإيصال",
    cash_drawer: "درج الكاش",
  };
  return labels[type] ?? type;
}

function syncStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    pending_sync: "بانتظار المزامنة",
    synced: "تمت",
    failed: "فشلت",
  };
  if (!status) return "تمت";
  return labels[status] ?? status;
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "900", textAlign: "right", color: THEME.text },
  stepsRow: { flexDirection: "row", gap: 8, justifyContent: "center" },
  stepBubble: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: THEME.border, alignItems: "center", justifyContent: "center" },
  stepBubbleActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  stepText: { color: THEME.text, fontWeight: "800" },
  stepTextActive: { color: "#fff" },
  card: { backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.border, borderRadius: 12, padding: 12, gap: 10 },
  sectionTitle: { fontWeight: "900", color: THEME.text, textAlign: "right" },
  sectionLabel: { fontWeight: "800", color: THEME.text, textAlign: "right" },
  meta: { color: THEME.muted, textAlign: "right" },
  error: { color: THEME.danger, fontWeight: "800", textAlign: "right" },
  success: { color: THEME.success, fontWeight: "800", textAlign: "right" },
  warn: { color: THEME.warn, fontWeight: "800", textAlign: "right" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  input: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, minHeight: 40, paddingHorizontal: 10, textAlign: "right" },
  primaryButton: { backgroundColor: THEME.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  secondaryButton: { borderWidth: 1, borderColor: THEME.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" },
  disabledButton: { opacity: 0.6 },
  secondaryButtonText: { color: THEME.primary, fontWeight: "800" },
  linkButton: { alignSelf: "flex-start" },
  linkText: { color: THEME.primary, fontWeight: "800" },
  devicePicker: { gap: 8, borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 10, backgroundColor: "#F9FAFB" },
  chip: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { color: THEME.text, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  summaryCard: { borderWidth: 1, borderColor: "#D1FAE5", backgroundColor: "#ECFDF3", borderRadius: 10, padding: 10, gap: 6 },
  summaryTitle: { fontWeight: "800", color: THEME.success, textAlign: "right" },
  statusPanel: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 10, gap: 6 },
  checkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  checkText: { fontWeight: "700", color: THEME.text, textAlign: "right" },
  checksList: { gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: "#fff", fontWeight: "800" },
  badgePass: { backgroundColor: THEME.success },
  badgeFail: { backgroundColor: THEME.danger },
  badgeWarn: { backgroundColor: THEME.warn },
});
