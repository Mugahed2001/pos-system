# Settings Feature - Quick Start Guide

## 📍 Overview

The Settings feature provides a professional, modular system for managing and presenting cashier UI settings in the POS application.

## 🚀 Quick Start

### Using the Settings Page
```tsx
import { SettingsPage } from "@/features/settings";

export function App() {
  return <SettingsPage />;
}
```

That's it! The page comes with:
- ✅ All existing settings already configured
- ✅ Local storage persistence
- ✅ Server synchronization
- ✅ Professional UI with sections
- ✅ Light/dark mode support

## 🧩 Component Usage

### Using Individual Components

```tsx
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsNumericInput,
  SettingsChoiceRow,
  SettingsModeToggle,
} from "@/features/settings/components";

// Example: Create a custom settings page
export function CustomSettings() {
  const [settings, setSettings] = useState({
    autoSave: true,
    fontSize: 14,
    theme: "light",
  });

  return (
    <SettingsSection icon="🎨" title="Display">
      <SettingsModeToggle
        value={settings.theme as "light" | "dark"}
        onValueChange={(theme) => 
          setSettings({ ...settings, theme })
        }
      />

      <SettingsNumericInput
        label="Font Size"
        value={settings.fontSize}
        min={10}
        max={20}
        onValueChange={(size) =>
          setSettings({ ...settings, fontSize: size })
        }
      />

      <SettingsToggleRow
        label="Auto-save changes"
        value={settings.autoSave}
        onValueChange={(autoSave) =>
          setSettings({ ...settings, autoSave })
        }
      />
    </SettingsSection>
  );
}
```

## 🪝 Working with Hooks

### useCashierSettings Hook
```tsx
import { useCashierSettings } from "@/features/settings/hooks";

export function MyComponent() {
  const {
    settings,           // Current settings
    branchId,          // Branch identifier
    isLoading,         // Initial load state
    updateSetting,     // Update single setting
    resetToDefaults,   // Reset all to defaults
  } = useCashierSettings();

  // Access setting
  console.log(settings.autoPrintReceipt);

  // Update setting (auto-persisted)
  const toggleAutoPrint = () => {
    updateSetting("autoPrintReceipt", !settings.autoPrintReceipt);
  };

  // Reset everything
  const handleReset = () => {
    resetToDefaults();
  };

  if (isLoading) return <Text>Loading...</Text>;

  return (
    <Pressable onPress={toggleAutoPrint}>
      <Text>
        Auto-print: {settings.autoPrintReceipt ? "ON" : "OFF"}
      </Text>
    </Pressable>
  );
}
```

### useSettingsSync Hook
```tsx
import { useSettingsSync } from "@/features/settings/hooks";
import { useCashierSettings } from "@/features/settings/hooks";

export function SyncSettings() {
  const { settings, branchId } = useCashierSettings();
  const { syncServerSettings, isSyncing } = useSettingsSync();

  const handleSync = async () => {
    const success = await syncServerSettings(branchId, {
      showHeldOrdersBar: settings.showHeldOrdersBar,
      showDeferredOrdersBar: settings.showDeferredOrdersBar,
      enableServiceCharge: settings.enableServiceCharge,
      dineInPaymentTiming: settings.dineInPaymentTiming,
    });

    if (success) {
      console.log("✓ Settings synced!");
    } else {
      console.log("✗ Sync failed");
    }
  };

  return (
    <Pressable onPress={handleSync} disabled={isSyncing}>
      <Text>{isSyncing ? "Syncing..." : "Sync Settings"}</Text>
    </Pressable>
  );
}
```

## ⚙️ Adding New Settings

### Step 1: Update Type Definition
Edit `hooks/useCashierSettings.ts`:
```typescript
type CashierSettings = {
  // ... existing
  myNewSetting: string;  // Add your new setting
};

const DEFAULT_SETTINGS: CashierSettings = {
  // ... existing
  myNewSetting: "default-value",
};
```

### Step 2: Add to Configuration
Edit `constants/settingsConfig.ts`:
```typescript
const MY_SECTION_SETTINGS: SettingItemConfig[] = [
  {
    key: "myNewSetting",
    label: "My Setting Label",
    description: "What this setting does",
    type: "choice",  // or "toggle" or "numeric"
    options: [
      { label: "Option 1", value: "opt1" },
      { label: "Option 2", value: "opt2" },
    ],
    requiresServerSync: false,  // or true if needs server sync
  },
];

// Register in ALL_SETTINGS_BY_SECTION if needed
```

### Step 3: Use in SettingsPage
The new setting will automatically appear if you map the config!

