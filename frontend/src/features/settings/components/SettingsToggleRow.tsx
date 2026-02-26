import React, { useMemo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useAppTheme } from "../../../shared/theme";
import { Icon } from "./Icon";

interface SettingsToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  icon?: string;
  iconLibrary?: "material" | "fontawesome" | "antdesign";
}

export function SettingsToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
  icon,
  iconLibrary = "material",
}: SettingsToggleRowProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.textContainer}>
        {icon && (
          <View style={styles.iconContainer}>
            <Icon name={icon} library={iconLibrary} size={18} color={theme.primaryBlue} />
          </View>
        )}
        <View style={styles.labelWrapper}>
          <Text style={styles.label}>{label}</Text>
          {description && <Text style={styles.description}>{description}</Text>}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: theme.border, true: "rgba(37,99,235,0.35)" }}
        thumbColor={value ? theme.primaryBlue : "#9CA3AF"}
      />
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>["theme"]) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.soft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    disabled: {
      opacity: 0.6,
    },
    textContainer: {
      flex: 1,
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 10,
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "rgba(37,99,235,0.1)",
      justifyContent: "center",
      alignItems: "center",
    },
    labelWrapper: {
      flex: 1,
      gap: 4,
    },
    label: {
      color: theme.textMain,
      fontWeight: "800",
      fontSize: 15,
      textAlign: "right",
    },
    description: {
      color: theme.textSub,
      fontSize: 12,
      fontWeight: "600",
      textAlign: "right",
    },
  });
}
