import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import {
  FlatList,
  I18nManager,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import axios from "axios";

import { useAuth } from "../../../auth";
import { listCustomerAddresses } from "../../../sales/api/customersApi";
import { createPosOrder } from "../../../sales/api/posOrdersApi";
import type {
  ErpCouponDto,
  ErpOfferDto,
  ItemDto,
  OrderChannelCode,
  PosAddress,
  PosConfigResponse,
  PosCustomer,
} from "../../../sales/model/posTypes";
import { ENV } from "../../../../app/config/env";
import { usePosOpsBootstrap } from "../../model/usePosOpsBootstrap";
import {
  ACTIVE_SHIFT_ID_KEY,
  DEVICE_ID_KEY,
  POS_CASHIER_DRAFT_KEY_PREFIX,
} from "../../../../shared/constants/keys";
import { timedOperation } from "../../../../shared/lib/perfMetrics";
import { storage } from "../../../../shared/lib/storage";
import { fetchPosConfig } from "../../api/opsApi";
import { BRAND_COLORS } from "../../../../shared/theme/brand";
import { useNotification } from "../../../../shared/notifications";
import { useAppTheme, type AppThemePalette } from "../../../../shared/theme";
import { enqueueCreateOrder, flushOutbox, getOutboxCount } from "../lib/outbox";
import {
  addPayment,
  cancelOrder,
  fetchCashierOrders,
  fetchOrderDetail,
  holdOrder,
  listPayments,
  printReceipt,
  resumeOrder,
  submitOrder,
  updateOrder,
} from "../api/cashierApi";
import { usePosRealtimeConfig, type PosRealtimeMessage } from "../lib/usePosRealtimeConfig";
import { CartPanel } from "./components/CartPanel";
import { OrderSummary } from "./components/OrderSummary";
import type { CashierOrderDetail, CashierOrderListItem, CashierPayment } from "../model/types";

type SelectedModifier = {
  groupId: string;
  itemId: string;
  name: string;
  priceDelta: number;
};

type CartLine = {
  lineId: string;
  item: ItemDto;
  qty: number;
  unitPrice: number;
  modifiers: SelectedModifier[];
  notes: string;
};

type PersistedCashierDraft = {
  version: 1;
  selectedChannel: OrderChannelCode;
  selectedCategoryId: string | null;
  selectedFloorId: string | null;
  selectedTableId: string | null;
  seatsCount: number;
  selectedCustomerId: string | null;
  selectedAddressId: string | null;
  deliveryPhone?: string;
  orderNotes: string;
  couponInput?: string;
  appliedCouponCode?: string | null;
  appliedOfferId?: string | null;
  windowType: "internal" | "car";
  cart: CartLine[];
  preorderDate?: string | null;
  preorderDestination?: "pickup" | "delivery";
};

type PromotionChoice =
  | { source: "coupon"; coupon: ErpCouponDto }
  | { source: "offer"; offer: ErpOfferDto }
  | null;

type SplitPaymentLine = {
  id: string;
  payerName: string;
  method: "cash" | "card" | "wallet";
  amount: string;
  referenceNo: string;
};

type MenuViewMode = "cards" | "list";
type MenuDensity = "compact" | "comfortable";

type PersistedCashierMenuPrefs = {
  version: 1;
  viewMode: MenuViewMode;
  density: MenuDensity;
  manualColumns: number | null;
};

function normalizeArabicLabel(value: string) {
  return (value || "").trim().toLowerCase();
}

function buildDefaultRequiredSingleSelectModifiers(
  modifierGroups: PosConfigResponse["modifiers"],
  selected: SelectedModifier[],
): SelectedModifier[] {
  const result = [...selected];
  for (const group of modifierGroups) {
    const minRequired = group.required ? Math.max(group.min_select || 1, 1) : group.min_select || 0;
    if (minRequired <= 0 || group.max_select !== 1) continue;
    const hasSelection = result.some((mod) => mod.groupId === group.id);
    if (hasSelection || !group.items.length) continue;

    const groupName = normalizeArabicLabel(group.name);
    const sizeLikeGroup = groupName.includes("حجم");
    const preferred = sizeLikeGroup
      ? group.items.find((item) => normalizeArabicLabel(item.name).includes("صغير")) ?? group.items[0]
      : group.items[0];

    result.push({
      groupId: group.id,
      itemId: preferred.id,
      name: localizeUiText(preferred.name),
      priceDelta: toNumber(preferred.price_delta),
    });
  }
  return result;
}

const THEME = {
  bg: BRAND_COLORS.bg,
  card: BRAND_COLORS.card,
  primary: BRAND_COLORS.primaryBlue,
  accent: BRAND_COLORS.accentOrange,
  text: BRAND_COLORS.textMain,
  muted: BRAND_COLORS.textSub,
  border: BRAND_COLORS.border,
  danger: BRAND_COLORS.danger,
  success: BRAND_COLORS.success,
  warning: BRAND_COLORS.warning,
};

const CHANNEL_LABELS: Partial<Record<OrderChannelCode, string>> = {
  dine_in: "داخل المطعم",
  takeaway: "سفري",
  pickup: "استلام",
  delivery: "توصيل",
  preorder: "طلب مسبق",
};

const PAYMENT_METHOD_LABELS: Record<"cash" | "card" | "wallet", string> = {
  cash: "نقدي",
  card: "بطاقة",
  wallet: "محفظة",
};

const UI_TEXT_AR_MAP: Record<string, string> = {
  delivery: "توصيل",
  "dine-in": "داخل المطعم",
  dinein: "داخل المطعم",
  pickup: "استلام",
  "pre-order": "طلب مسبق",
  preorder: "طلب مسبق",
  takeaway: "سفري",
  "main hall": "الصالة الرئيسية",
  small: "صغير",
  medium: "وسط",
  large: "كبير",
  extras: "إضافات",
  "extra cheese": "جبنة إضافية",
  "extra sauce": "صوص إضافي",
  "no onion": "بدون بصل",
};

const EXCISE_CATEGORY_AR: Record<string, string> = {
  carbonated_drinks: "المشروبات الغازية",
  sweetened_drinks: "المشروبات المحلاة",
  energy_drinks: "مشروبات الطاقة",
  tobacco_products: "منتجات التبغ",
  shisha: "الشيشة",
};

const POS_CASHIER_MENU_PREFS_KEY_PREFIX = "pos_cashier_menu_prefs_v1";
const ALL_CATEGORY_ID = "__all__";
const CATEGORY_COLOR_PALETTE = ["#0EA5E9", "#F97316", "#22C55E", "#A855F7", "#EAB308", "#14B8A6", "#EF4444", "#6366F1", "#84CC16", "#EC4899"];

const localizeUiText = (value: string) => {
  const text = (value || "").trim();
  if (!text) return value;
  const direct = UI_TEXT_AR_MAP[text.toLowerCase()];
  if (direct) return direct;

  const matchWithPrice = text.match(/^(.+?)\s*\+(\d+(?:\.\d+)?)$/i);
  if (matchWithPrice) {
    const namePart = matchWithPrice[1]?.trim().toLowerCase();
    const pricePart = Number(matchWithPrice[2] ?? 0).toFixed(2);
    const mapped = namePart ? UI_TEXT_AR_MAP[namePart] : undefined;
    if (mapped) return `${mapped} +${pricePart}`;
  }

  return text;
};

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
const money = (value: number) => value.toFixed(2);
const toNumber = (value: string | number | null | undefined) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};
const toNumberFromUnknown = (value: unknown) =>
  typeof value === "number" || typeof value === "string" ? toNumber(value) : 0;
const toStringFromUnknown = (value: unknown, fallback: string) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
};
const toBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return undefined;
};

const normalizeConfigToken = (value: string) =>
  normalizeArabicLabel(value)
    .replace(/[أإآ]/g, "ا")
    .replace(/[\s_-]+/g, "");

const AFTER_MEAL_PAYMENT_TOKENS = new Set([
  "aftermeal",
  "aftereating",
  "postpaid",
  "paylater",
  "deferred",
  "later",
  "بعدالاكل",
  "بعدالطعام",
  "اجل",
  "مؤجل",
  "دفعمؤجل",
]);

const isAfterMealPaymentSetting = (value: unknown) => {
  if (typeof value !== "string") return false;
  return AFTER_MEAL_PAYMENT_TOKENS.has(normalizeConfigToken(value));
};
const isPaymentTimingKey = (key: string) => {
  const token = normalizeConfigToken(key);
  return (
    token.includes("payment") ||
    token.includes("pay") ||
    token.includes("settlement") ||
    token.includes("billing") ||
    token.includes("timing") ||
    token.includes("mode") ||
    token.includes("policy") ||
    token.includes("دفع") ||
    token.includes("توقيت")
  );
};

const normalizePhone = (value: string) => (value || "").replace(/\D/g, "");
const normalizeCouponCode = (value: string) => (value || "").trim().toUpperCase();

const calculatePromotionDiscount = (
  promo: PromotionChoice,
  subtotal: number,
): { discount: number; error: string | null } => {
  if (!promo) return { discount: 0, error: null };

  const minOrder = toNumber(promo.source === "coupon" ? promo.coupon.min_order_amount : promo.offer.min_order_amount);
  if (subtotal < minOrder) {
    return {
      discount: 0,
      error: `الحد الأدنى لتفعيل ${promo.source === "coupon" ? "الكوبون" : "العرض"} هو ${money(minOrder)}.`,
    };
  }

  const discountType = promo.source === "coupon" ? promo.coupon.discount_type : promo.offer.discount_type;
  const discountValue = toNumber(promo.source === "coupon" ? promo.coupon.discount_value : promo.offer.discount_value);
  const maxDiscount = toNumber(promo.source === "coupon" ? promo.coupon.max_discount_amount : promo.offer.max_discount_amount);

  let discount = discountType === "percent" ? (subtotal * discountValue) / 100 : discountValue;
  if (maxDiscount > 0) discount = Math.min(discount, maxDiscount);
  discount = Math.min(discount, subtotal);
  return { discount: Math.max(0, discount), error: null };
};

const blurActiveElementOnWeb = () => {
  if (Platform.OS !== "web") return;
  const active = document.activeElement as HTMLElement | null;
  active?.blur?.();
};

const mapCancelErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "تعذر حذف الطلب المعلق.";
  const data = error.response?.data as
    | string
    | { detail?: string; non_field_errors?: string[]; reason?: string[]; manager_pin?: string[] }
    | undefined;

  const raw =
    (typeof data === "string" ? data : undefined) ||
    (typeof data === "object" && data ? data.detail : undefined) ||
    (typeof data === "object" && data?.non_field_errors?.[0]) ||
    (typeof data === "object" && data?.reason?.[0]) ||
    (typeof data === "object" && data?.manager_pin?.[0]) ||
    "";

  const normalized = String(raw).toLowerCase();
  if (normalized.includes("invalid manager pin")) return "رمز المدير غير صحيح.";
  if (normalized.includes("manager_pin is required")) return "رمز المدير مطلوب لإلغاء الطلب.";
  if (normalized.includes("reason is required")) return "سبب الإلغاء مطلوب.";
  if (normalized.includes("only draft orders")) return "لا يمكن إلغاء إلا طلبات المسودة.";
  if (normalized.includes("permission") || normalized.includes("not authorized")) return "لا تملك صلاحية إلغاء هذا الطلب.";

  return raw ? `تعذر حذف الطلب المعلق: ${raw}` : "تعذر حذف الطلب المعلق.";
};

const mapOrderCreateErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "تعذر إرسال الطلب. تحقق من الشبكة وحاول مرة أخرى.";
  const data = error.response?.data as
    | string
    | {
        detail?: string;
        non_field_errors?: string[];
        items?: string[];
        table_id?: string[];
        customer_phone?: string[];
      }
    | undefined;

  const raw =
    (typeof data === "string" ? data : undefined) ||
    (typeof data === "object" && data ? data.detail : undefined) ||
    (typeof data === "object" && data?.non_field_errors?.[0]) ||
    (typeof data === "object" && data?.items?.[0]) ||
    (typeof data === "object" && data?.table_id?.[0]) ||
    (typeof data === "object" && data?.customer_phone?.[0]) ||
    "";

  const normalized = String(raw).toLowerCase();
  if (!normalized) return "تعذر إرسال الطلب. راجع بيانات الطلب وحاول مرة أخرى.";
  if (normalized.includes("open shift is required")) return "لا يمكن تنفيذ الطلب قبل فتح الوردية على هذا الجهاز.";
  if (normalized.includes("invalid branch_id")) return "الفرع غير صالح.";
  if (normalized.includes("invalid device")) return "الجهاز غير صالح لهذا الفرع.";
  if (normalized.includes("invalid channel")) return "قناة الطلب غير صالحة.";
  if (normalized.includes("missing channel config")) return "إعدادات القناة غير مكتملة لهذا الفرع.";
  if (normalized.includes("selected channel is disabled")) return "القناة المختارة غير مفعلة لاستقبال طلبات جديدة.";
  if (normalized.includes("dine-in orders require table_id")) return "طلبات داخل المطعم تتطلب اختيار طاولة.";
  if (normalized.includes("table_id is allowed only for dine-in")) return "لا يمكن إرفاق طاولة إلا لطلبات داخل المطعم.";
  if (normalized.includes("takeaway and pickup orders cannot include table_id")) return "الطلبات السفري/الاستلام لا يمكن أن تحتوي على طاولة.";
  if (normalized.includes("delivery orders require customer_phone")) return "طلبات التوصيل تتطلب رقم هاتف.";
  if (normalized.includes("delivery orders require customer")) return "طلبات التوصيل تتطلب عميلًا أو رقم هاتف صحيحًا.";
  if (normalized.includes("invalid table_id")) return "الطاولة المختارة غير صالحة.";
  if (normalized.includes("invalid customer_id")) return "العميل المختار غير صالح.";
  if (normalized.includes("invalid address_id")) return "العنوان المختار غير صالح.";
  if (normalized.includes("quantity must be > 0")) return "كمية أحد الأصناف غير صحيحة.";
  if (normalized.includes("orders require items")) return "يجب إضافة أصناف في الطلب.";

  return `تعذر إرسال الطلب: ${raw}`;
};

const mapPaymentErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) return "تعذر تسجيل الدفعة الآن.";
  const data = error.response?.data as
    | string
    | {
        detail?: string;
        non_field_errors?: string[];
        amount?: string[];
        method?: string[];
      }
    | undefined;

  const raw =
    (typeof data === "string" ? data : undefined) ||
    (typeof data === "object" && data ? data.detail : undefined) ||
    (typeof data === "object" && data?.non_field_errors?.[0]) ||
    (typeof data === "object" && data?.amount?.[0]) ||
    (typeof data === "object" && data?.method?.[0]) ||
    "";

  const normalized = String(raw).toLowerCase();
  if (normalized.includes("open shift is required")) return "يجب فتح وردية نشطة قبل تحصيل المدفوعات.";
  if (normalized.includes("current shift")) return "لا يمكن تحصيل طلب من وردية مختلفة.";
  if (normalized.includes("invalid payment method")) return "طريقة الدفع غير صالحة.";
  if (normalized.includes("amount") && normalized.includes("greater")) return "قيمة الدفعة يجب أن تكون أكبر من صفر.";

  return raw ? `تعذر تسجيل الدفعة: ${raw}` : "تعذر تسجيل الدفعة الآن.";
};

const mapConfigToItems = (config: PosConfigResponse | null): ItemDto[] => {
  if (!config) return [];
  return config.menu_items.map((item) => ({
    item_id: item.id,
    subsidiary: null,
    category: item.category,
    uom: null,
    item_code: item.code,
    item_name: localizeUiText(item.name),
    barcode: null,
    description: "",
    is_taxable: true,
    created_at: null,
    price: item.base_price,
    excise_category: item.excise_category ?? null,
    excise_rate_percent: item.excise_rate_percent ?? "0.00",
  }));
};

