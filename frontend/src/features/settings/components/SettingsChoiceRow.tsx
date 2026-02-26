import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../../shared/theme";
import { Icon } from "./Icon";

interface SettingsChoiceRowProps {
  label: string;
  description?: string;
  value: string;
  options: { label: string; value: string; icon?: string }[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function SettingsChoiceRow({
  label,
  description,
  value,
  options,
  onValueChange,
  disabled,
}: SettingsChoiceRowProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      <View style={styles.optionsContainer}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            disabled={disabled}
            style={[styles.option, value === option.value && styles.optionActive]}
            onPress={() => onValueChange(option.value)}
          >
            {option.icon && (
              <Icon
                name={option.icon}
                library="material"
                size={16}
                color={value === option.value ? "#fff" : theme.primaryBlue}
              />
            )}
            <Text style={[styles.optionText, value === option.value && styles.optionTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>["theme"]) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: theme.soft,
      gap: 10,
    },
    disabled: {
      opacity: 0.6,
    },
    labelContainer: {
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
    optionsContainer: {
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      gap: 8,
    },
    option: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      backgroundColor: theme.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 40,
      justifyContent: "center",
      flex: 1,
      minWidth: "45%",
    },
    optionActive: {
      borderColor: theme.primaryBlue,
      backgroundColor: theme.primaryBlue,
    },
    optionText: {
      color: theme.textMain,
      fontWeight: "800",
      fontSize: 14,
      textAlign: "center",
    },
    optionTextActive: {
      color: "#fff",
    },
  });
}
