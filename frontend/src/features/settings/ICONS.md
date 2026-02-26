# Professional Icons Integration - آيقونات احترافية

## 📋 Overview

تم تحسين واجهة الإعدادات باستخدام أيقونات احترافية من مكتبة `@expo/vector-icons` بدلاً من الرموز التعبيرية (Emoji).

## 🎨 Icon System

### المكتبات المستخدمة

```typescript
import { 
  MaterialCommunityIcons,  // الخيار الأساسي - 7000+ أيقونة
  FontAwesome5,           // خيار بديل - أيقونات عملية
  AntDesign              // خيار بديل - أيقونات حديثة
} from "@expo/vector-icons";
```

### المميزات

✅ **أيقونات احترافية** - جودة عالية وواضحة  
✅ **قابلة للتخصيص** - حجم واللون سهل التعديل  
✅ **متعددة المكتبات** - اختر من آلاف الأيقونات  
✅ **RTL جاهز** - دعم كامل للعربية  
✅ **أداء عالي** - لا أوزان إضافية  

## 🎯 أيقونات الأقسام

| القسم | الأيقونة | اسم الأيقونة | المكتبة |
|------|---------|------------|--------|
| **Appearance** | 🎨 | `palette` | MaterialCommunityIcons |
| **Sales & Orders** | 🛒 | `shopping-cart` | MaterialCommunityIcons |
| **Printing & Alerts** | 🖨️ | `printer` | MaterialCommunityIcons |
| **Defaults** | ⚙️ | `cog` | MaterialCommunityIcons |

## ⚙️ أيقونات الإعدادات

### Appearance Settings
```typescript
{
  key: "compactProductsGrid",
  icon: "view-grid-compact",
  // عرض الأصناف في شبكة مضغوطة
}
```

### Sales Settings
```typescript
{
  key: "requireTableForDineIn",
  icon: "table-furniture",
  // إجبار اختيار الطاولة
},
{
  key: "autoOpenPaymentAfterSale",
  icon: "credit-card-fast",
  // فتح المدفوعات تلقائياً
},
{
  key: "enableServiceCharge",
  icon: "percent",
  // تفعيل رسوم الخدمة
},
{
  key: "showHeldOrdersBar",
  icon: "pause-circle",
  // إظهار الطلبات المعلقة
},
{
  key: "showDeferredOrdersBar",
  icon: "clock-outline",
  // إظهار الطلبات الآجلة
},
{
  key: "autoFocusSearch",
  icon: "magnify",
  // تركيز البحث
},
{
  key: "dineInPaymentTiming",
  icon: "clock-check",
  options: [
    { label: "قبل الأكل", icon: "cash-multiple" },
    { label: "بعد الأكل", icon: "check-circle" },
  ]
  // وقت الدفع
}
```

### Printing Settings
```typescript
{
  key: "autoPrintReceipt",
  icon: "printer-check",
  // طباعة تلقائية
},
{
  key: "soundAlerts",
  icon: "bell-ring",
  // تنبيهات صوتية
},
{
  key: "receiptCopies",
  icon: "content-duplicate",
  // عدد النسخ
}
```

### Defaults Settings
```typescript
{
  key: "defaultSeats",
  icon: "chair-rolling",
  // عدد المقاعد الافتراضي
}
```

## 🛠️ Using Icons in Components

### 1. Component Icon - مكون Icon منفصل

```tsx
import { Icon } from "@/features/settings/components";

<Icon
  name="palette"
  library="material"
  size={24}
  color="#2563eb"
/>
```

### 2. في SettingsSection

```tsx
<SettingsSection
  icon="shopping-cart"
  iconLibrary="material"
  title="Sales Settings"
  description="Configure order behavior"
>
  {/* Content */}
</SettingsSection>
```

### 3. في SettingsModeToggle

```tsx
<SettingsModeToggle value={mode} onValueChange={setMode} />
// تستخدم white-balance-sunny و moon-waning-crescent
```

### 4. في SettingsToggleRow

```tsx
<SettingsToggleRow
  label="Auto Print"
  icon="printer-check"
  iconLibrary="material"
  value={value}
  onValueChange={onChange}
/>
```

### 5. في الأزرار

```tsx
<Pressable style={styles.resetButton} onPress={handleReset}>
  <View style={styles.resetButtonContent}>
    <Icon name="restart" library="material" size={18} color={theme.warning} />
    <Text>إعادة تعيين</Text>
  </View>
</Pressable>
```

## 📚 Popular Icon Names

### MaterialCommunityIcons (الأساسي)

```typescript
// UI Actions
"content-save"        // Save
"restart"            // Reset/Refresh
"delete"             // Delete
"plus"               // Add
"minus"              // Remove
"close-circle"       // Close
"check-circle"       // Confirm
"information"        // Info

// Settings
"cog"                // Settings
"palette"            // Colors/Appearance
"percent"            // Percentage/Service Charge
"printer"            // Print/Printing
"bell-ring"          // Alerts/Notifications
"magnify"            // Search

// Commerce
"shopping-cart"      // Shopping/Orders
"credit-card-fast"   // Payment/Cards
"cash-multiple"      // Cash
"table-furniture"    // Tables

// Time/Schedule
"clock-outline"      // Clock
"pause-circle"       // Pause/Hold
"clock-check"        // Check/Confirm

// UI Icons
"chair-rolling"      // Seats/Chairs
"printer-check"      // Check/Confirmation
"view-grid-compact"  // Compact Grid
"content-duplicate"  // Copy/Duplicate
```

### AntDesign

