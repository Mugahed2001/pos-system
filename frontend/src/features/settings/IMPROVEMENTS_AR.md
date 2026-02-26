# تحسينات تصميم الإعدادات - Settings UI Improvements

## نظرة عامة | Overview

تم تحسين صفحة الإعدادات بشكل احترافي ومتناسق مع الهندسة المعمارية التالية:

### ✨ المميزات الجديدة | New Features

1. **مكونات قابلة لإعادة الاستخدام (Reusable Components)**
   - `SettingsSection`: لف كل قسم بتصميم متناسق
   - `SettingsToggleRow`: تبديل الخيارات مع وصف
   - `SettingsNumericInput`: إدخال الأرقام بزر الزيادة/الإنقاص
   - `SettingsChoiceRow`: اختيار من خيارات متعددة
   - `SettingsModeToggle`: تبديل نمط الواجهة (النهاري/الليلي)

2. **إدارة الحالة المركزية (Centralized State Management)**
   - `useCashierSettings`: إدارة حالة الإعدادات المحلية
   - `useSettingsSync`: مزامنة الإعدادات مع السيرفر

3. **هيكل منظم (Organized Structure)**
   - `constants/settingsConfig.ts`: تكوين الإعدادات والأقسام
   - `constants/strings.ts`: النصوص والرسائل
   - `hooks/`: الـ hooks المخصصة
   - `components/`: المكونات البصرية

### 📁 هيكل المجلد | Folder Structure

```
frontend/src/features/settings/
├── api/
│   └── cashierSettingsApi.ts
├── components/
│   ├── SettingsSection.tsx
│   ├── SettingsToggleRow.tsx
│   ├── SettingsNumericInput.tsx
│   ├── SettingsChoiceRow.tsx
│   ├── SettingsModeToggle.tsx
│   └── index.ts
├── constants/
│   ├── settingsConfig.ts        (جديد)
│   ├── strings.ts               (جديد)
│   └── index.ts                 (جديد)
├── hooks/
│   ├── useCashierSettings.ts     (جديد)
│   ├── useSettingsSync.ts        (جديد)
│   └── index.ts                 (جديد)
├── ui/
│   ├── SettingsPage.tsx          (محدث)
│   └── SettingsPageNew.tsx       (النسخة الجديدة)
└── index.ts
```

## التحسينات الرئيسية | Key Improvements

### 1. **الفصل المخاوف (Separation of Concerns)**
```
قبل (Before):
- كل المنطق والـ UI مختلط في ملف واحد

بعد (After):
- منطق الإعدادات في hooks
- مزامنة السيرفر في hook منفصل
- المكونات UI قابلة لإعادة الاستخدام
- التكوينات في ملف ثابت
```

### 2. **إعادة استخدام المكونات (Component Reusability)**
```tsx
// قبل: تكرار الكود
<View style={styles.row}>
  <Text style={styles.label}>{label}</Text>
  <Switch value={value} onValueChange={onValueChange} />
</View>

// بعد: مكون موحد
<SettingsToggleRow
  label={label}
  description={description}
  value={value}
  onValueChange={onValueChange}
/>
```

### 3. **تحسين التجربة البصرية (Visual UX)**
- ✅ إضافة الرموز التعبيرية للأقسام
- ✅ وصف لكل إعداد
- ✅ حالة تحميل (Loading State)
- ✅ حالة معطلة (Disabled State)
- ✅ تنبيهات ورسائل محسّنة

### 4. **أداء أفضل (Performance)**
- ✅ استخدام `useMemo` لتقليل إعادة التصريف
- ✅ عزل حالة الإعدادات
- ✅ تحديث انتقائي فقط للإعدادات المتغيرة

### 5. **سهولة الصيانة (Maintainability)**
- ✅ تكوين مركزي للإعدادات
- ✅ سهولة إضافة إعدادات جديدة
- ✅ اختبار سهل للمكونات المفصولة

## كيفية إضافة إعدادات جديدة | Adding New Settings

