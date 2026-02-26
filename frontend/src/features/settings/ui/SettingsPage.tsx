import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../../shared/theme";
import { useAuth } from "../../../features/auth";
import { useNotification } from "../../../shared/notifications";
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsChoiceRow,
  SettingsNumericInput,
  SettingsModeToggle,
  Icon,
} from "../components";
import { useCashierSettings } from "../hooks/useCashierSettings";
import { useSettingsSync } from "../hooks/useSettingsSync";
import {
  SETTINGS_SECTIONS,
  APPEARANCE_SETTINGS,
  SALES_SETTINGS,
  PRINTING_SETTINGS,
  DEFAULTS_SETTINGS,
} from "../constants";

export function SettingsPage() {
  const { user } = useAuth();
  const { theme, mode, setMode } = useAppTheme();
  const notify = useNotification();
  const { settings, branchId, isLoading, updateSetting, resetToDefaults } = useCashierSettings();
  const { syncServerSettings, isSyncing } = useSettingsSync();

  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleToggleSetting = async (key: keyof typeof settings, value: boolean) => {
    updateSetting(key, value);

    // Sync server-dependent settings
    const requiresSync =
      key === "showHeldOrdersBar" ||
      key === "showDeferredOrdersBar" ||
      key === "enableServiceCharge";

    if (requiresSync) {
      await syncServerSettings(branchId, {
        showHeldOrdersBar: key === "showHeldOrdersBar" ? value : settings.showHeldOrdersBar,
        showDeferredOrdersBar: key === "showDeferredOrdersBar" ? value : settings.showDeferredOrdersBar,
        enableServiceCharge: key === "enableServiceCharge" ? value : settings.enableServiceCharge,
        dineInPaymentTiming: settings.dineInPaymentTiming,
      });
    }
  };

  const handlePaymentTimingChange = async (timing: "before_meal" | "after_meal") => {
    updateSetting("dineInPaymentTiming", timing);
    await syncServerSettings(branchId, {
      showHeldOrdersBar: settings.showHeldOrdersBar,
      showDeferredOrdersBar: settings.showDeferredOrdersBar,
      enableServiceCharge: settings.enableServiceCharge,
      dineInPaymentTiming: timing,
    });
  };

  const handleResetSettings = () => {
    resetToDefaults();
    notify.success("تمت استعادة الإعدادات الافتراضية.");
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>جاري تحميل الإعدادات...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* Page Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Icon name="cog" library="material" size={32} color={theme.primaryBlue} />
          <Text style={styles.title}>إعدادات الكاشير</Text>
        </View>
        <Text style={styles.subtitle}>
          إعدادات تشغيل نقطة البيع للمستخدم: {user?.username ?? "كاشير"}
        </Text>
      </View>

      {/* Appearance Section */}
      <SettingsSection
        sectionId="appearance"
        icon={SETTINGS_SECTIONS.appearance.icon}
        iconLibrary={SETTINGS_SECTIONS.appearance.iconLibrary as "material" | "fontawesome" | "antdesign"}
        title={SETTINGS_SECTIONS.appearance.title}
        description={SETTINGS_SECTIONS.appearance.description}
      >
        <SettingsModeToggle value={mode} onValueChange={setMode} />

        {APPEARANCE_SETTINGS.map((setting) => (
          <SettingsToggleRow
            key={setting.key}
            label={setting.label}
            description={setting.description}
            value={settings[setting.key as keyof typeof settings] as boolean}
            onValueChange={(value) =>
              handleToggleSetting(setting.key as keyof typeof settings, value)
            }
            disabled={isSyncing}
          />
        ))}
      </SettingsSection>

      {/* Sales & Orders Section */}
      <SettingsSection
        sectionId="sales"
        icon={SETTINGS_SECTIONS.sales.icon}
        iconLibrary={SETTINGS_SECTIONS.sales.iconLibrary as "material" | "fontawesome" | "antdesign"}
        title={SETTINGS_SECTIONS.sales.title}
        description={SETTINGS_SECTIONS.sales.description}
      >
        {SALES_SETTINGS.map((setting) => {
          if (setting.type === "toggle") {
            return (
              <SettingsToggleRow
                key={setting.key}
                label={setting.label}
                description={setting.description}
                value={settings[setting.key as keyof typeof settings] as boolean}
                onValueChange={(value) =>
                  setting.key === "dineInPaymentTiming"
                    ? handlePaymentTimingChange(value as unknown as "before_meal" | "after_meal")
                    : handleToggleSetting(setting.key as keyof typeof settings, value)
                }
                disabled={isSyncing}
              />
            );
          }

          if (setting.type === "choice") {
            return (
              <SettingsChoiceRow
                key={setting.key}
                label={setting.label}
                description={setting.description}
                value={settings[setting.key as keyof typeof settings] as string}
                options={setting.options || []}
                onValueChange={async (value) => {
                  await handlePaymentTimingChange(value as "before_meal" | "after_meal");
                }}
                disabled={isSyncing}
              />
            );
          }

          return null;
        })}
      </SettingsSection>

      {/* Printing & Alerts Section */}
      <SettingsSection
        sectionId="printing"
        icon={SETTINGS_SECTIONS.printing.icon}
        iconLibrary={SETTINGS_SECTIONS.printing.iconLibrary as "material" | "fontawesome" | "antdesign"}
        title={SETTINGS_SECTIONS.printing.title}
        description={SETTINGS_SECTIONS.printing.description}
      >
        {PRINTING_SETTINGS.map((setting) => {
          if (setting.type === "toggle") {
            return (
              <SettingsToggleRow
                key={setting.key}
                label={setting.label}
                description={setting.description}
                value={settings[setting.key as keyof typeof settings] as boolean}
                onValueChange={(value) =>
                  handleToggleSetting(setting.key as keyof typeof settings, value)
                }
                disabled={isSyncing}
              />
            );
          }

          if (setting.type === "numeric") {
            return (
              <SettingsNumericInput
                key={setting.key}
                label={setting.label}
                description={setting.description}
                value={settings[setting.key as keyof typeof settings] as number}
                min={setting.min}
                max={setting.max}
                onValueChange={(value) =>
                  updateSetting(setting.key as keyof typeof settings, value)
                }
                disabled={isSyncing}
                loading={isSyncing}
              />
            );
          }

          return null;
        })}
      </SettingsSection>

      {/* Defaults Section */}
      <SettingsSection
        sectionId="defaults"
        icon={SETTINGS_SECTIONS.defaults.icon}
        iconLibrary={SETTINGS_SECTIONS.defaults.iconLibrary as "material" | "fontawesome" | "antdesign"}
        title={SETTINGS_SECTIONS.defaults.title}
        description={SETTINGS_SECTIONS.defaults.description}
      >
        {DEFAULTS_SETTINGS.map((setting) => {
          if (setting.type === "numeric") {
            return (
              <SettingsNumericInput
                key={setting.key}
                label={setting.label}
                description={setting.description}
                value={settings[setting.key as keyof typeof settings] as number}
                min={setting.min}
                max={setting.max}
                onValueChange={(value) =>
                  updateSetting(setting.key as keyof typeof settings, value)
                }
                disabled={isSyncing}
                loading={isSyncing}
              />
            );
          }

          return null;
        })}
      </SettingsSection>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <Pressable style={styles.resetButton} onPress={handleResetSettings} disabled={isSyncing}>
          <View style={styles.resetButtonContent}>
            <Icon name="restart" library="material" size={18} color={theme.warning} />
            <Text style={styles.resetButtonText}>استعادة الإعدادات الافتراضية</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>["theme"]) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    container: {
      gap: 16,
      paddingHorizontal: 14,
      paddingVertical: 16,
      paddingBottom: 24,
    },
    header: {
      marginBottom: 8,
      gap: 6,
    },
    headerTop: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 12,
    },
    title: {
      fontSize: 28,
      fontWeight: "900",
      color: theme.textMain,
      textAlign: "right",
    },
    subtitle: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.textSub,
      textAlign: "right",
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.background,
    },
    loadingText: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.textSub,
      textAlign: "center",
    },
    actionsContainer: {
      gap: 10,
      marginTop: 8,
    },
    resetButton: {
      minHeight: 50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.warning,
      backgroundColor: theme.card,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    resetButtonContent: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 10,
    },
    resetButtonText: {
      fontSize: 15,
      fontWeight: "900",
      color: theme.warning,
      textAlign: "center",
    },
  });
}

