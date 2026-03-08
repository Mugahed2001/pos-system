/**
 * Settings configuration and metadata
 */

export interface SettingSection {
  id: string;
  title: string;
  icon: string;
  iconLibrary?: "material" | "fontawesome" | "antdesign";
  description?: string;
}

export interface SettingItemConfig {
  key: string;
  label: string;
  description?: string;
  type: "toggle" | "numeric" | "choice";
  icon?: string;
  iconLibrary?: "material" | "fontawesome" | "antdesign";
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string; icon?: string }[];
  requiresServerSync?: boolean;
}

export const SETTINGS_SECTIONS: Record<string, SettingSection> = {
  appearance: {
    id: "appearance",
    title: "مظهر الواجهة",
    icon: "palette",
    iconLibrary: "material",
    description: "تخصيص مظهر وتصميم واجهة المستخدم",
  },
  sales: {
    id: "sales",
    title: "سلوك البيع والطلب",
    icon: "shopping-cart",
    iconLibrary: "material",
    description: "إعدادات تشغيل البيع والطلبات",
  },
  printing: {
    id: "printing",
    title: "الطباعة والتنبيهات",
    icon: "printer",
    iconLibrary: "material",
    description: "إعدادات الطباعة والإخطارات والنبهات",
  },
  defaults: {
    id: "defaults",
    title: "الافتراضيات",
    icon: "cog",
    iconLibrary: "material",
    description: "القيم الافتراضية للخدمة والإجراءات",
  },
};

export const APPEARANCE_SETTINGS: SettingItemConfig[] = [
  {
    key: "compactProductsGrid",
    label: "عرض أصناف مضغوط",
    description: "عرض الأصناف في شبكة مضغوطة توفر مساحة أكبر",
    type: "toggle",
    icon: "view-grid-compact",
    iconLibrary: "material",
  },
];

export const SALES_SETTINGS: SettingItemConfig[] = [
  {
    key: "requireTableForDineIn",
    label: "إجبار اختيار طاولة لطلبات داخل المطعم",
    description: "يتطلب تحديد طاولة لإتمام طلب داخلي",
    type: "toggle",
    icon: "table-furniture",
    iconLibrary: "material",
  },
  {
    key: "autoOpenPaymentAfterSale",
    label: "فتح صفحة المدفوعات تلقائيًا بعد البيع",
    description: "الانتقال التلقائي لصفحة المدفوعات بعد إضافة عناصر",
    type: "toggle",
    icon: "credit-card-fast",
    iconLibrary: "material",
  },
  {
    key: "enableServiceCharge",
    label: "تفعيل رسوم الخدمة",
    description: "السماح بإضافة رسوم الخدمة على الطلبات",
    type: "toggle",
    icon: "percent",
    iconLibrary: "material",
    requiresServerSync: true,
  },
  {
    key: "serviceChargePercent",
    label: "نسبة رسوم الخدمة (%)",
    description: "تحديد نسبة مئوية لرسوم الخدمة",
    type: "numeric",
    icon: "percent-outline",
    iconLibrary: "material",
    min: 0,
    max: 100,
    requiresServerSync: true,
  },
  {
    key: "deliveryFeeAmount",
    label: "رسوم التوصيل",
    description: "تحديد مبلغ رسوم التوصيل لقناة التوصيل",
    type: "numeric",
    icon: "truck-delivery-outline",
    iconLibrary: "material",
    min: 0,
    max: 1000,
    requiresServerSync: true,
  },
  {
    key: "showHeldOrdersBar",
    label: "إظهار شريط الطلبات المعلقة",
    description: "عرض شريط به الطلبات المعلقة في الأعلى",
    type: "toggle",
    icon: "pause-circle",
    iconLibrary: "material",
    requiresServerSync: true,
  },
  {
    key: "showDeferredOrdersBar",
    label: "إظهار شريط الطلبات الآجلة",
    description: "عرض شريط به الطلبات المجدولة مسبقًا",
    type: "toggle",
    icon: "clock-outline",
    iconLibrary: "material",
    requiresServerSync: true,
  },
  {
    key: "autoFocusSearch",
    label: "تركيز تلقائي على البحث عند فتح POS",
    description: "تركيز المؤشر على حقل البحث عند تفتيح POS",
    type: "toggle",
    icon: "magnify",
    iconLibrary: "material",
  },
  {
    key: "dineInPaymentTiming",
    label: "وقت الدفع داخل المطعم",
    description: "تحديد موعد الدفع بالنسبة للوجبة",
    type: "choice",
    icon: "clock-check",
    iconLibrary: "material",
    options: [
      { label: "الدفع مقدما", value: "before_meal", icon: "cash-multiple" },
      { label: "الدفع الآجل", value: "after_meal", icon: "check-circle" },
    ],
    requiresServerSync: true,
  },
];

export const PRINTING_SETTINGS: SettingItemConfig[] = [
  {
    key: "autoPrintReceipt",
    label: "طباعة إيصال تلقائي بعد إتمام البيع",
    description: "طباعة الإيصال تلقائيًا عند اكتمال البيع",
    type: "toggle",
    icon: "printer-check",
    iconLibrary: "material",
  },
  {
    key: "soundAlerts",
    label: "تفعيل تنبيهات صوتية",
    description: "تشغيل أصوات التنبيه للأحداث المهمة",
    type: "toggle",
    icon: "bell-ring",
    iconLibrary: "material",
  },
  {
    key: "receiptCopies",
    label: "عدد نسخ الإيصال الافتراضي",
    description: "عدد نسخ الإيصال التي سيتم طباعتها",
    type: "numeric",
    icon: "content-duplicate",
    iconLibrary: "material",
    min: 1,
    max: 10,
  },
];

export const DEFAULTS_SETTINGS: SettingItemConfig[] = [
  {
    key: "defaultSeats",
    label: "عدد المقاعد الافتراضي",
    description: "عدد المقاعد الافتراضي عند إنشاء طلب جديد",
    type: "numeric",
    icon: "chair-rolling",
    iconLibrary: "material",
    min: 1,
    max: 100,
  },
];

export const ALL_SETTINGS_BY_SECTION = {
  appearance: APPEARANCE_SETTINGS,
  sales: SALES_SETTINGS,
  printing: PRINTING_SETTINGS,
  defaults: DEFAULTS_SETTINGS,
};