export function SalesPosPage() {
  const { user, signOut } = useAuth();
  const notify = useNotification();
  const { theme } = useAppTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { loading, error, branchId, config, customers: bootstrapCustomers } = usePosOpsBootstrap();
  const { width } = useWindowDimensions();
  const isRtlLayout = I18nManager.isRTL;
  const [contentWidth, setContentWidth] = useState(0);
  const availableWidth = contentWidth > 0 ? contentWidth : width;
  const isCompact = availableWidth < 1000;

  const [deviceId, setDeviceId] = useState("");
  const [activeShiftId, setActiveShiftId] = useState("");
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [liveConfig, setLiveConfig] = useState<PosConfigResponse | null>(null);
  const [refreshingConfig, setRefreshingConfig] = useState(false);

  const [selectedChannel, setSelectedChannel] = useState<OrderChannelCode>("dine_in");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [menuViewMode, setMenuViewMode] = useState<MenuViewMode>("cards");
  const [menuDensity, setMenuDensity] = useState<MenuDensity>("comfortable");
  const [menuColumnsOverride, setMenuColumnsOverride] = useState<number | null>(null);
  const [rushMode, setRushMode] = useState(false);
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const hasRestoredDraftRef = useRef(false);
  const hasRestoredMenuPrefsRef = useRef(false);
  const lastRealtimeRefreshAtRef = useRef(0);

  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [seatsCount, setSeatsCount] = useState(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<PosAddress[]>([]);
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [appliedOfferId, setAppliedOfferId] = useState<string | null>(null);
  const [windowType, setWindowType] = useState<"internal" | "car">("internal");
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [modifierLineId, setModifierLineId] = useState<string | null>(null);
  const [modifierDraft, setModifierDraft] = useState<SelectedModifier[]>([]);
  const [modifierNotes, setModifierNotes] = useState("");
  const [modifierError, setModifierError] = useState("");
  const [quickAddItem, setQuickAddItem] = useState<ItemDto | null>(null);
  const [quickAddModifiers, setQuickAddModifiers] = useState<SelectedModifier[]>([]);
  const [quickAddNotes, setQuickAddNotes] = useState("");
  const [quickAddError, setQuickAddError] = useState("");
  const [saleDrawerOpen, setSaleDrawerOpen] = useState(false);
  const [saleActionLoading, setSaleActionLoading] = useState(false);
  // preorder scheduling state
  const [preorderDate, setPreorderDate] = useState<string | null>(null);
  const [preorderDestination, setPreorderDestination] = useState<"pickup" | "delivery">("pickup");

  const [cart, setCart] = useState<CartLine[]>([]);

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] = useState<number | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [ordersPopover, setOrdersPopover] = useState<"held" | "deferred" | null>(null);
  const [heldOrders, setHeldOrders] = useState<CashierOrderListItem[]>([]);
  const [loadingHeldOrders, setLoadingHeldOrders] = useState(false);
  const [deferredOrders, setDeferredOrders] = useState<CashierOrderListItem[]>([]);
  const [deferredRemainingByOrderId, setDeferredRemainingByOrderId] = useState<Record<string, number>>({});
  const [loadingDeferredOrders, setLoadingDeferredOrders] = useState(false);
  const [deferredPaymentOpen, setDeferredPaymentOpen] = useState(false);
  const [deferredPaymentOrderId, setDeferredPaymentOrderId] = useState<string | null>(null);
  const [deferredPaymentOrder, setDeferredPaymentOrder] = useState<CashierOrderListItem | null>(null);
  const [deferredPaymentDetail, setDeferredPaymentDetail] = useState<CashierOrderDetail | null>(null);
  const [deferredPaymentHistory, setDeferredPaymentHistory] = useState<CashierPayment[]>([]);
  const [deferredPaymentLoading, setDeferredPaymentLoading] = useState(false);
  const [deferredPaymentSubmitting, setDeferredPaymentSubmitting] = useState(false);
  const [deferredPaymentMethod, setDeferredPaymentMethod] = useState<"cash" | "card" | "wallet">("cash");
  const [deferredPaymentAmount, setDeferredPaymentAmount] = useState("");
  const [deferredPaymentReference, setDeferredPaymentReference] = useState("");
  const [deferredPaymentError, setDeferredPaymentError] = useState("");
  const [splitPaymentLines, setSplitPaymentLines] = useState<SplitPaymentLine[]>([]);
  const [splitCountInput, setSplitCountInput] = useState("2");
  const deferredPaymentRequestIdRef = useRef(0);
  const [deleteHeldOrderId, setDeleteHeldOrderId] = useState<string | null>(null);
  const [deleteHeldReason, setDeleteHeldReason] = useState("");
  const [deleteHeldManagerPin, setDeleteHeldManagerPin] = useState("");

  const effectiveConfig = liveConfig ?? config;
  const items = useMemo(() => mapConfigToItems(effectiveConfig), [effectiveConfig]);
  const categories = useMemo(
    () => (effectiveConfig?.menu_categories ?? []).map((cat) => ({ ...cat, name: localizeUiText(cat.name) })),
    [effectiveConfig?.menu_categories],
  );
  const categoryColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (let index = 0; index < categories.length; index += 1) {
      map[categories[index].id] = CATEGORY_COLOR_PALETTE[index % CATEGORY_COLOR_PALETTE.length];
    }
    return map;
  }, [categories]);
  const floors = useMemo(
    () => (effectiveConfig?.floors ?? []).map((floor) => ({ ...floor, name: localizeUiText(floor.name) })),
    [effectiveConfig?.floors],
  );
  const tables = effectiveConfig?.tables ?? [];
  const channelConfigs = effectiveConfig?.channel_configs ?? [];
  const availableOffers = effectiveConfig?.offers ?? [];
  const availableCoupons = effectiveConfig?.coupons ?? [];
  const uiToggles = effectiveConfig?.ui_toggles ?? {};
  const readUiToggle = useCallback(
    (keys: string[], fallback: boolean) => {
      for (const key of keys) {
        const parsed = toBooleanOrUndefined(uiToggles[key]);
        if (parsed !== undefined) return parsed;
      }
      return fallback;
    },
    [uiToggles],
  );
  const readUiNumber = useCallback(
    (keys: string[]): number | null => {
      for (const key of keys) {
        const rawValue = uiToggles[key];
        if (rawValue === undefined || rawValue === null || rawValue === "") continue;
        const parsed = toNumberFromUnknown(rawValue);
        if (!Number.isFinite(parsed)) continue;
        return Math.max(0, parsed);
      }
      return null;
    },
    [uiToggles],
  );
  const modifiers = useMemo(
    () =>
      (effectiveConfig?.modifiers ?? []).map((group) => ({
        ...group,
        name: localizeUiText(group.name),
        items: group.items.map((item) => ({ ...item, name: localizeUiText(item.name) })),
      })),
    [effectiveConfig?.modifiers],
  );
  const selectedOffer = useMemo(
    () => availableOffers.find((offer) => offer.id === appliedOfferId) ?? null,
    [availableOffers, appliedOfferId],
  );
  const selectedCoupon = useMemo(
    () => availableCoupons.find((coupon) => normalizeCouponCode(coupon.code) === normalizeCouponCode(appliedCouponCode || "")) ?? null,
    [availableCoupons, appliedCouponCode],
  );
  const appliedPromotion = useMemo<PromotionChoice>(() => {
    if (selectedCoupon) return { source: "coupon", coupon: selectedCoupon };
    if (selectedOffer) return { source: "offer", offer: selectedOffer };
    return null;
  }, [selectedCoupon, selectedOffer]);
  const channels = useMemo(
    () =>
      (effectiveConfig?.channels ?? []).map((channel) => ({
        ...channel,
        display_name: CHANNEL_LABELS[channel.code] ?? localizeUiText(channel.display_name),
      })),
    [effectiveConfig?.channels],
  );
  const canUseTableSelection = readUiToggle(["show_tables", "enable_tables", "table_selection_enabled"], true);
  const canShowDeliveryPhone = readUiToggle(["show_delivery_phone", "enable_delivery_phone"], true);
  const canShowOrderNotes = readUiToggle(["show_order_notes", "enable_order_notes"], true);
  const canUseHold = readUiToggle(["show_hold", "enable_hold", "hold_enabled"], true);
  const canUseSend = readUiToggle(["show_send_kitchen", "enable_send_kitchen", "send_to_kitchen_enabled"], true);
  const canUsePrint = readUiToggle(["show_print", "enable_print", "print_enabled"], true);
  const canUsePay = readUiToggle(["show_pay", "enable_pay", "pay_enabled"], true);
  const canShowHeldSheet = readUiToggle(
    ["show_held_orders", "enable_held_orders", "show_held_sheet", "enable_held_sheet", "show_suspended_orders"],
    false,
  );
  const canShowDeferredSheet = readUiToggle(
    ["show_deferred_orders", "enable_deferred_orders", "show_deferred_sheet", "enable_deferred_sheet", "show_unpaid_orders"],
    true,
  );
  const hasOrdersPopoverToggle = canShowHeldSheet || canShowDeferredSheet;
  const openHeldPopover = useCallback(() => {
    setOrdersPopover((current) => (current === "held" ? null : "held"));
  }, []);
  const openDeferredPopover = useCallback(() => {
    setOrdersPopover((current) => (current === "deferred" ? null : "deferred"));
  }, []);
  const closeOrdersPopover = useCallback(() => {
    setOrdersPopover(null);
  }, []);
  const canApplyServiceCharge = readUiToggle(
    ["enable_service_charge", "show_service_charge", "service_charge_enabled"],
    true,
  );
  const serviceChargePercentOverride = readUiNumber([
    "service_charge_percent",
    "service_charge_rate_percent",
    "service_percent",
  ]);
  const deliveryFeeAmount = readUiNumber([
    "delivery_fee_amount",
    "delivery_charge_amount",
    "delivery_fee",
  ]);
  const availableChannels = useMemo(
    () =>
      channels.filter((channel) => {
        const cfg = channelConfigs.find((item) => item.channel_code === channel.code);
        if (!cfg?.is_enabled || !cfg?.allow_new_orders) return false;
        // Keep payload valid with current backend requirements.
        if (channel.code === "dine_in" && !canUseTableSelection) return false;
        if (channel.code === "delivery" && !canShowDeliveryPhone) return false;
        if (channel.code === "pickup_window") return false;
        return true;
      }),
    [channels, channelConfigs, canUseTableSelection, canShowDeliveryPhone],
  );
  const selectedChannelLabel = channels.find((c) => c.code === selectedChannel)?.display_name ?? CHANNEL_LABELS[selectedChannel] ?? selectedChannel;
  const priceLists = effectiveConfig?.price_lists ?? [];
  const taxes = effectiveConfig?.taxes ?? [];
  const serviceCharges = effectiveConfig?.service_charges ?? [];
  const customers = useMemo<PosCustomer[]>(() => bootstrapCustomers ?? [], [bootstrapCustomers]);
  const matchedDeliveryCustomer = useMemo(
    () => customers.find((c) => normalizePhone(c.phone || "") === normalizePhone(deliveryPhone)),
    [customers, deliveryPhone],
  );
  const deliveryCustomerLabel = useMemo(() => {
    if (!normalizePhone(deliveryPhone)) return "عميل مباشر";
    if (matchedDeliveryCustomer) return `${matchedDeliveryCustomer.name} - ${matchedDeliveryCustomer.phone}`;
    return "عميل مباشر";
  }, [deliveryPhone, matchedDeliveryCustomer]);

  const activeChannelConfig = useMemo(
    () => channelConfigs.find((cfg) => cfg.channel_code === selectedChannel),
    [channelConfigs, selectedChannel],
  );
  const activePriceList = useMemo(
    () => priceLists.find((pl) => pl.id === activeChannelConfig?.price_list_id),
    [priceLists, activeChannelConfig],
  );
  const activeTax = useMemo(
    () => taxes.find((tax) => tax.id === activeChannelConfig?.tax_profile_id),
    [taxes, activeChannelConfig],
  );
  const activeService = useMemo(
    () => serviceCharges.find((svc) => svc.id === activeChannelConfig?.service_charge_rule_id),
    [serviceCharges, activeChannelConfig],
  );
  const hidePayForDineInAfterMeal = useMemo(() => {
    if (selectedChannel !== "dine_in") return false;
    const availability =
      activeChannelConfig?.availability_rules && typeof activeChannelConfig.availability_rules === "object"
        ? (activeChannelConfig.availability_rules as Record<string, unknown>)
        : {};
    const paymentConfig =
      availability.payment && typeof availability.payment === "object"
        ? (availability.payment as Record<string, unknown>)
        : {};
    const settingKeys = [
      "dine_in_payment_timing",
      "dine_in_payment_mode",
      "payment_timing",
      "payment_mode",
      "payment_policy",
      "settlement_timing",
      "when_to_pay",
      "timing",
      "mode",
      "policy",
    ];
    for (const key of settingKeys) {
      if (isAfterMealPaymentSetting(availability[key])) return true;
      if (isAfterMealPaymentSetting(paymentConfig[key])) return true;
      if (isAfterMealPaymentSetting(uiToggles[key])) return true;
    }
    for (const [key, value] of Object.entries(availability)) {
      if (isPaymentTimingKey(key) && isAfterMealPaymentSetting(value)) return true;
    }
    for (const [key, value] of Object.entries(paymentConfig)) {
      if (isPaymentTimingKey(key) && isAfterMealPaymentSetting(value)) return true;
    }
    for (const [key, value] of Object.entries(uiToggles)) {
      if (isPaymentTimingKey(key) && isAfterMealPaymentSetting(value)) return true;
    }
    return false;
  }, [selectedChannel, activeChannelConfig, uiToggles]);
  const canUsePayForChannel = canUsePay && !hidePayForDineInAfterMeal;

  const taxRate = useMemo(
    () => (activeTax ? activeTax.rules.reduce((sum, rule) => sum + toNumber(rule.rate_percent), 0) : 0),
    [activeTax],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const byCategory = selectedCategoryId && selectedCategoryId !== ALL_CATEGORY_ID ? item.category === selectedCategoryId : true;
      const bySearch = query ? `${item.item_name} ${item.item_code}`.toLowerCase().includes(query) : true;
      return byCategory && bySearch;
    });
  }, [items, search, selectedCategoryId]);

  const showWindowType = selectedChannel === "pickup" || selectedChannel === "takeaway";
  const isDeliveryContext = selectedChannel === "delivery";
  const draftStorageKey = useMemo(() => {
    const username = user?.username || "anonymous";
    return `${POS_CASHIER_DRAFT_KEY_PREFIX}:${username}:${branchId}`;
  }, [user?.username, branchId]);
  const menuPrefsStorageKey = useMemo(() => {
    const username = user?.username || "anonymous";
    return `${POS_CASHIER_MENU_PREFS_KEY_PREFIX}:${username}:${branchId}`;
  }, [user?.username, branchId]);
  const autoMenuColumns = useMemo(() => {
    if (availableWidth >= 1800) return 6;
    if (availableWidth >= 1550) return 5;
    if (availableWidth >= 1300) return 4;
    if (availableWidth >= 1050) return 3;
    return 2;
  }, [availableWidth]);
  const menuColumns = useMemo(() => {
    const resolved = menuColumnsOverride ?? autoMenuColumns;
    return Math.max(2, Math.min(6, resolved));
  }, [menuColumnsOverride, autoMenuColumns]);
  const handleLayoutWidth = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setContentWidth((prev) => (Math.abs(prev - next) > 4 ? next : prev));
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase() || "";
      if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) return;
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void Promise.all([storage.getString(DEVICE_ID_KEY), storage.getString(ACTIVE_SHIFT_ID_KEY)]).then(([storedDevice, storedShift]) => {
        if (!mounted) return;
        setDeviceId(storedDevice || ENV.defaultDeviceId);
        setActiveShiftId(storedShift || "");
      });
      return () => {
        mounted = false;
      };
    }, []),
  );

  const clearPersistedDraft = useCallback(async () => {
    if (!draftStorageKey) return;
    await storage.remove(draftStorageKey);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!menuPrefsStorageKey) return;
    let mounted = true;
    hasRestoredMenuPrefsRef.current = false;
    setMenuViewMode("cards");
    setMenuDensity("comfortable");
    setMenuColumnsOverride(null);
    void storage.getString(menuPrefsStorageKey).then((raw) => {
      if (!mounted) return;
      hasRestoredMenuPrefsRef.current = true;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as PersistedCashierMenuPrefs | { version?: number; preset?: string; viewMode?: MenuViewMode; density?: MenuDensity; manualColumns?: number | null };
        if (!parsed) return;
        if (parsed.version === 2 && parsed.preset) {
          const preset = parsed.preset;
          if (preset === "list") {
            setMenuViewMode("list");
            setMenuDensity("comfortable");
            setMenuColumnsOverride(null);
            return;
          }
          if (preset === "cards_small") {
            setMenuViewMode("cards");
            setMenuDensity("compact");
            setMenuColumnsOverride(Math.min(6, autoMenuColumns + 1));
            return;
          }
          if (preset === "cards_large") {
            setMenuViewMode("cards");
            setMenuDensity("comfortable");
            setMenuColumnsOverride(Math.max(2, autoMenuColumns - 1));
            return;
          }
          setMenuViewMode("cards");
          setMenuDensity("comfortable");
          setMenuColumnsOverride(null);
          return;
        }
        if (parsed.version !== 1) return;
        setMenuViewMode(parsed.viewMode === "list" ? "list" : "cards");
        setMenuDensity(parsed.density === "compact" ? "compact" : "comfortable");
        const parsedColumns =
          parsed.manualColumns === null || parsed.manualColumns === undefined
            ? null
            : Math.max(2, Math.min(6, toNumber(parsed.manualColumns)));
        setMenuColumnsOverride(parsedColumns);
      } catch {
        // ignore invalid payload
      }
    });
    return () => {
      mounted = false;
    };
  }, [menuPrefsStorageKey, autoMenuColumns]);

  useEffect(() => {
    if (!menuPrefsStorageKey || !hasRestoredMenuPrefsRef.current) return;
    const timer = setTimeout(() => {
      const payload: PersistedCashierMenuPrefs = {
        version: 1,
        viewMode: menuViewMode,
        density: menuDensity,
        manualColumns: menuColumnsOverride,
      };
      void storage.setString(menuPrefsStorageKey, JSON.stringify(payload));
    }, 200);
    return () => clearTimeout(timer);
  }, [menuPrefsStorageKey, menuViewMode, menuDensity, menuColumnsOverride]);

  useEffect(() => {
    if (!branchId || !effectiveConfig || hasRestoredDraftRef.current) return;
    const routeOrderId = route.params?.orderId as string | undefined;
    if (routeOrderId) return;

    void storage.getString(draftStorageKey).then((raw) => {
      hasRestoredDraftRef.current = true;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as PersistedCashierDraft;
        if (!parsed || parsed.version !== 1) return;
        setSelectedChannel(parsed.selectedChannel);
        setSelectedCategoryId(parsed.selectedCategoryId);
        setSelectedFloorId(parsed.selectedFloorId);
        setSelectedTableId(parsed.selectedTableId);
        setSeatsCount(parsed.seatsCount || 1);
        setSelectedCustomerId(parsed.selectedCustomerId);
        setSelectedAddressId(parsed.selectedAddressId);
        setDeliveryPhone(parsed.deliveryPhone || "");
        setOrderNotes(parsed.orderNotes || "");
        setCouponInput(parsed.couponInput || "");
        setAppliedCouponCode(parsed.appliedCouponCode || null);
        setAppliedOfferId(parsed.appliedOfferId || null);
        setWindowType(parsed.windowType === "car" ? "car" : "internal");
        setCart(Array.isArray(parsed.cart) ? parsed.cart : []);
        setPreorderDate(parsed.preorderDate || null);
        setPreorderDestination(parsed.preorderDestination || "pickup");
        if (Array.isArray(parsed.cart) && parsed.cart.length > 0) {
          notify.success("تمت استعادة السلة الأخيرة غير المكتملة.");
        }
      } catch {
        void clearPersistedDraft();
      }
    });
  }, [branchId, effectiveConfig, route.params, draftStorageKey, clearPersistedDraft, notify]);

  useEffect(() => {
    if (!branchId || !draftStorageKey) return;
    const hasContent =
      cart.length > 0 ||
      Boolean(orderNotes.trim()) ||
      Boolean(couponInput.trim()) ||
      Boolean(appliedCouponCode) ||
      Boolean(appliedOfferId) ||
      Boolean(selectedTableId) ||
      Boolean(selectedCustomerId) ||
      Boolean(selectedAddressId) ||
      Boolean(deliveryPhone.trim());

    const timer = setTimeout(() => {
      if (!hasContent) {
        void storage.remove(draftStorageKey);
        return;
      }
      const payload: PersistedCashierDraft = {
        version: 1,
        selectedChannel,
        selectedCategoryId,
        selectedFloorId,
        selectedTableId,
        seatsCount,
        selectedCustomerId,
        selectedAddressId,
        deliveryPhone,
        orderNotes,
        couponInput,
        appliedCouponCode,
        appliedOfferId,
        windowType,
        cart,
        preorderDate,
        preorderDestination,
      };
      void storage.setString(draftStorageKey, JSON.stringify(payload));
    }, 250);
    return () => clearTimeout(timer);
  }, [
    branchId,
    draftStorageKey,
    selectedChannel,
    selectedCategoryId,
    selectedFloorId,
    selectedTableId,
    seatsCount,
    selectedCustomerId,
    selectedAddressId,
    deliveryPhone,
    orderNotes,
    couponInput,
    appliedCouponCode,
    appliedOfferId,
    windowType,
    cart,
    preorderDate,
    preorderDestination,
  ]);

  useEffect(() => {
    if (!availableChannels.length) return;
    if (availableChannels.some((channel) => channel.code === selectedChannel)) return;
    setSelectedChannel(availableChannels[0].code);
  }, [availableChannels, selectedChannel]);

  useEffect(() => {
    if (appliedOfferId && !availableOffers.some((offer) => offer.id === appliedOfferId)) {
      setAppliedOfferId(null);
    }
  }, [appliedOfferId, availableOffers]);

  useEffect(() => {
    if (appliedCouponCode && !availableCoupons.some((coupon) => normalizeCouponCode(coupon.code) === normalizeCouponCode(appliedCouponCode))) {
      setAppliedCouponCode(null);
    }
  }, [appliedCouponCode, availableCoupons]);

  useEffect(() => {
    if (effectiveConfig && !selectedCategoryId) {
      setSelectedCategoryId(effectiveConfig.menu_categories[0]?.id ?? null);
    }
    if (effectiveConfig && !selectedFloorId) {
      setSelectedFloorId(effectiveConfig.floors[0]?.id ?? null);
    }
  }, [effectiveConfig, selectedCategoryId, selectedFloorId]);

  const refreshConfigFromServer = useCallback(
    async (showError = true) => {
      if (!branchId) return;
      setRefreshingConfig(true);
      try {
        const payload = await fetchPosConfig(branchId);
        setLiveConfig(payload);
      } catch {
        if (showError) notify.error("تعذر تحديث قائمة المنتجات من الخادم.");
      } finally {
        setRefreshingConfig(false);
      }
    },
    [branchId, notify],
  );

  useEffect(() => {
    if (!branchId) return;
    void refreshConfigFromServer(true);
  }, [branchId, refreshConfigFromServer]);

  const handleRealtimeConfigChange = useCallback((_msg: PosRealtimeMessage) => {
    const now = Date.now();
    if (now - lastRealtimeRefreshAtRef.current < 1_000) return;
    lastRealtimeRefreshAtRef.current = now;
    void refreshConfigFromServer(false);
  }, [refreshConfigFromServer]);

  const handleForceLogout = useCallback((_msg: PosRealtimeMessage) => {
    notify.warning("تم تحديث صلاحيات المستخدم. سيتم تسجيل الخروج.");
    void signOut();
  }, [notify, signOut]);

  usePosRealtimeConfig({
    branchId,
    onConfigChange: handleRealtimeConfigChange,
    onForceLogout: handleForceLogout,
  });

  useEffect(() => {
    if (!selectedCustomerId) {
      setAddresses([]);
      setSelectedAddressId(null);
      return;
    }
    void listCustomerAddresses(selectedCustomerId).then((data) => {
      setAddresses(data);
      setSelectedAddressId((current) => current ?? data[0]?.id ?? null);
    });
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!showWindowType) {
      setWindowType("internal");
    }
  }, [showWindowType]);

  const loadHeldOrders = useCallback(async () => {
    if (!branchId || !activeShiftId) return;
    setLoadingHeldOrders(true);
    try {
      const data = await fetchCashierOrders({
        branchId,
        shiftId: activeShiftId,
        status: "draft",
        held: true,
      });
      setHeldOrders(data);
    } catch {
      setHeldOrders([]);
    } finally {
      setLoadingHeldOrders(false);
    }
  }, [branchId, activeShiftId]);

  const loadDeferredOrders = useCallback(async () => {
    if (!branchId || !activeShiftId) return;
    setLoadingDeferredOrders(true);
    try {
      const [submittedOrders, completedOrders] = await Promise.all([
        fetchCashierOrders({
          branchId,
          shiftId: activeShiftId,
          status: "submitted",
          held: false,
        }),
        fetchCashierOrders({
          branchId,
          shiftId: activeShiftId,
          status: "completed",
          held: false,
        }),
      ]);
      const dataById = new Map<string, CashierOrderListItem>();
      for (const order of [...submittedOrders, ...completedOrders]) {
        dataById.set(order.id, order);
      }
      const data = [...dataById.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      if (!data.length) {
        setDeferredOrders([]);
        setDeferredRemainingByOrderId({});
        return;
      }

      const evaluated = await Promise.all(
        data.map(async (order) => {
          try {
            const payments = await listPayments(order.id);
            const paid = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
            const remaining = Math.max(0, toNumber(order.grand_total) - paid);
            return { order, remaining };
          } catch {
            return { order, remaining: Math.max(0, toNumber(order.grand_total)) };
          }
        }),
      );

      const unpaidOnly = evaluated.filter((entry) => entry.remaining > 0.0001);
      const remainingMap: Record<string, number> = {};
      for (const entry of unpaidOnly) {
        remainingMap[entry.order.id] = entry.remaining;
      }

      setDeferredOrders(unpaidOnly.map((entry) => entry.order));
      setDeferredRemainingByOrderId(remainingMap);
    } catch {
      setDeferredOrders([]);
      setDeferredRemainingByOrderId({});
    } finally {
      setLoadingDeferredOrders(false);
    }
  }, [branchId, activeShiftId]);

  useEffect(() => {
    if (!isCompact && cartDrawerOpen) {
      setCartDrawerOpen(false);
    }
  }, [isCompact, cartDrawerOpen]);

  useEffect(() => {
    if (!selectedTableId) return;
    if (!heldOrders.some((order) => order.channel_code === "dine_in" && order.table === selectedTableId) &&
        !deferredOrders.some((order) => order.channel_code === "dine_in" && order.table === selectedTableId)) {
      return;
    }
    setSelectedTableId(null);
  }, [selectedTableId, heldOrders, deferredOrders]);

  useEffect(() => {
    if (!loading && branchId) {
      void loadHeldOrders();
      void loadDeferredOrders();
    }
  }, [loading, branchId, loadHeldOrders, loadDeferredOrders]);

  useEffect(() => {
    const timer = setInterval(() => {
      void getOutboxCount().then(setPendingSync);
      void flushOutbox(createPosOrder)
        .then((result) => setPendingSync(result.pending))
        .catch(() => setOnline(false));
      void loadHeldOrders();
      void loadDeferredOrders();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadHeldOrders, loadDeferredOrders]);

  useEffect(() => {
    const orderId = route.params?.orderId as string | undefined;
    if (!orderId || !effectiveConfig) return;
    setLoadingOrder(true);
    void fetchOrderDetail(orderId)
      .then(async (order) => {
        setEditingOrderId(order.id);
        setEditingOrderNumber(order.order_number ?? null);
        setSelectedChannel(order.channel_code);
        setSelectedTableId(order.table ?? null);
        setSeatsCount(order.seats_count || 1);
        setSelectedCustomerId(order.customer ?? null);
        setSelectedAddressId(order.address ?? null);
        setDeliveryPhone(order.customer_phone ?? "");
        setOrderNotes(order.notes ?? "");
        setCouponInput("");
        setAppliedCouponCode(null);
        setAppliedOfferId(null);
        const info = order.car_info ?? {};
        setWindowType(info.window_type === "car" ? "car" : "internal");

        if (order.is_held) {
          await resumeOrder(order.id);
        }

        const itemsMap = new Map(items.map((item) => [item.item_id, item]));
        const mappedCart: CartLine[] = order.items.map((line, idx) => {
          const item = itemsMap.get(line.menu_item) ?? {
            item_id: line.menu_item,
            subsidiary: null,
            category: null,
            uom: null,
            item_code: line.menu_item_name,
            item_name: localizeUiText(line.menu_item_name),
            barcode: null,
            description: "",
            is_taxable: true,
            created_at: null,
            price: line.unit_price_snapshot,
          };
          return {
            lineId: `${line.menu_item}-${idx}`,
            item,
            qty: toNumber(line.quantity) || 1,
            unitPrice: toNumber(line.unit_price_snapshot),
            modifiers: (line.modifiers_snapshot_json || []).map((mod, modIndex) => {
              const groupIdRaw = (mod as Record<string, unknown>).group_id ?? (mod as Record<string, unknown>).groupId;
              const itemIdRaw = (mod as Record<string, unknown>).item_id ?? (mod as Record<string, unknown>).itemId;
              const nameRaw = (mod as Record<string, unknown>).name;
              const priceRaw = (mod as Record<string, unknown>).price_delta ?? (mod as Record<string, unknown>).priceDelta;

              return {
                groupId: toStringFromUnknown(groupIdRaw, `g-${modIndex}`),
                itemId: toStringFromUnknown(itemIdRaw, `i-${modIndex}`),
                name: localizeUiText(toStringFromUnknown(nameRaw, "إضافة")),
                priceDelta: toNumberFromUnknown(priceRaw),
              };
            }),
            notes: line.notes ?? "",
          };
        });
        setCart(mappedCart);
      })
      .catch(() => {
        notify.error("تعذر تحميل الطلب المطلوب.");
      })
      .finally(() => setLoadingOrder(false));
  }, [route.params, effectiveConfig, items, notify]);
  const resolveItemPrice = useCallback(
    (item: ItemDto) => {
      const fromPriceList = activePriceList?.items.find((entry) => entry.menu_item_id === item.item_id)?.price;
      return toNumber(fromPriceList ?? item.price);
    },
    [activePriceList],
  );

  const lineModifiersTotal = useCallback((line: CartLine) => line.modifiers.reduce((sum, mod) => sum + mod.priceDelta, 0), []);

  const cartSubtotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const unitWithModifiers = line.unitPrice + lineModifiersTotal(line);
        return sum + unitWithModifiers * line.qty;
      }, 0),
    [cart],
  );
  const cartExcise = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const unitWithModifiers = line.unitPrice + lineModifiersTotal(line);
        const lineSubtotal = unitWithModifiers * line.qty;
        const rate = toNumber(line.item.excise_rate_percent);
        if (rate <= 0) return sum;
        return sum + (lineSubtotal * rate) / 100;
      }, 0),
    [cart, lineModifiersTotal],
  );
  const cartTax = useMemo(() => ((cartSubtotal + cartExcise) * taxRate) / 100, [cartSubtotal, cartExcise, taxRate]);
  const cartService = useMemo(() => {
    if (!canApplyServiceCharge) return 0;
    if (serviceChargePercentOverride !== null) return (cartSubtotal * serviceChargePercentOverride) / 100;
    if (!activeService) return 0;
    if (activeService.charge_type === "fixed") return toNumber(activeService.value);
    return (cartSubtotal * toNumber(activeService.value)) / 100;
  }, [activeService, canApplyServiceCharge, cartSubtotal, serviceChargePercentOverride]);
  const cartDeliveryFee = useMemo(() => {
    if (selectedChannel !== "delivery") return 0;
    return Math.max(0, deliveryFeeAmount ?? 0);
  }, [selectedChannel, deliveryFeeAmount]);
  const promotionResult = useMemo(
    () => calculatePromotionDiscount(appliedPromotion, cartSubtotal),
    [appliedPromotion, cartSubtotal],
  );
  const cartDiscount = promotionResult.discount;
  const discountLabel = appliedPromotion?.source === "coupon" ? "خصم الكوبون" : "الخصم";
  const promotionError = promotionResult.error || "";
  const appliedPromotionLabel = useMemo(() => {
    if (!appliedPromotion) return null;
    if (appliedPromotion.source === "coupon") {
      return `${appliedPromotion.coupon.code} - ${appliedPromotion.coupon.title}`;
    }
    return appliedPromotion.offer.title;
  }, [appliedPromotion]);
  const cartTotal = useMemo(
    () => cartSubtotal + cartTax + cartExcise + cartService + cartDeliveryFee - cartDiscount,
    [cartSubtotal, cartTax, cartExcise, cartService, cartDeliveryFee, cartDiscount],
  );
  const deferredTotalAmount = useMemo(() => {
    if (deferredPaymentDetail) return toNumber(deferredPaymentDetail.grand_total);
    if (deferredPaymentOrder) return toNumber(deferredPaymentOrder.grand_total);
    return 0;
  }, [deferredPaymentDetail, deferredPaymentOrder]);
  const deferredPaidAmount = useMemo(
    () => deferredPaymentHistory.reduce((sum, payment) => sum + toNumber(payment.amount), 0),
    [deferredPaymentHistory],
  );
  const deferredRemainingAmount = useMemo(
    () => Math.max(0, deferredTotalAmount - deferredPaidAmount),
    [deferredTotalAmount, deferredPaidAmount],
  );
  const deferredEnteredAmount = useMemo(() => toNumber(deferredPaymentAmount), [deferredPaymentAmount]);
  const deferredRemainingAfterEntry = useMemo(
    () => Math.max(0, deferredRemainingAmount - deferredEnteredAmount),
    [deferredRemainingAmount, deferredEnteredAmount],
  );
  const splitPaymentTotal = useMemo(
    () => splitPaymentLines.reduce((sum, line) => sum + toNumber(line.amount), 0),
    [splitPaymentLines],
  );
  const splitRemainingAfter = useMemo(
    () => Math.max(0, deferredRemainingAmount - splitPaymentTotal),
    [deferredRemainingAmount, splitPaymentTotal],
  );
  const unavailableTableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const order of heldOrders) {
      if (order.channel_code === "dine_in" && order.table) ids.add(order.table);
    }
    for (const order of deferredOrders) {
      if (order.channel_code === "dine_in" && order.table) ids.add(order.table);
    }
    return Array.from(ids);
  }, [heldOrders, deferredOrders]);
  const selectedFloorName = useMemo(
    () => floors.find((floor) => floor.id === selectedFloorId)?.name ?? "الصالة الرئيسية",
    [floors, selectedFloorId],
  );
  const selectedTableLabel = useMemo(
    () => tables.find((table) => table.id === selectedTableId)?.code ?? "-",
    [tables, selectedTableId],
  );
  const tableCodeById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const table of tables) map[table.id] = table.code;
    return map;
  }, [tables]);

  const addToCart = useCallback(
    (item: ItemDto) => {
      const price = resolveItemPrice(item);
      setCart((current) => {
        const existing = current.find((line) => line.item.item_id === item.item_id);
        if (existing) {
          return current.map((line) =>
            line.item.item_id === item.item_id ? { ...line, qty: line.qty + 1 } : line,
          );
        }
        return [
          ...current,
          {
            lineId: makeId("line"),
            item,
            qty: 1,
            unitPrice: price,
            modifiers: [],
            notes: "",
          },
        ];
      });
      setLastAddedItemId(item.item_id);
      notify.success(`تمت إضافة ${item.item_name}`, 1200);
      setTimeout(() => setLastAddedItemId((current) => (current === item.item_id ? null : current)), 600);
    },
    [resolveItemPrice, notify],
  );

  const openQuickAdd = useCallback((item: ItemDto) => {
    blurActiveElementOnWeb();
    setQuickAddItem(item);
    setQuickAddModifiers(buildDefaultRequiredSingleSelectModifiers(modifiers, []));
    setQuickAddNotes("");
    setQuickAddError("");
  }, [modifiers]);

  const closeQuickAdd = useCallback(() => {
    setQuickAddItem(null);
    setQuickAddModifiers([]);
    setQuickAddNotes("");
    setQuickAddError("");
  }, []);

  const updateQty = useCallback((lineId: string, qty: number) => {
    setCart((current) => {
      if (qty <= 0) return current.filter((line) => line.lineId !== lineId);
      return current.map((line) => (line.lineId === lineId ? { ...line, qty } : line));
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setCart((current) => current.filter((line) => line.lineId !== lineId));
  }, []);

  const openModifiers = useCallback(
    (lineId: string) => {
      blurActiveElementOnWeb();
      const line = cart.find((entry) => entry.lineId === lineId);
      if (!line) return;
      setModifierDraft(buildDefaultRequiredSingleSelectModifiers(modifiers, line.modifiers));
      setModifierNotes(line.notes);
      setModifierError("");
      setModifierLineId(lineId);
    },
    [cart, modifiers],
  );

  const closeModifiers = useCallback(() => {
    setModifierLineId(null);
    setModifierError("");
  }, []);

  const toggleDraftModifier = useCallback(
    (groupId: string, groupMax: number, item: { id: string; name: string; price_delta: string }) => {
      setModifierDraft((current) => {
        const existing = current.find((mod) => mod.groupId === groupId && mod.itemId === item.id);
        const groupMods = current.filter((mod) => mod.groupId === groupId);
        const singleSelect = groupMax === 1;
        if (!existing && singleSelect && groupMods.length >= 1) {
          const withoutGroup = current.filter((mod) => mod.groupId !== groupId);
          return [
            ...withoutGroup,
            {
              groupId,
              itemId: item.id,
              name: localizeUiText(item.name),
              priceDelta: toNumber(item.price_delta),
            },
          ];
        }
        if (!existing && groupMax > 0 && groupMods.length >= groupMax) {
          setModifierError("تم الوصول إلى الحد الأقصى لاختيارات هذه المجموعة.");
          return current;
        }
        return existing
          ? current.filter((mod) => !(mod.groupId === groupId && mod.itemId === item.id))
          : [
              ...current,
              {
                groupId,
                itemId: item.id,
                name: localizeUiText(item.name),
                priceDelta: toNumber(item.price_delta),
              },
            ];
      });
    },
    [],
  );

  const toggleQuickAddModifier = useCallback(
    (groupId: string, groupMax: number, item: { id: string; name: string; price_delta: string }) => {
      setQuickAddModifiers((current) => {
        const existing = current.find((mod) => mod.groupId === groupId && mod.itemId === item.id);
        const groupMods = current.filter((mod) => mod.groupId === groupId);
        const singleSelect = groupMax === 1;
        if (!existing && singleSelect && groupMods.length >= 1) {
          const withoutGroup = current.filter((mod) => mod.groupId !== groupId);
          return [
            ...withoutGroup,
            {
              groupId,
              itemId: item.id,
              name: localizeUiText(item.name),
              priceDelta: toNumber(item.price_delta),
            },
          ];
        }
        if (!existing && groupMax > 0 && groupMods.length >= groupMax) {
          setQuickAddError("تم الوصول إلى الحد الأقصى لاختيارات هذه المجموعة.");
          return current;
        }
        return existing
          ? current.filter((mod) => !(mod.groupId === groupId && mod.itemId === item.id))
          : [
              ...current,
              {
                groupId,
                itemId: item.id,
                name: localizeUiText(item.name),
                priceDelta: toNumber(item.price_delta),
              },
            ];
      });
    },
    [],
  );

  const validateModifierDraft = useCallback(() => {
    for (const group of modifiers) {
      const minRequired = group.required ? Math.max(group.min_select || 1, 1) : group.min_select || 0;
      const selectedCount = modifierDraft.filter((mod) => mod.groupId === group.id).length;
      if (minRequired > 0 && selectedCount < minRequired) {
        return `يجب اختيار ${minRequired} عنصر/عناصر من مجموعة ${group.name}.`;
      }
    }
    return "";
  }, [modifiers, modifierDraft]);

  const validateQuickAddModifiers = useCallback(() => {
    for (const group of modifiers) {
      const minRequired = group.required ? Math.max(group.min_select || 1, 1) : group.min_select || 0;
      const selectedCount = quickAddModifiers.filter((mod) => mod.groupId === group.id).length;
      if (minRequired > 0 && selectedCount < minRequired) {
        return `يجب اختيار ${minRequired} عنصر/عناصر من مجموعة ${group.name}.`;
      }
    }
    return "";
  }, [modifiers, quickAddModifiers]);

  const applyModifiers = useCallback(() => {
    if (!modifierLineId) return;
    const errorMessage = validateModifierDraft();
    if (errorMessage) {
      setModifierError(errorMessage);
      return;
    }
    setCart((current) =>
      current.map((line) =>
        line.lineId === modifierLineId ? { ...line, modifiers: modifierDraft, notes: modifierNotes } : line,
      ),
    );
    setModifierLineId(null);
    setModifierError("");
  }, [modifierDraft, modifierLineId, modifierNotes, validateModifierDraft]);

  const addConfiguredItemToCart = useCallback(() => {
    if (!quickAddItem) return;
    const validation = validateQuickAddModifiers();
    if (validation) {
      setQuickAddError(validation);
      return;
    }
    const nextLine: CartLine = {
      lineId: makeId("line"),
      item: quickAddItem,
      qty: 1,
      unitPrice: resolveItemPrice(quickAddItem),
      modifiers: quickAddModifiers,
      notes: quickAddNotes.trim(),
    };
    setCart((current) => [...current, nextLine]);
    setLastAddedItemId(quickAddItem.item_id);
    notify.success(`تمت إضافة ${quickAddItem.item_name} إلى السلة`, 1200);
    setTimeout(() => setLastAddedItemId((current) => (current === quickAddItem.item_id ? null : current)), 600);
    closeQuickAdd();
  }, [quickAddItem, quickAddModifiers, quickAddNotes, validateQuickAddModifiers, resolveItemPrice, notify, closeQuickAdd]);

  const applyCoupon = useCallback(() => {
    const normalized = normalizeCouponCode(couponInput);
    if (!normalized) {
      notify.warning("أدخل كود كوبون أولًا.");
      return;
    }
    const coupon = availableCoupons.find((entry) => normalizeCouponCode(entry.code) === normalized);
    if (!coupon) {
      notify.error("الكوبون غير موجود أو غير متاح.");
      return;
    }
    setAppliedCouponCode(coupon.code);
    setAppliedOfferId(null);
    notify.success(`تم تطبيق الكوبون ${coupon.code}.`, 1500);
  }, [couponInput, availableCoupons, notify]);

  const clearPromotion = useCallback(() => {
    setAppliedCouponCode(null);
    setAppliedOfferId(null);
    setCouponInput("");
  }, []);

  const selectOffer = useCallback(
    (offerId: string | null) => {
      setAppliedOfferId(offerId);
      if (offerId) setAppliedCouponCode(null);
    },
    [],
  );

  const validateOrder = () => {
    if (!activeShiftId) return "يجب فتح الوردية قبل تنفيذ الطلب.";
    if (!(deviceId || ENV.defaultDeviceId)) return "معرّف الجهاز غير متوفر.";
    if (!availableChannels.length) return "لا توجد قناة بيع مفعلة حاليًا.";
    if (!availableChannels.some((channel) => channel.code === selectedChannel)) {
      return "القناة المختارة غير متاحة حاليًا.";
    }
    if (!activeChannelConfig) return "القناة المختارة لا تحتوي إعدادات.";
    if (!activeChannelConfig.is_enabled || !activeChannelConfig.allow_new_orders) return "القناة المختارة متوقفة حاليًا.";
    if (selectedChannel === "dine_in" && !selectedTableId) return "يجب اختيار طاولة للطلبات داخل المطعم.";
    if (selectedChannel === "preorder" && !preorderDate) return "يجب تحديد تاريخ ووقت الطلب المسبق.";
    if (isDeliveryContext && !normalizePhone(deliveryPhone)) return "طلبات التوصيل تحتاج رقم هاتف.";
    if (isDeliveryContext && normalizePhone(deliveryPhone).length < 8) return "رقم هاتف التوصيل غير مكتمل.";
    if (!cart.length) return "السلة فارغة.";
    if (promotionError) return promotionError;

    for (const line of cart) {
      for (const group of modifiers) {
        const minRequired = group.required ? Math.max(group.min_select || 1, 1) : group.min_select || 0;
        const selectedCount = line.modifiers.filter((mod) => mod.groupId === group.id).length;
        if (minRequired > 0 && selectedCount < minRequired) {
          return `يجب اختيار ${minRequired} عنصر/عناصر من مجموعة ${group.name}.`;
        }
        if (group.max_select > 0 && selectedCount > group.max_select) {
          return `تجاوز الحد الأعلى لمجموعة ${group.name}.`;
        }
      }
    }
    return "";
  };

  const buildItemsPayload = () =>
    cart.map((line, index) => {
      const modifiersTotal = lineModifiersTotal(line);
      const unitPrice = line.unitPrice + modifiersTotal;
      const lineSubtotal = unitPrice * line.qty;
      const lineExcise = (lineSubtotal * toNumber(line.item.excise_rate_percent)) / 100;
      const lineTax = ((lineSubtotal + lineExcise) * taxRate) / 100;
      let lineDiscount = 0;
      if (cartDiscount > 0 && cartSubtotal > 0) {
        if (index === cart.length - 1) {
          const allocatedBefore = cart
            .slice(0, Math.max(index, 0))
            .reduce((sum, previousLine) => {
              const prevLineSubtotal = (previousLine.unitPrice + lineModifiersTotal(previousLine)) * previousLine.qty;
              const ratio = prevLineSubtotal / cartSubtotal;
              return sum + Number((cartDiscount * ratio).toFixed(2));
            }, 0);
          lineDiscount = Math.max(0, Number((cartDiscount - allocatedBefore).toFixed(2)));
        } else {
          const ratio = lineSubtotal / cartSubtotal;
          lineDiscount = Number((cartDiscount * ratio).toFixed(2));
        }
      }
      return {
        menu_item_id: line.item.item_id,
        quantity: line.qty.toFixed(3),
        unit_price_snapshot: unitPrice.toFixed(2),
        tax_amount_snapshot: lineTax.toFixed(2),
        discount_amount_snapshot: lineDiscount.toFixed(2),
        modifiers_snapshot_json: line.modifiers.map((mod) => ({
          group_id: mod.groupId,
          item_id: mod.itemId,
          name: mod.name,
          price_delta: mod.priceDelta.toFixed(2),
        })),
        notes: line.notes || "",
      };
    });

  const resetEditing = () => {
    setEditingOrderId(null);
    setEditingOrderNumber(null);
    setCart([]);
    setSelectedFloorId(null);
    setSelectedTableId(null);
    setSeatsCount(1);
    setSelectedCustomerId(null);
    setSelectedAddressId(null);
    setAddresses([]);
    setDeliveryPhone("");
    setOrderNotes("");
    setCouponInput("");
    setAppliedCouponCode(null);
    setAppliedOfferId(null);
    setWindowType("internal");
    setModifierLineId(null);
    setModifierDraft([]);
    setModifierNotes("");
    setModifierError("");
    setQuickAddItem(null);
    setQuickAddModifiers([]);
    setQuickAddNotes("");
    setQuickAddError("");
    setLastAddedItemId(null);
    setSaleDrawerOpen(false);
    setPreorderDate(null);
    setPreorderDestination("pickup");
    navigation.setParams?.({ orderId: undefined });
    void clearPersistedDraft();
  };

  const submitDraft = async (
    action: "submit" | "hold",
    options?: { skipPostSubmitRefresh?: boolean },
  ) => {
    const validation = validateOrder();
    if (validation) {
      notify.warning(validation);
      return { orderId: null, offline: false };
    }
    let createdOrderId: string | null = null;
    const payload: any = {
      table_id: selectedChannel === "dine_in" ? selectedTableId : null,
      seats_count: selectedChannel === "dine_in" ? seatsCount : 0,
      customer_id: isDeliveryContext && canShowDeliveryPhone ? matchedDeliveryCustomer?.id ?? null : selectedCustomerId,
      address_id: isDeliveryContext ? null : selectedAddressId,
      customer_phone: isDeliveryContext && canShowDeliveryPhone ? normalizePhone(deliveryPhone) : undefined,
      fulfillment_mode: showWindowType && windowType === "car" ? "window" : "counter",
      pickup_window_status: showWindowType ? "pending" : undefined,
      pickup_code: "",
      car_info: showWindowType ? { window_type: windowType, window_label: windowType === "car" ? "كاشير خارجي" : "كاشير داخلي" } : {},
      notes:
        `${canShowOrderNotes ? orderNotes : ""}${
          appliedPromotionLabel ? `${(canShowOrderNotes ? orderNotes : "").trim() ? "\n" : ""}[PROMO] ${appliedPromotionLabel}` : ""
        }`.trim(),
      items: buildItemsPayload(),
    };
    if (selectedChannel === "preorder") {
      payload.scheduled_at = preorderDate;
      payload.channel_for_preorder = preorderDestination;
    }

    try {
      const metricName = action === "submit" ? "order_submit_ms" : "order_hold_ms";
      const orderId = await timedOperation(metricName, async () => {
        let nextOrderId = editingOrderId;
        if (editingOrderId) {
          await updateOrder(editingOrderId, payload);
        } else {
          const created = await createPosOrder({
            local_id: makeId("local"),
            idempotency_key: makeId("idem"),
            branch_id: branchId,
            device_id: deviceId || ENV.defaultDeviceId,
            channel: selectedChannel,
            offline_created_at: new Date().toISOString(),
            ...(payload as any),
          });
          nextOrderId = created.id;
          createdOrderId = created.id;
        }

        if (!nextOrderId) return null;

        if (action === "submit") {
          await submitOrder(nextOrderId);
        } else {
          await holdOrder(nextOrderId);
        }
        return nextOrderId;
      });

      if (!orderId) return { orderId: null, offline: false };

      setOnline(true);
      setPendingSync(await getOutboxCount());
      resetEditing();
      await clearPersistedDraft();
      if (!options?.skipPostSubmitRefresh) {
        await loadHeldOrders();
        await loadDeferredOrders();
      } else {
        void loadHeldOrders();
        void loadDeferredOrders();
      }
      notify.success(action === "submit" ? "تم إرسال الطلب بنجاح." : "تم تعليق الطلب بنجاح.");
      return { orderId, offline: false };
    } catch (error) {
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;
      const isClientError = Boolean(statusCode && statusCode >= 400 && statusCode < 500);
      if (isClientError) {
        notify.error(mapOrderCreateErrorMessage(error));
        return { orderId: null, offline: false };
      }
      if (createdOrderId) {
        notify.warning(action === "submit" ? "تم إنشاء الطلب لكن تعذر إرسال الحالة. أعد المحاولة." : "تم إنشاء الطلب لكن تعذر تعليقه الآن. أعد المحاولة.");
        return { orderId: null, offline: false };
      }
      if (!editingOrderId) {
        await enqueueCreateOrder({
          local_id: makeId("local"),
          idempotency_key: makeId("idem"),
          branch_id: branchId,
          device_id: deviceId || ENV.defaultDeviceId,
          channel: selectedChannel,
          offline_created_at: new Date().toISOString(),
          ...(payload as any),
        });
        setOnline(false);
        setPendingSync(await getOutboxCount());
        resetEditing();
        notify.info("تم حفظ الطلب محليًا وسيتم مزامنته لاحقًا.");
        return { orderId: null, offline: true };
      } else {
        notify.error("تعذر تحديث الطلب الحالي. تحقق من الاتصال ثم حاول مرة أخرى.");
        return { orderId: null, offline: false };
      }
    }
  };
  const handleSaleSendToKitchen = useCallback(async () => {
    setSaleActionLoading(true);
    try {
      const result = await submitDraft("submit");
      if (result.orderId || result.offline) {
        setSaleDrawerOpen(false);
      }
    } finally {
      setSaleActionLoading(false);
    }
  }, [submitDraft]);

  const handleSaleAndSendToKitchen = useCallback(async () => {
    setSaleActionLoading(true);
    try {
      const result = await submitDraft("submit");
      if (result.orderId || result.offline) {
        notify.success("تم البيع وإرسال الطلب للمطبخ.");
        setSaleDrawerOpen(false);
      }
    } finally {
      setSaleActionLoading(false);
    }
  }, [notify, submitDraft]);

  const handleSaleHold = useCallback(async () => {
    setSaleActionLoading(true);
    try {
      const result = await submitDraft("hold");
      if (result.orderId || result.offline) {
        setSaleDrawerOpen(false);
      }
    } finally {
      setSaleActionLoading(false);
    }
  }, [submitDraft]);

  const handleSalePrint = useCallback(async () => {
    setSaleActionLoading(true);
    try {
      const result = await submitDraft("submit");
      if (!result || result.offline || !result.orderId) return;
      await printReceipt(result.orderId);
      notify.success("تم إرسال أمر الطباعة.");
      setSaleDrawerOpen(false);
    } catch {
      notify.error("تعذر إرسال أمر الطباعة.");
    } finally {
      setSaleActionLoading(false);
    }
  }, [notify, submitDraft]);

  const handleOpenHeldOrder = useCallback((orderId: string) => {
    navigation.setParams?.({ orderId });
    setOrdersPopover(null);
  }, [navigation]);

  const closeDeferredPaymentModal = useCallback(() => {
    deferredPaymentRequestIdRef.current += 1;
    setDeferredPaymentOpen(false);
    setDeferredPaymentOrderId(null);
    setDeferredPaymentOrder(null);
    setDeferredPaymentDetail(null);
    setDeferredPaymentHistory([]);
    setDeferredPaymentMethod("cash");
    setDeferredPaymentAmount("");
    setDeferredPaymentReference("");
    setDeferredPaymentError("");
    setSplitPaymentLines([]);
    setSplitCountInput("2");
    setDeferredPaymentLoading(false);
    setDeferredPaymentSubmitting(false);
  }, []);

  const buildSplitPaymentLines = useCallback((amount: number, count: number): SplitPaymentLine[] => {
    const safeCount = Math.max(2, Math.min(12, Math.floor(count)));
    const total = Math.max(0, amount);
    if (total <= 0) {
      return Array.from({ length: safeCount }).map((_, index) => ({
        id: makeId("payer"),
        payerName: `العميل ${index + 1}`,
        method: "cash" as const,
        amount: "",
        referenceNo: "",
      }));
    }
    const base = Math.floor((total / safeCount) * 100) / 100;
    let consumed = 0;
    return Array.from({ length: safeCount }).map((_, index) => {
      const value = index === safeCount - 1 ? Math.max(0, total - consumed) : base;
      consumed += value;
      return {
        id: makeId("payer"),
        payerName: `العميل ${index + 1}`,
        method: "cash" as const,
        amount: value.toFixed(2),
        referenceNo: "",
      };
    });
  }, []);

  const resetSplitPaymentLines = useCallback((amount: number, count = 3) => {
    setSplitPaymentLines(buildSplitPaymentLines(amount, count));
  }, [buildSplitPaymentLines]);

  const splitEqualByCount = useCallback((count: number) => {
    const safeCount = Math.max(2, Math.min(12, Math.floor(count)));
    const total = deferredRemainingAmount;
    setSplitPaymentLines(buildSplitPaymentLines(total, safeCount));
  }, [buildSplitPaymentLines, deferredRemainingAmount]);

  const applyCustomSplitCount = useCallback(() => {
    const count = Number(splitCountInput);
    if (!Number.isFinite(count) || count < 2) {
      setDeferredPaymentError("أدخل عددًا صحيحًا أكبر من أو يساوي 2.");
      return;
    }
    setDeferredPaymentError("");
    splitEqualByCount(count);
  }, [splitCountInput, splitEqualByCount]);

  const updateSplitPaymentLine = useCallback((lineId: string, patch: Partial<SplitPaymentLine>) => {
    setSplitPaymentLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }, []);

  const addSplitPaymentLine = useCallback(() => {
    setSplitPaymentLines((current) => [
      ...current,
      { id: makeId("payer"), payerName: `العميل ${current.length + 1}`, method: "cash", amount: "", referenceNo: "" },
    ]);
  }, []);

  const removeSplitPaymentLine = useCallback((lineId: string) => {
    setSplitPaymentLines((current) => current.filter((line) => line.id !== lineId));
  }, []);

  const loadDeferredPaymentContext = useCallback(async (orderId: string) => {
    const requestId = deferredPaymentRequestIdRef.current + 1;
    deferredPaymentRequestIdRef.current = requestId;
    setDeferredPaymentLoading(true);
    setDeferredPaymentError("");
    try {
      const [detail, payments] = await Promise.all([fetchOrderDetail(orderId), listPayments(orderId)]);
      if (deferredPaymentRequestIdRef.current !== requestId) return;
      const paid = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
      const remaining = Math.max(0, toNumber(detail.grand_total) - paid);
      setDeferredPaymentDetail(detail);
      setDeferredPaymentHistory(payments);
      setDeferredPaymentAmount(remaining > 0 ? remaining.toFixed(2) : "0.00");
      setSplitPaymentLines((current) => {
        if (current.length > 0) return current;
        return buildSplitPaymentLines(remaining, 3);
      });
      setDeferredRemainingByOrderId((current) => {
        if (remaining <= 0.0001) {
          const { [orderId]: _, ...rest } = current;
          return rest;
        }
        return { ...current, [orderId]: remaining };
      });
      return { detail, payments, remaining };
    } catch {
      if (deferredPaymentRequestIdRef.current !== requestId) return;
      setDeferredPaymentDetail(null);
      setDeferredPaymentHistory([]);
      setDeferredPaymentAmount("");
      setDeferredPaymentError("تعذر تحميل تفاصيل التحصيل لهذا الطلب.");
      return null;
    } finally {
      if (deferredPaymentRequestIdRef.current === requestId) {
        setDeferredPaymentLoading(false);
      }
    }
  }, [buildSplitPaymentLines]);

  const handleOpenDeferredOrder = useCallback((order: CashierOrderListItem) => {
    setOrdersPopover(null);
    setDeferredPaymentOpen(true);
    setDeferredPaymentOrderId(order.id);
    setDeferredPaymentOrder(order);
    setDeferredPaymentDetail(null);
    setDeferredPaymentHistory([]);
    setDeferredPaymentMethod("cash");
    setDeferredPaymentAmount(toNumber(order.grand_total).toFixed(2));
    setDeferredPaymentReference("");
    setDeferredPaymentError("");
    resetSplitPaymentLines(toNumber(order.grand_total), 3);
    void loadDeferredPaymentContext(order.id);
  }, [loadDeferredPaymentContext, resetSplitPaymentLines]);

  const handleSalePay = useCallback(async () => {
    setSaleActionLoading(true);
    try {
      const result = await submitDraft("submit", { skipPostSubmitRefresh: true });
      if (!result.orderId || result.offline) return;
      setDeferredPaymentOpen(true);
      setDeferredPaymentOrderId(result.orderId);
      setDeferredPaymentOrder(null);
      setDeferredPaymentDetail(null);
      setDeferredPaymentHistory([]);
      setDeferredPaymentMethod("cash");
      setDeferredPaymentReference("");
      setDeferredPaymentError("");
      resetSplitPaymentLines(0, 3);
      void loadDeferredPaymentContext(result.orderId);
      setSaleDrawerOpen(false);
    } finally {
      setSaleActionLoading(false);
    }
  }, [
    loadDeferredPaymentContext,
    resetSplitPaymentLines,
    submitDraft,
  ]);

  const handleSubmitDeferredPayment = useCallback(async () => {
    if (!deferredPaymentOrderId) return;
    const amountNumber = toNumber(deferredPaymentAmount);
    if (amountNumber <= 0) {
      setDeferredPaymentError("أدخل مبلغ تحصيل صحيح أكبر من صفر.");
      return;
    }
    if (amountNumber > deferredRemainingAmount + 0.0001) {
      setDeferredPaymentError("المبلغ المدخل أكبر من المتبقي على الطلب.");
      return;
    }
    try {
      setDeferredPaymentSubmitting(true);
      setDeferredPaymentError("");
      await addPayment(deferredPaymentOrderId, {
        idempotencyKey: makeId(`collect-${deferredPaymentOrderId}`),
        method: deferredPaymentMethod,
        amount: amountNumber.toFixed(2),
        referenceNo: deferredPaymentReference.trim() || undefined,
      });
      const refreshed = await loadDeferredPaymentContext(deferredPaymentOrderId);
      const remainingAfter = refreshed?.remaining ?? Math.max(0, deferredRemainingAmount - amountNumber);

      setDeferredOrders((current) => {
        if (remainingAfter <= 0.0001 || refreshed?.detail.status === "paid") {
          return current.filter((order) => order.id !== deferredPaymentOrderId);
        }
        return current;
      });

      void loadDeferredOrders();

      if (remainingAfter <= 0.0001) {
        notify.success("تم تحصيل كامل المبلغ وإغلاق الطلب الآجل.");
        closeDeferredPaymentModal();
      } else {
        notify.success("تم تسجيل الدفعة بنجاح.");
        setDeferredPaymentReference("");
      }
    } catch (error) {
      setDeferredPaymentError(mapPaymentErrorMessage(error));
    } finally {
      setDeferredPaymentSubmitting(false);
    }
  }, [
    closeDeferredPaymentModal,
    deferredPaymentAmount,
    deferredPaymentMethod,
    deferredPaymentOrderId,
    deferredPaymentReference,
    deferredRemainingAmount,
    loadDeferredOrders,
    loadDeferredPaymentContext,
    notify,
  ]);

  const handleSubmitSplitPayments = useCallback(async () => {
    if (!deferredPaymentOrderId) return;
    const validLines = splitPaymentLines.filter((line) => toNumber(line.amount) > 0);
    if (!validLines.length) {
      setDeferredPaymentError("أضف مبالغ دفع صحيحة أولاً.");
      return;
    }
    const total = validLines.reduce((sum, line) => sum + toNumber(line.amount), 0);
    if (total > deferredRemainingAmount + 0.0001) {
      setDeferredPaymentError("مجموع الدفعات أكبر من المتبقي على الطلب.");
      return;
    }

    try {
      setDeferredPaymentSubmitting(true);
      setDeferredPaymentError("");
      for (const line of validLines) {
        await addPayment(deferredPaymentOrderId, {
          idempotencyKey: makeId(`split-${deferredPaymentOrderId}`),
          method: line.method,
          amount: toNumber(line.amount).toFixed(2),
          referenceNo: line.referenceNo.trim() || undefined,
        });
      }
      const refreshed = await loadDeferredPaymentContext(deferredPaymentOrderId);
      const remainingAfter = refreshed?.remaining ?? Math.max(0, deferredRemainingAmount - total);
      void loadDeferredOrders();

      if (remainingAfter <= 0.0001) {
        notify.success("تم تحصيل كامل المبلغ بنظام الدفع المتعدد.");
        closeDeferredPaymentModal();
      } else {
        notify.success("تم تسجيل الدفعات بنجاح.");
        resetSplitPaymentLines(remainingAfter, 3);
      }
    } catch (error) {
      setDeferredPaymentError(mapPaymentErrorMessage(error));
    } finally {
      setDeferredPaymentSubmitting(false);
    }
  }, [
    closeDeferredPaymentModal,
    deferredPaymentOrderId,
    deferredRemainingAmount,
    loadDeferredOrders,
    loadDeferredPaymentContext,
    notify,
    resetSplitPaymentLines,
    splitPaymentLines,
  ]);

  const handleDeleteHeldOrder = useCallback(async () => {
    if (!deleteHeldOrderId) return;
    if (!deleteHeldReason.trim() || !deleteHeldManagerPin.trim()) {
      notify.warning("يرجى إدخال سبب الإلغاء ورمز المدير.");
      return;
    }
    try {
      await cancelOrder(deleteHeldOrderId, {
        reason: deleteHeldReason.trim(),
        managerPin: deleteHeldManagerPin.trim(),
      });
      setDeleteHeldOrderId(null);
      setDeleteHeldReason("");
      setDeleteHeldManagerPin("");
      await loadHeldOrders();
      await loadDeferredOrders();
      notify.success("تم حذف الطلب المعلق بنجاح.");
    } catch (error) {
      notify.error(mapCancelErrorMessage(error));
    }
  }, [deleteHeldOrderId, deleteHeldReason, deleteHeldManagerPin, loadHeldOrders, loadDeferredOrders, notify]);

  if (loading || loadingOrder) {
    return <Text style={styles.meta}>جار تحميل بيانات الكاشير...</Text>;
  }
  if (error || !effectiveConfig) {
    return <Text style={styles.error}>{error || "لا توجد بيانات متاحة."}</Text>;
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.textMain }]}></Text>
        <View style={styles.headerRight}>
          <Pressable
            accessibilityLabel={rushMode ? "تعطيل وضع الذروة" : "تفعيل وضع الذروة"}
            style={[styles.refreshButton, rushMode && styles.rushButtonActive]}
            onPress={() => setRushMode((prev) => !prev)}
          >
            <Text style={styles.refreshButtonText}>{rushMode ? "الذروة: مفعّل" : "وضع الذروة"}</Text>
          </Pressable>
          <Pressable
            style={[styles.refreshButton, refreshingConfig && styles.refreshButtonDisabled]}
            onPress={() => {
              if (refreshingConfig) return;
              void refreshConfigFromServer(true);
            }}
          >
            <Text style={styles.refreshButtonText}>{refreshingConfig ? "جارٍ التحديث..." : "تحديث المنتجات"}</Text>
          </Pressable>
          <Text style={[styles.badge, online ? styles.badgeOnline : styles.badgeOffline]}>{online ? "متصل" : "غير متصل"}</Text>
          <Text style={[styles.meta, { color: theme.textSub }]}>معلّقات: {pendingSync}</Text>
          <Text style={[styles.meta, { color: theme.textSub }]}>المستخدم: {user?.username ?? "كاشير"}</Text>
        </View>
      </View>


      {editingOrderId ? (
        <View style={styles.editBanner}>
          <Text style={styles.editText}>
            تعديل طلب رقم {editingOrderNumber ?? "-"} (رقم داخلي: {editingOrderId})
          </Text>
          <Pressable style={styles.linkButton} onPress={resetEditing}>
            <Text style={styles.linkText}>إلغاء التعديل</Text>
          </Pressable>
        </View>
      ) : null}

      {hasOrdersPopoverToggle ? (
        <View style={[styles.ordersTopBar, isRtlLayout ? styles.ordersTopBarRtl : styles.ordersTopBarLtr]}>
          {canShowHeldSheet ? (
            <Pressable
              style={[styles.ordersTopButton, ordersPopover === "held" && styles.ordersTopButtonActive]}
              onPress={openHeldPopover}
            >
              <Text style={[styles.ordersTopButtonText, ordersPopover === "held" && styles.ordersTopButtonTextActive]}>
                الطلبات المعلقة ({heldOrders.length}) {ordersPopover === "held" ? "˅" : "˄"}
              </Text>
            </Pressable>
          ) : null}
          {canShowDeferredSheet ? (
            <Pressable
              style={[styles.ordersTopButton, styles.ordersTopButtonDeferred, ordersPopover === "deferred" && styles.ordersTopButtonDeferredActive]}
              onPress={openDeferredPopover}
            >
              <Text style={[styles.ordersTopButtonText, ordersPopover === "deferred" && styles.ordersTopButtonTextActive]}>
                الطلبات الآجلة ({deferredOrders.length}) {ordersPopover === "deferred" ? "˅" : "˄"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.layout, isCompact && styles.layoutCompact]} onLayout={handleLayoutWidth}>
        {!isCompact ? (
          <View style={styles.cartArea}>
            <CartPanel
            theme={theme}
            cart={cart}
            channelLabel={selectedChannelLabel}
            channels={availableChannels}
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
            showWindowType={showWindowType}
            windowType={windowType}
            onSelectWindowType={setWindowType}
            showTableSelection={canUseTableSelection}
            floors={floors}
            tables={tables}
            unavailableTableIds={unavailableTableIds}
            selectedFloorId={selectedFloorId}
            selectedTableId={selectedTableId}
            seatsCount={seatsCount}
            onSelectFloor={setSelectedFloorId}
            onSelectTable={setSelectedTableId}
            onSeatsChange={setSeatsCount}
            isDeliveryContext={isDeliveryContext}
            showDeliveryPhone={canShowDeliveryPhone}
            deliveryPhone={deliveryPhone}
            onDeliveryPhoneChange={setDeliveryPhone}
            deliveryCustomerLabel={deliveryCustomerLabel}
            showOrderNotes={canShowOrderNotes}
            orderNotes={orderNotes}
            onOrderNotesChange={setOrderNotes}
            availableOffers={availableOffers}
            couponInput={couponInput}
            appliedCouponCode={appliedCouponCode}
            appliedOfferId={appliedOfferId}
            appliedPromotionLabel={appliedPromotionLabel}
            promotionError={promotionError}
            onCouponInputChange={setCouponInput}
            onApplyCoupon={applyCoupon}
            onSelectOffer={selectOffer}
            onClearPromotion={clearPromotion}
            onUpdateQty={updateQty}
            onRemoveLine={removeLine}
            onOpenModifiers={openModifiers}
            scheduledAt={preorderDate}
            onScheduledAtChange={setPreorderDate}
            preorderDestination={preorderDestination}
            onPreorderDestinationChange={setPreorderDestination}
            summary={
              <OrderSummary
                subtotal={cartSubtotal}
                tax={cartTax}
                excise={cartExcise}
                service={cartService}
                deliveryFee={cartDeliveryFee}
                discount={cartDiscount}
                discountLabel={discountLabel}
                total={cartTotal}
                showService={canApplyServiceCharge}
                showDeliveryFee={selectedChannel === "delivery" && cartDeliveryFee > 0}
              />
            }
            total={cartTotal}
            onHold={() => {
              if (!canUseHold) return;
              void submitDraft("hold");
            }}
            onSend={() => {
              if (!canUseSend) return;
              void handleSaleAndSendToKitchen();
            }}
            onPrint={() => {
              if (!canUsePrint) return;
              void handleSalePrint();
            }}
            onPay={() => {
              if (!canUsePayForChannel) return;
              void handleSalePay();
            }}
            canHold={canUseHold}
            canSend={canUseSend}
            canPrint={canUsePrint}
            canPay={canUsePayForChannel}
            compact={false}
            drawerOpen
            onToggleDrawer={() => {}}
            online={online}
            pendingSync={pendingSync}
            rushMode={rushMode}
            />
          </View>
        ) : null}

        <View style={[styles.menuArea, !isCompact && styles.menuAreaWide]}>
          <MenuPanel
            theme={theme}
            categories={categories}
            categoryColors={categoryColors}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            search={search}
            onSearchChange={setSearch}
            items={filteredItems}
            onAddItem={openQuickAdd}
            resolveItemPrice={resolveItemPrice}
            menuColumns={menuColumns}
            menuColumnsAuto={autoMenuColumns}
            hasManualMenuColumns={menuColumnsOverride !== null}
            onIncreaseColumns={() => setMenuColumnsOverride((prev) => Math.min(6, (prev ?? autoMenuColumns) + 1))}
            onDecreaseColumns={() => setMenuColumnsOverride((prev) => Math.max(2, (prev ?? autoMenuColumns) - 1))}
            onResetColumns={() => setMenuColumnsOverride(null)}
            menuViewMode={menuViewMode}
            onChangeMenuViewMode={setMenuViewMode}
            menuDensity={menuDensity}
            onChangeMenuDensity={setMenuDensity}
            searchInputRef={searchInputRef}
            rushMode={rushMode}
            lastAddedItemId={lastAddedItemId}
          />
        </View>
      </View>

      {isCompact ? (
        <>
          {cartDrawerOpen && (
            <Pressable
              style={styles.drawerBackdrop}
              onPress={() => setCartDrawerOpen(false)}
            />
          )}
          {!cartDrawerOpen && !modifierLineId ? (
            <Pressable style={styles.drawerToggle} onPress={() => setCartDrawerOpen(true)}>
              <Text style={styles.drawerToggleText}>السلة</Text>
            </Pressable>
          ) : null}
          <CartPanel
            theme={theme}
            cart={cart}
            channelLabel={selectedChannelLabel}
            channels={availableChannels}
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
            showWindowType={showWindowType}
            windowType={windowType}
            onSelectWindowType={setWindowType}
            showTableSelection={canUseTableSelection}
            floors={floors}
            tables={tables}
            unavailableTableIds={unavailableTableIds}
            selectedFloorId={selectedFloorId}
            selectedTableId={selectedTableId}
            seatsCount={seatsCount}
            onSelectFloor={setSelectedFloorId}
            onSelectTable={setSelectedTableId}
            onSeatsChange={setSeatsCount}
            isDeliveryContext={isDeliveryContext}
            showDeliveryPhone={canShowDeliveryPhone}
            deliveryPhone={deliveryPhone}
            onDeliveryPhoneChange={setDeliveryPhone}
            deliveryCustomerLabel={deliveryCustomerLabel}
            showOrderNotes={canShowOrderNotes}
            orderNotes={orderNotes}
            onOrderNotesChange={setOrderNotes}
            availableOffers={availableOffers}
            couponInput={couponInput}
            appliedCouponCode={appliedCouponCode}
            appliedOfferId={appliedOfferId}
            appliedPromotionLabel={appliedPromotionLabel}
            promotionError={promotionError}
            onCouponInputChange={setCouponInput}
            onApplyCoupon={applyCoupon}
            onSelectOffer={selectOffer}
            onClearPromotion={clearPromotion}
            onUpdateQty={updateQty}
            onRemoveLine={removeLine}
            onOpenModifiers={openModifiers}
            scheduledAt={preorderDate}
            onScheduledAtChange={setPreorderDate}
            preorderDestination={preorderDestination}
            onPreorderDestinationChange={setPreorderDestination}
            summary={
              <OrderSummary
                subtotal={cartSubtotal}
                tax={cartTax}
                excise={cartExcise}
                service={cartService}
                deliveryFee={cartDeliveryFee}
                discount={cartDiscount}
                discountLabel={discountLabel}
                total={cartTotal}
                showService={canApplyServiceCharge}
                showDeliveryFee={selectedChannel === "delivery" && cartDeliveryFee > 0}
              />
            }
            total={cartTotal}
            onHold={() => {
              if (!canUseHold) return;
              void submitDraft("hold");
            }}
            onSend={() => {
              if (!canUseSend) return;
              void handleSaleAndSendToKitchen();
            }}
            onPrint={() => {
              if (!canUsePrint) return;
              void handleSalePrint();
            }}
            onPay={() => {
              if (!canUsePayForChannel) return;
              void handleSalePay();
            }}
            canHold={canUseHold}
            canSend={canUseSend}
            canPrint={canUsePrint}
            canPay={canUsePayForChannel}
            compact
            drawerOpen={cartDrawerOpen}
            onToggleDrawer={() => setCartDrawerOpen((prev) => !prev)}
            online={online}
            pendingSync={pendingSync}
            rushMode={rushMode}
          />
        </>
      ) : null}

      <Modal transparent visible={ordersPopover !== null} animationType="fade" onRequestClose={closeOrdersPopover}>
        <View style={styles.ordersPopoverOverlay}>
          <Pressable style={styles.ordersPopoverBackdrop} onPress={closeOrdersPopover} />
          <View style={[styles.ordersPopoverCard, isCompact && styles.ordersPopoverCardCompact]}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>{ordersPopover === "held" ? "الطلبات المعلقة" : "الطلبات الآجلة"}</Text>
              <Pressable style={styles.linkButton} onPress={closeOrdersPopover}>
                <Text style={styles.linkText}>إغلاق</Text>
              </Pressable>
            </View>

            {ordersPopover === "held" ? (
              <View style={styles.heldSheetBody}>
                {loadingHeldOrders ? <Text style={styles.meta}>جار تحميل المعلّقات...</Text> : null}
                {!loadingHeldOrders && heldOrders.length === 0 ? <Text style={styles.meta}>لا توجد طلبات معلقة.</Text> : null}
                <FlatList
                  style={styles.heldOrdersScroll}
                  contentContainerStyle={{ gap: 8 }}
                  data={heldOrders}
                  keyExtractor={(order) => order.id}
                  ListEmptyComponent={null}
                  renderItem={({ item: order }) => (
                    <View key={order.id} style={styles.heldOrderRow}>
                      <View style={styles.heldOrderInfo}>
                        <Text style={styles.heldOrderNo}>طلب #{order.order_number ?? "-"}</Text>
                        <Text style={styles.heldOrderMeta} numberOfLines={1}>
                          {channels.find((c) => c.code === order.channel_code)?.display_name ?? CHANNEL_LABELS[order.channel_code] ?? order.channel_code} • {order.grand_total}
                        </Text>
                      </View>
                      <View style={styles.heldOrderActions}>
                        <Pressable style={styles.heldOpenButton} onPress={() => handleOpenHeldOrder(order.id)}>
                          <Text style={styles.heldOpenButtonText}>فتح</Text>
                        </Pressable>
                        <Pressable
                          style={styles.heldDeleteButton}
                          onPress={() => {
                            blurActiveElementOnWeb();
                            setDeleteHeldOrderId(order.id);
                          }}
                        >
                          <Text style={styles.heldDeleteButtonText}>حذف</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                />
              </View>
            ) : (
              <View style={styles.heldSheetBody}>
                {loadingDeferredOrders ? <Text style={styles.meta}>جار تحميل الطلبات الآجلة...</Text> : null}
                {!loadingDeferredOrders && deferredOrders.length === 0 ? <Text style={styles.meta}>لا توجد طلبات آجلة.</Text> : null}
                <FlatList
                  style={styles.heldOrdersScroll}
                  contentContainerStyle={{ gap: 8 }}
                  data={deferredOrders}
                  keyExtractor={(order) => order.id}
                  ListEmptyComponent={null}
                  renderItem={({ item: order }) => (
                    <View key={order.id} style={styles.heldOrderRow}>
                      <View style={styles.heldOrderInfo}>
                        <Text style={styles.heldOrderNo}>طلب #{order.order_number ?? "-"}</Text>
                        <Text style={styles.heldOrderMeta} numberOfLines={1}>
                          {channels.find((c) => c.code === order.channel_code)?.display_name ?? CHANNEL_LABELS[order.channel_code] ?? order.channel_code}
                          {order.table ? ` • الطاولة: ${tableCodeById[order.table] ?? "-"}` : ""}
                          {" • "}المتبقي: {money(deferredRemainingByOrderId[order.id] ?? toNumber(order.grand_total))}
                        </Text>
                      </View>
                      <View style={styles.heldOrderActions}>
                        <Pressable style={styles.deferredOpenButton} onPress={() => handleOpenDeferredOrder(order)}>
                          <Text style={styles.heldOpenButtonText}>تحصيل</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={deferredPaymentOpen} animationType="fade" onRequestClose={closeDeferredPaymentModal}>
        <View style={styles.saleDrawerOverlay}>
          <Pressable style={styles.saleDrawerBackdrop} onPress={closeDeferredPaymentModal} />
          <View style={[styles.saleDrawerPanel, styles.paymentDrawerPanelRight]}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>تحصيل الطلب الآجل</Text>
              <Pressable style={styles.linkButton} onPress={closeDeferredPaymentModal}>
                <Text style={styles.linkText}>إغلاق</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.paymentPanelScroll} contentContainerStyle={styles.paymentPanelContent}>
              {deferredPaymentLoading ? <Text style={styles.meta}>جار تحميل تفاصيل التحصيل...</Text> : null}
              {!deferredPaymentLoading && deferredPaymentOrderId ? (
                <>
                <View style={styles.deferredMetricsRow}>
                  <View style={styles.deferredMetricCard}>
                    <Text style={styles.deferredMetricLabel}>إجمالي الطلب</Text>
                    <Text style={styles.deferredMetricValue}>{money(deferredTotalAmount)}</Text>
                  </View>
                  <View style={styles.deferredMetricCard}>
                    <Text style={styles.deferredMetricLabel}>مدفوع</Text>
                    <Text style={[styles.deferredMetricValue, styles.deferredPaidValue]}>{money(deferredPaidAmount)}</Text>
                  </View>
                  <View style={styles.deferredMetricCard}>
                    <Text style={styles.deferredMetricLabel}>المتبقي</Text>
                    <Text style={[styles.deferredMetricValue, deferredRemainingAmount > 0 ? styles.deferredRemainingValue : styles.deferredPaidValue]}>
                      {money(deferredRemainingAmount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.deferredMetaRow}>
                  <Text style={styles.meta}>طلب #{deferredPaymentDetail?.order_number ?? deferredPaymentOrder?.order_number ?? "-"}</Text>
                  <Text style={styles.meta}>
                    القناة: {CHANNEL_LABELS[deferredPaymentDetail?.channel_code ?? deferredPaymentOrder?.channel_code ?? selectedChannel]}
                  </Text>
                </View>

                <Text style={styles.modTitle}>طريقة الدفع</Text>
                <View style={styles.deferredMethodRow}>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as Array<"cash" | "card" | "wallet">).map((method) => (
                    <Pressable
                      key={method}
                      style={[styles.deferredMethodChip, deferredPaymentMethod === method && styles.deferredMethodChipActive]}
                      onPress={() => setDeferredPaymentMethod(method)}
                    >
                      <Text style={[styles.deferredMethodChipText, deferredPaymentMethod === method && styles.deferredMethodChipTextActive]}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.deferredAmountRow}>
                  <TextInput
                    value={deferredPaymentAmount}
                    onChangeText={setDeferredPaymentAmount}
                    placeholder="مبلغ التحصيل"
                    placeholderTextColor={THEME.muted}
                    keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                    style={[styles.input, styles.deferredAmountInput]}
                  />
                  <Pressable
                    style={styles.inlineCompactButton}
                    onPress={() => setDeferredPaymentAmount(deferredRemainingAmount.toFixed(2))}
                    disabled={deferredRemainingAmount <= 0}
                  >
                    <Text style={styles.inlineCompactButtonText}>تحصيل الكل</Text>
                  </Pressable>
                </View>

                {deferredPaymentMethod !== "cash" ? (
                  <TextInput
                    value={deferredPaymentReference}
                    onChangeText={setDeferredPaymentReference}
                    placeholder="مرجع العملية (اختياري)"
                    placeholderTextColor={THEME.muted}
                    style={styles.input}
                  />
                ) : null}

                <View style={styles.deferredPreviewRow}>
                  <Text style={styles.meta}>المتبقي بعد هذه الدفعة</Text>
                  <Text style={styles.deferredPreviewValue}>{money(deferredRemainingAfterEntry)}</Text>
                </View>

                {deferredPaymentError ? <Text style={styles.error}>{deferredPaymentError}</Text> : null}

                <View style={styles.deferredHistoryCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modTitle}>الدفع من أكثر من شخص</Text>
                    <Pressable style={styles.linkButton} onPress={addSplitPaymentLine}>
                      <Text style={styles.linkText}>إضافة شخص</Text>
                    </Pressable>
                  </View>
                  <View style={styles.splitPresetRow}>
                    <Pressable style={styles.splitPresetButton} onPress={() => splitEqualByCount(2)}>
                      <Text style={styles.splitPresetText}>تقسيم على 2</Text>
                    </Pressable>
                    <Pressable style={styles.splitPresetButton} onPress={() => splitEqualByCount(3)}>
                      <Text style={styles.splitPresetText}>تقسيم على 3</Text>
                    </Pressable>
                  </View>
                  <View style={styles.customSplitRow}>
                    <TextInput
                      value={splitCountInput}
                      onChangeText={setSplitCountInput}
                      placeholder="عدد الأشخاص"
                      placeholderTextColor={THEME.muted}
                      keyboardType="number-pad"
                      style={[styles.input, styles.customSplitInput]}
                    />
                    <Pressable style={styles.splitPresetButton} onPress={applyCustomSplitCount}>
                      <Text style={styles.splitPresetText}>تطبيق التقسيم</Text>
                    </Pressable>
                  </View>
                  <ScrollView style={styles.splitLinesScroll} contentContainerStyle={{ gap: 8 }}>
                    {splitPaymentLines.length === 0 ? <Text style={styles.meta}>لا توجد دفعات مقسمة.</Text> : null}
                    {splitPaymentLines.map((line, index) => (
                      <View key={line.id} style={styles.splitLineCard}>
                        <View style={styles.modalHeader}>
                          <Text style={styles.modTitle}>شخص #{index + 1}</Text>
                          {splitPaymentLines.length > 1 ? (
                            <Pressable style={styles.linkButton} onPress={() => removeSplitPaymentLine(line.id)}>
                              <Text style={styles.linkText}>حذف</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <TextInput
                          value={line.payerName}
                          onChangeText={(value) => updateSplitPaymentLine(line.id, { payerName: value })}
                          placeholder="اسم الشخص (اختياري)"
                          placeholderTextColor={THEME.muted}
                          style={styles.input}
                        />
                        <View style={styles.deferredMethodRow}>
                          {(Object.keys(PAYMENT_METHOD_LABELS) as Array<"cash" | "card" | "wallet">).map((method) => (
                            <Pressable
                              key={`${line.id}-${method}`}
                              style={[styles.deferredMethodChip, line.method === method && styles.deferredMethodChipActive]}
                              onPress={() => updateSplitPaymentLine(line.id, { method })}
                            >
                              <Text style={[styles.deferredMethodChipText, line.method === method && styles.deferredMethodChipTextActive]}>
                                {PAYMENT_METHOD_LABELS[method]}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <TextInput
                          value={line.amount}
                          onChangeText={(value) => updateSplitPaymentLine(line.id, { amount: value })}
                          placeholder="مبلغ هذا الشخص"
                          placeholderTextColor={THEME.muted}
                          keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                          style={styles.input}
                        />
                        {line.method !== "cash" ? (
                          <TextInput
                            value={line.referenceNo}
                            onChangeText={(value) => updateSplitPaymentLine(line.id, { referenceNo: value })}
                            placeholder="مرجع العملية"
                            placeholderTextColor={THEME.muted}
                            style={styles.input}
                          />
                        ) : null}
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.deferredPreviewRow}>
                    <Text style={styles.meta}>المتبقي بعد الدفعات المقسمة</Text>
                    <Text style={styles.deferredPreviewValue}>{money(splitRemainingAfter)}</Text>
                  </View>
                </View>

                <View style={styles.deferredHistoryCard}>
                  <Text style={styles.modTitle}>سجل الدفعات</Text>
                  <ScrollView style={styles.deferredPaymentsScroll} contentContainerStyle={{ gap: 6 }}>
                    {deferredPaymentHistory.length === 0 ? <Text style={styles.meta}>لا توجد دفعات مسجلة لهذا الطلب.</Text> : null}
                    {deferredPaymentHistory.map((payment) => (
                      <View key={payment.id} style={styles.deferredPaymentRow}>
                        <Text style={styles.deferredPaymentMethod}>{PAYMENT_METHOD_LABELS[payment.method as "cash" | "card" | "wallet"] ?? payment.method}</Text>
                        <Text style={styles.deferredPaymentAmount}>{money(toNumber(payment.amount))}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable style={styles.secondaryButton} onPress={closeDeferredPaymentModal} disabled={deferredPaymentSubmitting}>
                    <Text style={styles.secondaryButtonText}>إلغاء</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryButton, deferredPaymentSubmitting && styles.refreshButtonDisabled]}
                    onPress={handleSubmitDeferredPayment}
                    disabled={deferredPaymentSubmitting || deferredRemainingAmount <= 0}
                  >
                    <Text style={styles.primaryButtonText}>{deferredPaymentSubmitting ? "جار التحصيل..." : "تأكيد التحصيل"}</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.primaryButton, deferredPaymentSubmitting && styles.refreshButtonDisabled]}
                  onPress={handleSubmitSplitPayments}
                  disabled={deferredPaymentSubmitting || deferredRemainingAmount <= 0}
                >
                  <Text style={styles.primaryButtonText}>{deferredPaymentSubmitting ? "جار التحصيل..." : "تحصيل الدفع المتعدد"}</Text>
                </Pressable>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={saleDrawerOpen} animationType="fade" onRequestClose={() => setSaleDrawerOpen(false)}>
        <View style={styles.saleDrawerOverlay}>
          <Pressable style={styles.saleDrawerBackdrop} onPress={() => setSaleDrawerOpen(false)} />
          <View style={styles.saleDrawerPanel}>
            <View style={styles.saleDrawerHeader}>
              <Text style={styles.sectionTitle}>تفاصيل البيع</Text>
              <Pressable style={styles.linkButton} onPress={() => setSaleDrawerOpen(false)}>
                <Text style={styles.linkText}>إغلاق</Text>
              </Pressable>
            </View>

            <View style={styles.saleMetaCard}>
              <Text style={styles.meta}>القناة: {selectedChannelLabel}</Text>
              <Text style={styles.meta}>الطابق: {selectedFloorName}</Text>
              <Text style={styles.meta}>الطاولة: {selectedChannel === "dine_in" ? selectedTableLabel : "-"}</Text>
              <Text style={styles.meta}>عدد الأصناف: {cart.length}</Text>
            </View>

            <ScrollView style={styles.saleLinesScroll} contentContainerStyle={{ gap: 6 }}>
              {cart.map((line) => {
                const lineUnit = line.unitPrice + lineModifiersTotal(line);
                return (
                  <View key={line.lineId} style={styles.saleLineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemText}>{line.item.item_name}</Text>
                      <Text style={styles.listItemMeta}>الكمية: {line.qty}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{money(lineUnit * line.qty)}</Text>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.saleSummaryCard}>
              <OrderSummary
                subtotal={cartSubtotal}
                tax={cartTax}
                excise={cartExcise}
                service={cartService}
                deliveryFee={cartDeliveryFee}
                discount={cartDiscount}
                discountLabel={discountLabel}
                total={cartTotal}
                showService={canApplyServiceCharge}
                showDeliveryFee={selectedChannel === "delivery" && cartDeliveryFee > 0}
              />
            </View>

            <View style={styles.saleActionsColumn}>
              {canUsePayForChannel ? (
                <Pressable
                  style={[styles.primaryButton, saleActionLoading && styles.refreshButtonDisabled]}
                  onPress={handleSalePay}
                  disabled={saleActionLoading}
                >
                  <Text style={styles.primaryButtonText}>{saleActionLoading ? "جار التنفيذ..." : "بيع والدفع"}</Text>
                </Pressable>
              ) : null}
              {canUsePrint ? (
                <Pressable
                  style={[styles.secondaryButton, saleActionLoading && styles.refreshButtonDisabled]}
                  onPress={handleSalePrint}
                  disabled={saleActionLoading}
                >
                  <Text style={styles.secondaryButtonText}>بيع مع طباعة</Text>
                </Pressable>
              ) : null}
              {canUseSend ? (
                <>
                  <Pressable
                    style={[styles.secondaryButton, saleActionLoading && styles.refreshButtonDisabled]}
                    onPress={handleSaleAndSendToKitchen}
                    disabled={saleActionLoading}
                  >
                    <Text style={styles.secondaryButtonText}>بيع وإرسال للمطبخ</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, saleActionLoading && styles.refreshButtonDisabled]}
                    onPress={handleSaleSendToKitchen}
                    disabled={saleActionLoading}
                  >
                    <Text style={styles.secondaryButtonText}>إرسال للمطبخ</Text>
                  </Pressable>
                </>
              ) : null}
              {canUseHold ? (
                <Pressable
                  style={[styles.dangerActionButton, saleActionLoading && styles.refreshButtonDisabled]}
                  onPress={handleSaleHold}
                  disabled={saleActionLoading}
                >
                  <Text style={styles.dangerActionButtonText}>تعليق الطلب</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={Boolean(modifierLineId) || Boolean(quickAddItem)}
        animationType="fade"
        onRequestClose={() => {
          if (quickAddItem) {
            closeQuickAdd();
            return;
          }
          closeModifiers();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {quickAddItem ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.sectionTitle}>إضافات الصنف</Text>
                  <Pressable style={styles.linkButton} onPress={closeQuickAdd}>
                    <Text style={styles.linkText}>إلغاء</Text>
                  </Pressable>
                </View>
                <Text style={styles.meta}>الصنف: {quickAddItem.item_name}</Text>
                <Text style={styles.meta}>السعر الأساسي: {money(resolveItemPrice(quickAddItem))}</Text>
                <Text style={styles.meta}>
                  السعر بعد الإضافات: {money(resolveItemPrice(quickAddItem) + quickAddModifiers.reduce((sum, mod) => sum + mod.priceDelta, 0))}
                </Text>
                {quickAddError ? <Text style={styles.error}>{quickAddError}</Text> : null}
                <ScrollView style={styles.modalScroll}>
                  {modifiers.length === 0 ? <Text style={styles.meta}>لا توجد إضافات متاحة.</Text> : null}
                  {modifiers.map((group) => {
                    const selectedCount = quickAddModifiers.filter((mod) => mod.groupId === group.id).length;
                    const minRequired = group.required ? Math.max(group.min_select || 1, 1) : group.min_select || 0;
                    return (
                      <View key={group.id} style={styles.modGroup}>
                        <Text style={styles.modTitle}>
                          {group.name} {minRequired > 0 ? "(مطلوب)" : ""}
                        </Text>
                        <Text style={styles.modMeta}>
                          المختار {selectedCount} | الحد الأدنى {minRequired} | الحد الأعلى {group.max_select || "غير محدد"}
                        </Text>
                        <View style={styles.rowWrap}>
                          {group.items.map((modItem) => {
                            const isSelected = quickAddModifiers.some(
                              (mod) => mod.groupId === group.id && mod.itemId === modItem.id,
                            );
                            return (
                              <Pressable
                                key={modItem.id}
                                style={[styles.modChip, isSelected && styles.modChipActive]}
                                onPress={() => toggleQuickAddModifier(group.id, group.max_select, modItem)}
                              >
                                <Text style={[styles.modChipText, isSelected && styles.modChipTextActive]}>
                                  {modItem.name} +{modItem.price_delta}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                  <TextInput
                    value={quickAddNotes}
                    onChangeText={setQuickAddNotes}
                    placeholder="ملاحظات على الصنف..."
                    placeholderTextColor={THEME.muted}
                    style={styles.input}
                  />
                </ScrollView>
                <View style={styles.actionsRow}>
                  <Pressable style={styles.secondaryButton} onPress={closeQuickAdd}>
                    <Text style={styles.secondaryButtonText}>إلغاء</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={addConfiguredItemToCart}>
                    <Text style={styles.primaryButtonText}>إرسال إلى السلة</Text>
                  </Pressable>
                </View>
              </>
            ) : modifierLineId ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.sectionTitle}>إضافات الصنف</Text>
                  <Pressable style={styles.linkButton} onPress={closeModifiers}>
                    <Text style={styles.linkText}>إلغاء</Text>
                  </Pressable>
                </View>
                <Text style={styles.meta}>
                  الصنف: {cart.find((line) => line.lineId === modifierLineId)?.item.item_name ?? ""}
                </Text>
                <Text style={styles.meta}>
                  السعر الأساسي: {money(cart.find((line) => line.lineId === modifierLineId)?.unitPrice ?? 0)}
                </Text>
                <Text style={styles.meta}>
                  السعر بعد الإضافات:{" "}
                  {money(
                    (cart.find((line) => line.lineId === modifierLineId)?.unitPrice ?? 0) +
                      modifierDraft.reduce((sum, mod) => sum + mod.priceDelta, 0),
                  )}
                </Text>
                {modifierError ? <Text style={styles.error}>{modifierError}</Text> : null}
                <ScrollView style={styles.modalScroll}>
                  {modifiers.length === 0 ? <Text style={styles.meta}>لا توجد معدلات متاحة.</Text> : null}
                  {modifiers.map((group) => {
                    const selectedCount = modifierDraft.filter((mod) => mod.groupId === group.id).length;
                    const minRequired = group.required ? Math.max(group.min_select || 1, 1) : group.min_select || 0;
                    return (
                      <View key={group.id} style={styles.modGroup}>
                        <Text style={styles.modTitle}>
                          {group.name} {minRequired > 0 ? "(مطلوب)" : ""}
                        </Text>
                        <Text style={styles.modMeta}>
                          المختار {selectedCount} | الحد الأدنى {minRequired} | الحد الأعلى {group.max_select || "غير محدد"}
                        </Text>
                        <View style={styles.rowWrap}>
                          {group.items.map((modItem) => {
                            const isSelected = modifierDraft.some(
                              (mod) => mod.groupId === group.id && mod.itemId === modItem.id,
                            );
                            return (
                              <Pressable
                                key={modItem.id}
                                style={[styles.modChip, isSelected && styles.modChipActive]}
                                onPress={() => toggleDraftModifier(group.id, group.max_select, modItem)}
                              >
                                <Text style={[styles.modChipText, isSelected && styles.modChipTextActive]}>
                                  {modItem.name} +{modItem.price_delta}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                  <TextInput
                    value={modifierNotes}
                    onChangeText={setModifierNotes}
                    placeholder="ملاحظات على الصنف..."
                    placeholderTextColor={THEME.muted}
                    style={styles.input}
                  />
                </ScrollView>
                <View style={styles.actionsRow}>
                  <Pressable style={styles.secondaryButton} onPress={closeModifiers}>
                    <Text style={styles.secondaryButtonText}>إلغاء</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={applyModifiers}>
                    <Text style={styles.primaryButtonText}>إضافة إلى الطلب</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal transparent visible={Boolean(deleteHeldOrderId)} animationType="fade" onRequestClose={() => setDeleteHeldOrderId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>حذف طلب معلق</Text>
              <Pressable style={styles.linkButton} onPress={() => setDeleteHeldOrderId(null)}>
                <Text style={styles.linkText}>إلغاء</Text>
              </Pressable>
            </View>
            <TextInput
              value={deleteHeldReason}
              onChangeText={setDeleteHeldReason}
              placeholder="سبب الإلغاء"
              placeholderTextColor={THEME.muted}
              style={styles.input}
            />
            <TextInput
              value={deleteHeldManagerPin}
              onChangeText={setDeleteHeldManagerPin}
              placeholder="رمز المدير"
              placeholderTextColor={THEME.muted}
              secureTextEntry
              style={styles.input}
            />
            <View style={styles.actionsRow}>
              <Pressable style={styles.secondaryButton} onPress={() => setDeleteHeldOrderId(null)}>
                <Text style={styles.secondaryButtonText}>إلغاء</Text>
              </Pressable>
              <Pressable style={styles.dangerActionButton} onPress={handleDeleteHeldOrder}>
                <Text style={styles.dangerActionButtonText}>تأكيد الحذف</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type MenuPanelProps = {
  theme: AppThemePalette;
  categories: Array<{ id: string; name: string }>;
  categoryColors: Record<string, string>;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  items: ItemDto[];
  onAddItem: (item: ItemDto) => void;
  resolveItemPrice: (item: ItemDto) => number;
  menuColumns: number;
  menuColumnsAuto: number;
  hasManualMenuColumns: boolean;
  onIncreaseColumns: () => void;
  onDecreaseColumns: () => void;
  onResetColumns: () => void;
  menuViewMode: MenuViewMode;
  onChangeMenuViewMode: (mode: MenuViewMode) => void;
  menuDensity: MenuDensity;
  onChangeMenuDensity: (density: MenuDensity) => void;
  searchInputRef: { current: TextInput | null };
  rushMode: boolean;
  lastAddedItemId: string | null;
};

const MenuPanel = memo(function MenuPanel(props: MenuPanelProps) {
  const resolvedColumns = props.menuViewMode === "list" ? 1 : Math.max(2, Math.min(props.menuColumns, 6));
  const effectiveColumns = Math.max(1, Math.min(resolvedColumns, props.items.length || 1));
  const itemsScrollRef = useRef<ScrollView | null>(null);
  const isCompactDensity = props.menuDensity === "compact";
  const isListMode = props.menuViewMode === "list";
  const itemRows = useMemo(() => {
    const rows: ItemDto[][] = [];
    for (let i = 0; i < props.items.length; i += effectiveColumns) {
      rows.push(props.items.slice(i, i + effectiveColumns));
    }
    return rows;
  }, [props.items, effectiveColumns]);
  const estimatedRowHeight = useMemo(() => {
    if (isListMode) return isCompactDensity ? 70 : 84;
    if (props.rushMode) return isCompactDensity ? 92 : 98;
    return isCompactDensity ? 102 : 116;
  }, [isListMode, isCompactDensity, props.rushMode]);
  const itemsViewportHeight = useMemo(
    () => Math.max(estimatedRowHeight + 10, Math.min(520, itemRows.length * estimatedRowHeight + 10)),
    [estimatedRowHeight, itemRows.length],
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      itemsScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, [props.selectedCategoryId, props.search, props.items.length]);
  const leftPalette = useMemo(
    () => ({
      card: props.theme.card,
      soft: props.theme.mode === "dark" ? props.theme.soft : "#FFFFFF",
      border: props.theme.border,
      text: props.theme.textMain,
      muted: props.theme.mode === "dark" ? "#C3D3E2" : props.theme.textSub,
      primary: props.theme.primaryBlue,
      accent: props.theme.mode === "dark" ? "#F7C34A" : props.theme.accentOrange,
      searchBorder: props.theme.mode === "dark" ? props.theme.border : "#BFD4E7",
      itemAddedBg: props.theme.mode === "dark" ? "#183326" : "#F0FDF4",
      itemAddedBorder: props.theme.success,
    }),
    [props.theme],
  );

  return (
    <View style={[styles.menu, { backgroundColor: leftPalette.card, borderColor: leftPalette.border }, props.rushMode && styles.menuRush]}>
      <TextInput
        ref={props.searchInputRef}
        accessibilityLabel="بحث الأصناف"
        value={props.search}
        onChangeText={props.onSearchChange}
        placeholder="ابحث بالاسم أو الكود..."
        placeholderTextColor={leftPalette.muted}
        style={[
          styles.searchInput,
          { backgroundColor: leftPalette.soft, borderColor: leftPalette.searchBorder, color: leftPalette.text },
        ]}
      />
      <View style={styles.menuControlsRow}>
        <View style={styles.menuSegment}>
          <Pressable
            style={[styles.controlChip, isListMode && styles.controlChipActive]}
            onPress={() => props.onChangeMenuViewMode("list")}
          >
            <Text style={[styles.controlChipText, isListMode && styles.controlChipTextActive]}>قائمة</Text>
          </Pressable>
          <Pressable
            style={[styles.controlChip, !isListMode && styles.controlChipActive]}
            onPress={() => props.onChangeMenuViewMode("cards")}
          >
            <Text style={[styles.controlChipText, !isListMode && styles.controlChipTextActive]}>بطاقات</Text>
          </Pressable>
        </View>
        <View style={styles.menuSegment}>
          <Pressable
            style={[styles.iconChip, isCompactDensity && styles.controlChipActive]}
            accessibilityLabel="تصغير بطاقات الأصناف"
            onPress={() => props.onChangeMenuDensity("compact")}
          >
            <Text style={[styles.controlChipText, isCompactDensity && styles.controlChipTextActive]}>A-</Text>
          </Pressable>
          <Pressable
            style={[styles.iconChip, !isCompactDensity && styles.controlChipActive]}
            accessibilityLabel="تكبير بطاقات الأصناف"
            onPress={() => props.onChangeMenuDensity("comfortable")}
          >
            <Text style={[styles.controlChipText, !isCompactDensity && styles.controlChipTextActive]}>A+</Text>
          </Pressable>
        </View>
        {!isListMode ? (
          <View style={styles.menuSegment}>
            <Pressable style={styles.iconChip} accessibilityLabel="تقليل الأعمدة" onPress={props.onDecreaseColumns}>
              <Text style={styles.controlChipText}>-</Text>
            </Pressable>
            <Text style={styles.columnsLabel}>أعمدة {props.menuColumns}</Text>
            <Pressable style={styles.iconChip} accessibilityLabel="زيادة الأعمدة" onPress={props.onIncreaseColumns}>
              <Text style={styles.controlChipText}>+</Text>
            </Pressable>
            <Pressable
              style={[styles.controlChip, !props.hasManualMenuColumns && styles.controlChipActive]}
              onPress={props.onResetColumns}
            >
              <Text style={[styles.controlChipText, !props.hasManualMenuColumns && styles.controlChipTextActive]}>
                {props.hasManualMenuColumns ? "تلقائي" : `تلقائي (${props.menuColumnsAuto})`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesRow}>
        <Pressable
          style={[
            styles.chip,
            { borderColor: leftPalette.border, backgroundColor: leftPalette.soft },
            props.selectedCategoryId === ALL_CATEGORY_ID && [styles.chipActive, { backgroundColor: leftPalette.primary, borderColor: leftPalette.primary }],
          ]}
          onPress={() => props.onSelectCategory(ALL_CATEGORY_ID)}
        >
          <Text style={[styles.chipText, { color: leftPalette.text }, props.selectedCategoryId === ALL_CATEGORY_ID && styles.chipTextActive]}>
            الكل
          </Text>
        </Pressable>
        {props.categories.map((cat) => {
          const categoryColor = props.categoryColors[cat.id] ?? leftPalette.primary;
          const isActive = props.selectedCategoryId === cat.id;
          return (
            <Pressable
              key={cat.id}
              style={[
                styles.chip,
                { borderColor: categoryColor, backgroundColor: leftPalette.soft },
                isActive && [styles.chipActive, { backgroundColor: categoryColor, borderColor: categoryColor }],
              ]}
              onPress={() => props.onSelectCategory(cat.id)}
            >
              <Text style={[styles.chipText, { color: isActive ? "#FFFFFF" : categoryColor }, isActive && styles.chipTextActive]}>{cat.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.itemsArea, { maxHeight: itemsViewportHeight, minHeight: Math.min(itemsViewportHeight, estimatedRowHeight + 10) }]}>
        <ScrollView
          key={`menu-grid-${props.menuViewMode}-${effectiveColumns}-${props.selectedCategoryId ?? "all"}-${props.search}`}
          ref={itemsScrollRef}
          style={styles.itemsList}
          contentContainerStyle={styles.itemsGrid}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {itemRows.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.manualRow}>
              {row.map((item) => (
                <View key={item.item_id} style={styles.itemCell}>
                <Pressable
                  accessibilityLabel={`إضافة ${item.item_name}`}
                  style={[
                    styles.itemCard,
                    isListMode ? styles.itemCardList : styles.itemCardGrid,
                    isCompactDensity ? styles.itemCardCompact : styles.itemCardComfortable,
                    props.rushMode && styles.itemCardRush,
                    { borderColor: props.categoryColors[item.category] ?? leftPalette.border, backgroundColor: leftPalette.soft },
                    props.lastAddedItemId === item.item_id && [styles.itemCardAdded, { borderColor: leftPalette.itemAddedBorder, backgroundColor: leftPalette.itemAddedBg }],
                  ]}
                  onPress={() => props.onAddItem(item)}
                >
                  <Text style={[styles.itemTitle, isListMode && styles.itemTitleList, isCompactDensity && styles.itemTitleCompact, { color: leftPalette.text }]} numberOfLines={isListMode ? 1 : isCompactDensity ? 1 : 2}>
                    {item.item_name}
                  </Text>
                  <Text style={[styles.itemMeta, isCompactDensity && styles.itemMetaCompact, { color: leftPalette.muted }]} numberOfLines={1}>
                    {item.item_code}
                  </Text>
                  {toNumber(item.excise_rate_percent) > 0 ? (
                    <View style={[styles.itemExciseBadge, { borderColor: leftPalette.primary }]}>
                      <Text style={[styles.itemExciseBadgeText, { color: leftPalette.primary }]} numberOfLines={1}>
                        {`${EXCISE_CATEGORY_AR[item.excise_category || ""] ?? "انتقائية"} (${money(toNumber(item.excise_rate_percent))}%)`}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.itemPrice, { color: leftPalette.accent }]}>{money(props.resolveItemPrice(item))}</Text>
                </Pressable>
              </View>
              ))}
            </View>
          ))}
          {!props.items.length ? (
            <Text style={[styles.emptyItems, { color: leftPalette.muted }]}>لا توجد أصناف مطابقة للبحث أو التصنيف.</Text>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 8, backgroundColor: THEME.bg, gap: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerRight: { flexDirection: "row", gap: 6, alignItems: "center" },
  rushButtonActive: { backgroundColor: "#E6F7ED", borderColor: THEME.success },
  refreshButton: {
    borderWidth: 1,
    borderColor: THEME.primary,
    backgroundColor: "#EAF3FB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshButtonDisabled: { opacity: 0.65 },
  refreshButtonText: { color: THEME.primary, fontWeight: "900" },
  title: { fontSize: 27, fontWeight: "900", color: THEME.text, textAlign: "right" },
  meta: { color: THEME.muted, textAlign: "right", fontWeight: "700" },
  error: { color: THEME.danger, fontWeight: "700", textAlign: "right" },
  badge: { color: "#fff", fontWeight: "800", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOnline: { backgroundColor: THEME.success },
  badgeOffline: { backgroundColor: THEME.danger },
  layout: { flex: 1, minHeight: 0, flexDirection: "row", alignItems: "flex-start", gap: 8, position: "relative", overflow: "hidden" },
  layoutCompact: { flexDirection: "column" },
  menuArea: { flex: 2, minHeight: 0 },
  menuAreaWide: { flex: 2 },
  menu: {
    flex: 1,
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: THEME.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 10,
    gap: 0,
    alignItems: "stretch",
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  cartArea: {
    flex: 1,
    flexShrink: 0,
    minWidth: 200,
    alignSelf: "flex-start",
    overflow: "visible",
  },
  
  menuRush: { padding: 8, gap: 0 },
  menuControlsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
  },
  menuSegment: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  controlChip: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    minHeight: 32,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  iconChip: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    minHeight: 32,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    minWidth: 34,
    alignItems: "center",
  },
  controlChipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  controlChipText: { color: THEME.text, fontWeight: "800", textAlign: "right" },
  controlChipTextActive: { color: "#FFFFFF" },
  columnsLabel: { color: THEME.text, fontWeight: "800", minWidth: 66, textAlign: "center" },
  categoriesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingVertical: 0,
    paddingHorizontal: 2,
    marginBottom: 5,
  },
  chip: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minHeight: 36, justifyContent: "center" },
  chipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { color: THEME.text, fontWeight: "700", textAlign: "right" },
  chipTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, minHeight: 38, paddingHorizontal: 10, color: THEME.text, textAlign: "right" },
  searchInput: {
    borderWidth: 1,
    borderColor: "#BFD4E7",
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    color: THEME.text,
    textAlign: "right",
    backgroundColor: "#FFFFFF",
  },
  itemsScroll: { flex: 1 },
  itemsArea: { flexGrow: 0, flexShrink: 1, minHeight: 0, marginTop: 0, paddingTop: 0, justifyContent: "flex-start" },
  itemsList: { flexGrow: 0, minHeight: 0, alignSelf: "stretch", marginTop: 0, paddingTop: 0 },
  itemsGrid: {
    paddingBottom: 8,
    paddingTop: 0,
    justifyContent: "flex-start",
    alignItems: "stretch",
    alignContent: "flex-start",
  },
  manualRow: {
    flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    marginBottom: 0,
    width: "100%",
  },
  itemCell: { flex: 1, minWidth: 0, paddingHorizontal: 3, marginBottom: 6, alignSelf: "flex-start" },
  itemCard: {
    minWidth: 120,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    minHeight: 102,
    paddingVertical: 8,
    paddingHorizontal: 9,
    gap: 4,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
  },
  itemCardGrid: {},
  itemCardList: { minHeight: 78, gap: 3 },
  itemCardCompact: { minHeight: 90, paddingVertical: 6, paddingHorizontal: 7, gap: 3 },
  itemCardComfortable: { minHeight: 112, paddingVertical: 9, paddingHorizontal: 9, gap: 4 },
  itemCardRush: { minHeight: 88, paddingVertical: 6, gap: 3 },
  itemCardAdded: { borderColor: "#16A34A", backgroundColor: "#F0FDF4" },
  emptyItems: { color: THEME.muted, fontWeight: "700", textAlign: "right", width: "100%", paddingVertical: 12 },
  itemTitle: { fontWeight: "800", color: THEME.text, textAlign: "right", minHeight: 34 },
  itemTitleList: { minHeight: 0, fontSize: 16 },
  itemTitleCompact: { minHeight: 22, fontSize: 14 },
  itemMeta: { color: THEME.muted, fontSize: 14, textAlign: "right" },
  itemMetaCompact: { fontSize: 12 },
  itemExciseBadge: {
    alignSelf: "flex-end",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  itemExciseBadgeText: { fontSize: 13, fontWeight: "800", textAlign: "right" },
  itemPrice: { color: THEME.accent, fontWeight: "900", textAlign: "right" },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: THEME.text, textAlign: "right" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" },
  linkButton: { paddingHorizontal: 8, paddingVertical: 4 },
  linkText: { color: THEME.primary, fontWeight: "800" },
  modGroup: { gap: 4 },
  modTitle: { fontWeight: "800", color: THEME.text, textAlign: "right" },
  modMeta: { color: THEME.muted, textAlign: "right" },
  modChip: { borderWidth: 1, borderColor: THEME.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  modChipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  modChipText: { color: THEME.text, fontSize: 14 },
  modChipTextActive: { color: "#fff" },
  actionsRow: { flexDirection: "row", gap: 6 },
  primaryButton: { flex: 1, backgroundColor: THEME.primary, borderRadius: 10, minHeight: 42, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "900" },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: THEME.primary, borderRadius: 10, minHeight: 42, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: THEME.primary, fontWeight: "900" },
  drawerToggle: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: THEME.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 20,
  },
  drawerToggleText: { color: "#fff", fontWeight: "900" },
  drawerBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 14,
  },
  editBanner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10 },
  editText: { color: "#92400E", fontWeight: "800", textAlign: "right", flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: {
    width: "92%",
    maxWidth: 560,
    backgroundColor: THEME.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
    maxHeight: "85%",
    gap: 8,
  },
  deferredPaymentModalCard: {
    maxWidth: 640,
    gap: 10,
  },
  deferredMetricsRow: {
    flexDirection: "row",
    gap: 6,
  },
  deferredMetricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#F8FBFF",
    gap: 2,
  },
  deferredMetricLabel: {
    color: THEME.muted,
    fontWeight: "700",
    textAlign: "right",
    fontSize: 14,
  },
  deferredMetricValue: {
    color: THEME.text,
    fontWeight: "900",
    textAlign: "right",
    fontSize: 16,
  },
  deferredPaidValue: {
    color: THEME.success,
  },
  deferredRemainingValue: {
    color: THEME.accent,
  },
  deferredMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  deferredMethodRow: {
    flexDirection: "row",
    gap: 6,
  },
  deferredMethodChip: {
    flex: 1,
    minHeight: 32,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  deferredMethodChipActive: {
    borderColor: THEME.primary,
    backgroundColor: "#EAF3FB",
  },
  deferredMethodChipText: {
    color: THEME.text,
    fontWeight: "800",
    fontSize: 13,
  },
  deferredMethodChipTextActive: {
    color: THEME.primary,
  },
  deferredAmountRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  deferredAmountInput: {
    flex: 1,
  },
  inlineCompactButton: {
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 8,
    backgroundColor: "#EEF6FF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineCompactButtonText: {
    color: THEME.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  deferredPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    backgroundColor: "#F9FBFE",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deferredPreviewValue: {
    color: THEME.text,
    fontWeight: "900",
    fontSize: 18,
  },
  deferredHistoryCard: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 8,
    gap: 6,
    backgroundColor: "#FFFFFF",
  },
  deferredPaymentsScroll: {
    maxHeight: 150,
  },
  deferredPaymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deferredPaymentMethod: {
    color: THEME.text,
    fontWeight: "800",
  },
  deferredPaymentAmount: {
    color: THEME.success,
    fontWeight: "900",
  },
  saleDrawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    flexDirection: "row",
  },
  saleDrawerBackdrop: {
    flex: 1,
  },
  saleDrawerPanel: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: THEME.card,
    borderLeftWidth: 1,
    borderLeftColor: THEME.border,
    padding: 12,
    gap: 8,
  },
  paymentDrawerPanelRight: {
    maxWidth: 560,
    borderLeftWidth: 1,
    borderLeftColor: THEME.border,
    borderRightWidth: 0,
  },
  paymentPanelScroll: { flex: 1 },
  paymentPanelContent: { gap: 8, paddingBottom: 24 },
  saleDrawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  saleMetaCard: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 10,
    gap: 2,
    backgroundColor: "#F8FBFF",
  },
  saleLinesScroll: { maxHeight: 250 },
  saleLineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  saleSummaryCard: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 8,
  },
  saleActionsColumn: { gap: 6 },
  splitPresetRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  customSplitRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  customSplitInput: { flex: 1, minHeight: 34 },
  splitPresetButton: {
    flex: 1,
    minHeight: 30,
    borderWidth: 1,
    borderColor: THEME.primary,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF6FF",
  },
  splitPresetText: { color: THEME.primary, fontWeight: "800", fontSize: 14 },
  splitLinesScroll: { maxHeight: 360 },
  splitLineCard: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 8,
    gap: 6,
  },
  listItemText: { color: THEME.text, fontWeight: "800", textAlign: "right" },
  listItemMeta: { color: THEME.muted, fontWeight: "700", textAlign: "right", fontSize: 14 },
  modalScroll: { maxHeight: 320 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetsRowBase: {
    marginTop: 8,
    gap: 10,
  },
  sheetsRowRtl: {
    flexDirection: "row",
  },
  sheetsRowLtr: {
    flexDirection: "row-reverse",
  },
  sheetsColumn: {
    flexDirection: "column",
  },
  sheetHalf: {
    flex: 1,
    minWidth: 0,
  },
  heldSheet: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    backgroundColor: THEME.card,
    overflow: "hidden",
  },
  heldSheetOpen: {
    backgroundColor: THEME.card,
  } as any,
  heldSheetHandle: {
    backgroundColor: "#ECF4FB",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  heldSheetHandleText: {
    color: THEME.primary,
    fontWeight: "900",
    textAlign: "right",
  },
  heldSheetBody: {
    padding: 12,
    gap: 8,
    maxHeight: 320,
  },
  heldOrdersScroll: {
    maxHeight: 300,
  },
  heldOrderRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  heldOrderInfo: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  heldOrderNo: {
    color: THEME.text,
    fontWeight: "900",
    textAlign: "right",
    fontSize: 16,
  },
  heldOrderMeta: {
    color: THEME.muted,
    fontWeight: "700",
    textAlign: "right",
    fontSize: 15,
  },
  heldOrderActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  heldOpenButton: {
    backgroundColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  heldOpenButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  deferredOpenButton: {
    backgroundColor: THEME.success,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 75,
    alignItems: "center",
    justifyContent: "center",
  },
  heldDeleteButton: {
    borderWidth: 1.5,
    borderColor: THEME.danger,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  heldDeleteButtonText: {
    color: THEME.danger,
    fontWeight: "800",
    fontSize: 15,
  },
  dangerActionButton: {
    flex: 1,
    backgroundColor: THEME.danger,
    borderRadius: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerActionButtonText: {
    color: "#fff",
    fontWeight: "900",
  },
  ordersTopBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 0,
    paddingVertical: 8,
    justifyContent: "flex-start",
  },
  ordersTopBarRtl: {
    flexDirection: "row",
  },
  ordersTopBarLtr: {
    flexDirection: "row-reverse",
  },
  ordersTopButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1.5,
    borderColor: THEME.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    gap: 4,
  },
  ordersTopButtonActive: {
    backgroundColor: THEME.primary,
    borderColor: THEME.primary,
  },
  ordersTopButtonDeferred: {
    borderColor: THEME.success,
  },
  ordersTopButtonDeferredActive: {
    backgroundColor: THEME.success,
    borderColor: THEME.success,
  },
  ordersTopButtonText: {
    color: THEME.primary,
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center",
  },
  ordersTopButtonTextActive: {
    color: "#FFFFFF",
  },
  ordersPopoverOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  ordersPopoverBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ordersPopoverCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "75%",
    backgroundColor: THEME.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    zIndex: 100,
  },
  ordersPopoverCardCompact: {
    maxHeight: "85%",
    borderRadius: 16,
    borderBottomWidth: 1,
    marginHorizontal: 12,
    marginBottom: 12,
  },
});
