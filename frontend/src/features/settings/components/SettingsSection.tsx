import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../../shared/theme";
import { Icon } from "./Icon";

interface SettingsSectionProps {
  sectionId: string;
  icon: string;
  iconLibrary?: "material" | "fontawesome" | "antdesign";
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingsSection({
  sectionId,
  icon,
  iconLibrary = "material",
  title,
  description,
  children,
}: SettingsSectionProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Icon name={icon} library={iconLibrary} size={24} color={theme.primaryBlue} />
          <Text style={styles.title}>{title}</Text>
        </View>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>["theme"]) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    header: {
      gap: 6,
    },
    titleRow: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 10,
    },
    icon: {
      fontSize: 24,
    },
    title: {
      color: theme.textMain,
      fontWeight: "900",
      fontSize: 16,
    },
    description: {
      color: theme.textSub,
      fontSize: 13,
      fontWeight: "600",
      textAlign: "right",
    },
    content: {
      gap: 10,
    },
  });
}
