import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../../shared/theme";
import { Icon } from "./Icon";

interface SettingsModeToggleProps {
  value: "light" | "dark";
  onValueChange: (value: "light" | "dark") => void;
}

export function SettingsModeToggle({ value, onValueChange }: SettingsModeToggleProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>نمط الواجهة</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, value === "light" && styles.modeButtonActive]}
          onPress={() => onValueChange("light")}
        >
          <Icon
            name="white-balance-sunny"
            library="material"
            size={20}
            color={value === "light" ? "#fff" : theme.textMain}
          />
          <Text style={[styles.modeButtonText, value === "light" && styles.modeButtonTextActive]}>
            الوضع النهاري
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, value === "dark" && styles.modeButtonActive]}
          onPress={() => onValueChange("dark")}
        >
          <Icon
            name="moon-waning-crescent"
            library="material"
            size={20}
            color={value === "dark" ? "#fff" : theme.textMain}
          />
          <Text style={[styles.modeButtonText, value === "dark" && styles.modeButtonTextActive]}>
            الوضع الليلي
          </Text>
        </Pressable>
      </View>
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
      gap: 10,
    },
    label: {
      color: theme.textMain,
      fontWeight: "800",
      fontSize: 15,
      textAlign: "right",
    },
    modeRow: {
      flexDirection: "row-reverse",
      gap: 8,
    },
    modeButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      backgroundColor: theme.card,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 50,
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
    },
    modeButtonActive: {
      borderColor: theme.primaryBlue,
      backgroundColor: theme.primaryBlue,
    },
    modeIcon: {
      fontSize: 20,
    },
    modeButtonText: {
      color: theme.textMain,
      fontWeight: "800",
      fontSize: 13,
      textAlign: "center",
    },
    modeButtonTextActive: {
      color: "#fff",
    },
  });
}