```typescript
"setting"            // Settings
"shoppingcart"       // Shopping Cart
"printer"            // Printer
"reload"             // Reload/Reset
"delete"             // Delete
"plus"               // Plus
"minus"              // Minus
"check"              // Check
"close"              // Close
```

### FontAwesome5

```typescript
"cog"                // Settings
"shopping-cart"      // Shopping
"print"              // Print
"sync-alt"           // Sync/Refresh
"trash"              // Delete
"plus"               // Plus
"minus"              // Minus
"check"              // Check
"times"              // Close
```

## 🔍 Finding More Icons

### Browse Available Icons

```typescript
// MaterialCommunityIcons: ~7000 icons
// https://materialdesignicons.com/

// FontAwesome5: ~1600 icons
// https://fontawesome.com/icons

// AntDesign: ~200+ icons
// https://ant.design/components/icon
```

### Use Icon Browser in React Native

```typescript
// حفظ هذا الكود واستخدمه للعثور على الأيقونات
import { MaterialCommunityIcons } from "@expo/vector-icons";

export function IconBrowser() {
  return (
    <ScrollView>
      {IconNames.map((name) => (
        <View key={name} style={{ flexDirection: "row", padding: 10 }}>
          <MaterialCommunityIcons name={name} size={24} />
          <Text>{name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

## 🎨 Color Consistency

```typescript
// الألوان المستخدمة
const colors = {
  primary: theme.primaryBlue,      // الأزرق الأساسي
  text: theme.textMain,            // النص الرئيسي
  secondary: theme.textSub,        // النص الثانوي
  warning: theme.warning,          // التحذير (الأحمر)
  success: theme.success,          // النجاح (الأخضر)
  background: theme.background,    // الخلفية
};
```

## 📐 Size Guidelines

```typescript
// الأحجام القياسية
const sizes = {
  xs: 16,      // Small indicators
  sm: 18,      // Button icons
  base: 24,    // Default size
  lg: 28,      // Section headers
  xl: 32,      // Page headers
  2xl: 40,     // Large icons
};
```

## ✨ Best Practices

### ✅ يفضل

```tsx
// ✓ استخدم أسماء أيقونات واضحة
<Icon name="check-circle" />

// ✓ حدد المكتبة بوضوح
<Icon name="palette" library="material" />

// ✓ استخدم ألوان متسقة
<Icon name="save" color={theme.primaryBlue} />

// ✓ وفّر حجماً مناسباً
<Icon name="settings" size={24} />
```

### ❌ تجنب

```tsx
// ✗ استخدم أسماء غير دقيقة
<Icon name="something" />

// ✗ لا تخضع للمكتبة الافتراضية دون قصد
<Icon name="unknown-icon" />

// ✗ لا تستخدم ألوان عشوائية
<Icon name="save" color="red" />
```

## 🚀 Performance Tips

1. **استخدم useMemo** لـ style sheets
   ```tsx
   const styles = useMemo(() => createStyles(theme), [theme]);
   ```

2. **لا تصنع أيقونات فقط** - استخدم أيقونات موجودة
   ```tsx
   ✓ <Icon name="check-circle" />
   ✗ <Image source={require('./assets/check.png')} />
   ```

3. **وفّر ألوان تباين** للوضع الليلي والنهاري
   ```tsx
   color={value ? "#fff" : theme.textMain}
   ```

## 🔄 Migration from Emoji

### السابق (Emoji)
```tsx
<Text style={styles.icon}>🎨</Text>
<Text style={styles.icon}>🛒</Text>
<Text style={styles.icon}>🖨️</Text>
```

### الجديد (Icons)
```tsx
<Icon name="palette" size={24} color={theme.primaryBlue} />
<Icon name="shopping-cart" size={24} color={theme.primaryBlue} />
<Icon name="printer" size={24} color={theme.primaryBlue} />
```

## 📱 Testing Icons

```typescript
import { render, screen } from "@testing-library/react-native";
import { Icon } from "@/features/settings/components";

describe("Icon Component", () => {
  it("renders icon with correct name", () => {
    render(<Icon name="check-circle" size={24} />);
    // Icon component rendered successfully
  });

  it("applies color correctly", () => {
    const { getByTestId } = render(
      <Icon name="check-circle" color="blue" testID="icon" />
    );
    expect(getByTestId("icon")).toHaveStyle({ color: "blue" });
  });
});
```

## 📞 Troubleshooting

### الأيقونة لا تظهر
```typescript
// السبب الأساسي: اسم الأيقونة خاطئ
// الحل: تحقق من الاسم في https://materialdesignicons.com/

// أو جرب أيقونة أخرى
<Icon name="check" library="antdesign" />
```

### الأيقونة صغيرة جداً أو كبيرة جداً
```typescript
// استخدم حجماً مناسباً
<Icon name="palette" size={24} />  // Default
<Icon name="palette" size={32} />  // Larger
<Icon name="palette" size={16} />  // Smaller
```

### عدم ظهور اللون
```typescript
// تأكد من أن اللون صحيح
<Icon
  name="palette"
  color={theme.primaryBlue}  // ✓ Correct
  // color="red" would also work
/>
```

## 📖 Resources

- **@expo/vector-icons**: https://docs.expo.dev/guides/icons/
- **Material Design Icons**: https://materialdesignicons.com/
- **FontAwesome Icons**: https://fontawesome.com/icons
- **AntDesign Icons**: https://ant.design/components/icon/

---

**Version**: 2.0  
**Last Updated**: 2026-02-26  
**Status**: ✅ Production Ready