### الخطوة 1: إضافة في `settingsConfig.ts`
```typescript
// 1. أضف إلى نوع CashierSettings في hooks/useCashierSettings.ts
type CashierSettings = {
  // ... الإعدادات الموجودة
  myNewSetting: boolean;
};

// 2. أضف القيمة الافتراضية
DEFAULT_SETTINGS: CashierSettings = {
  // ... بقية الإعدادات
  myNewSetting: false,
};

// 3. أضف في الثابت المناسب
export const MY_SECTION_SETTINGS: SettingItemConfig[] = [
  {
    key: "myNewSetting",
    label: "تصنيف الإعداد الجديد",
    description: "وصف الإعداد",
    type: "toggle", // أو "numeric" أو "choice"
    requiresServerSync: false,
  },
];
```

### الخطوة 2: استخدم في الصفحة
```typescript
<SettingsSection>
  {MY_SECTION_SETTINGS.map((setting) => (
    <SettingsToggleRow
      key={setting.key}
      label={setting.label}
      value={settings[setting.key as keyof typeof settings] as boolean}
      onValueChange={(value) =>
        handleToggleSetting(setting.key as keyof typeof settings, value)
      }
    />
  ))}
</SettingsSection>
```

## الـ API | APIs

### `useCashierSettings()`
```typescript
const {
  settings,           // الإعدادات الحالية
  branchId,          // معرف الفرع
  isLoading,         // حالة التحميل
  updateSetting,     // تحديث إعداد واحد
  resetToDefaults,   // استعادة الافتراضيات
} = useCashierSettings();
```

### `useSettingsSync()`
```typescript
const {
  syncServerSettings,  // دالة المزامنة
  isSyncing,          // حالة المزامنة
} = useSettingsSync();
```

### المكونات | Components

#### `SettingsSection`
```typescript
<SettingsSection
  sectionId="sales"
  icon="🛒"
  title="سلوك البيع"
  description="إعدادات تشغيل البيع"
>
  {/* المحتوى هنا */}
</SettingsSection>
```

#### `SettingsToggleRow`
```typescript
<SettingsToggleRow
  label="الإعداد"
  description="وصف الإعداد"
  value={true}
  onValueChange={(v) => console.log(v)}
  disabled={false}
/>
```

#### `SettingsNumericInput`
```typescript
<SettingsNumericInput
  label="القيمة"
  description="وصف"
  value={5}
  min={1}
  max={10}
  onValueChange={(v) => console.log(v)}
/>
```

#### `SettingsChoiceRow`
```typescript
<SettingsChoiceRow
  label="الخيار"
  description="اختر واحد"
  value="option1"
  options={[
    { label: "الخيار 1", value: "option1" },
    { label: "الخيار 2", value: "option2" },
  ]}
  onValueChange={(v) => console.log(v)}
/>
```

## ملاحظات مهمة | Important Notes

1. **المزامنة مع السيرفر**
   - فقط الإعدادات مع `requiresServerSync: true` سيتم مزامنتها
   - إذا فشلت المزامنة، سيتم عرض إشعار للمستخدم

2. **التخزين المحلي**
   - تُحفظ الإعدادات تلقائياً في `localStorage` / `AsyncStorage`
   - يتم تحميلها عند فتح الصفحة

3. **الحالات الخاصة**
   - إذا لم يتم تحديد فرع، لن يتم السماح بمزامنة الإعدادات
   - معالجة الأخطاء تتم تلقائياً مع إخطار المستخدم

## الاختبار | Testing

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("should render settings sections", () => {
    render(<SettingsPage />);
    expect(screen.getByText("⚙️ إعدادات الكاشير")).toBeInTheDocument();
  });

  it("should update toggle setting", () => {
    render(<SettingsPage />);
    const toggle = screen.getByRole("switch");
    fireEvent.press(toggle);
    // ... assertions
  });
});
```

## الإصدار التالي | Future Enhancements

- [ ] إضافة إعدادات متقدمة (Advanced Settings)
- [ ] تصدير واستيراد الإعدادات
- [ ] سجل التغييرات (Change History)
- [ ] إعدادات اللغة والتوقيت
- [ ] ملفات شخصية متعددة