```typescript
{MY_SECTION_SETTINGS.map((setting) => (
  <SettingsChoiceRow
    key={setting.key}
    label={setting.label}
    description={setting.description}
    value={settings[setting.key] as string}
    options={setting.options!}
    onValueChange={(value) =>
      updateSetting(setting.key as keyof typeof settings, value)
    }
  />
))}
```

## 🎨 Customizing Components

### Creating a Custom Setting Component
```tsx
import { StyleSheet, View, Text, Pressable } from "react-native";
import { useAppTheme } from "@/shared/theme";

interface CustomToggleProps {
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
}

export function CustomToggle({ label, value, onToggle }: CustomToggleProps) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      style={[styles.button, value && styles.buttonActive]}
      onPress={() => onToggle(!value)}
    >
      <Text style={styles.label}>
        {label}: {value ? "ON" : "OFF"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 10, borderRadius: 8, borderWidth: 1 },
  buttonActive: { backgroundColor: "blue" },
  label: { fontWeight: "600" },
});
```

## 📝 Best Practices

### ✅ DO

- ✅ Use `useCashierSettings` hook for state management
- ✅ Keep components small and focused
- ✅ Use configuration-driven approach
- ✅ Add descriptions to all settings
- ✅ Set `requiresServerSync: true` only when needed
- ✅ Use semantic icons (🎨, 🛒, 🖨️)
- ✅ Memoize styles with `useMemo`

### ❌ DON'T

- ❌ Hard-code setting values in components
- ❌ Mix business logic with UI
- ❌ Create duplicate components
- ❌ Sync all settings to server (only what's needed)
- ❌ Forget to add descriptions
- ❌ Use generic names for settings

## 🧪 Testing

### Testing Components
```typescript
import { render, screen, fireEvent } from "@testing-library/react-native";
import { SettingsToggleRow } from "@/features/settings/components";

describe("SettingsToggleRow", () => {
  it("renders label and calls callback", () => {
    const mockFn = jest.fn();
    render(
      <SettingsToggleRow
        label="Test Setting"
        value={false}
        onValueChange={mockFn}
      />
    );
    
    const toggle = screen.getByRole("switch");
    fireEvent.press(toggle);
    
    expect(mockFn).toHaveBeenCalledWith(true);
  });
});
```

### Testing Hooks
```typescript
import { renderHook, act } from "@testing-library/react-hooks";
import { useCashierSettings } from "@/features/settings/hooks";

describe("useCashierSettings", () => {
  it("updates setting and persists", async () => {
    const { result } = renderHook(() => useCashierSettings());

    await act(async () => {
      result.current.updateSetting("autoPrintReceipt", true);
    });

    expect(result.current.settings.autoPrintReceipt).toBe(true);
  });
});
```

## 📦 Exports

### From `@/features/settings`
```typescript
export { SettingsPage } from "./ui/SettingsPage";
```

### From `@/features/settings/components`
```typescript
export { SettingsSection };
export { SettingsToggleRow };
export { SettingsNumericInput };
export { SettingsChoiceRow };
export { SettingsModeToggle };
```

### From `@/features/settings/hooks`
```typescript
export { useCashierSettings };
export { useSettingsSync };
export type { CashierSettings };
export { DEFAULT_SETTINGS };
```

### From `@/features/settings/constants`
```typescript
export { SETTINGS_SECTIONS };
export { APPEARANCE_SETTINGS };
export { SALES_SETTINGS };
export { PRINTING_SETTINGS };
export { DEFAULTS_SETTINGS };
export { SETTINGS_STRINGS };
```

## 🔗 Related Documentation

- 📖 [IMPROVEMENTS.md](./IMPROVEMENTS.md) - Detailed improvement guide (English)
- 📖 [IMPROVEMENTS_AR.md](./IMPROVEMENTS_AR.md) - تحسينات مفصلة (العربية)
- 📖 [COMPARISON.md](./COMPARISON.md) - Before/After comparison

## 🆘 Troubleshooting

### Settings not persisting?
- Check `AsyncStorage` is working
- Verify `POS_CASHIER_SETTINGS_KEY` constant
- Check browser console for errors

### Server sync failing?
- Verify `branchId` is set
- Check network connection
- Verify API endpoint
- Check error logs in notification

### Styles not applying?
- Verify `useAppTheme()` is available
- Check theme context is wrapped
- Use `useMemo` for style sheets

## 📞 Support

For issues or questions:
1. Check this Quick Start guide
2. Review component examples in source code
3. Check IMPROVEMENTS.md for detailed docs
4. Review test files for usage patterns

---

**Last Updated**: 2026-02-26  
**Status**: ✅ Production Ready  
**Version**: 2.0
