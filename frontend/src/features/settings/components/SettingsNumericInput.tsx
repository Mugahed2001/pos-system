import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAppTheme } from "../../../shared/theme";
import { Icon } from "./Icon";

interface SettingsNumericInputProps {
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  onValueChange: (value: number) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function SettingsNumericInput({
  label,
  description,
  value,
  min = 1,
  max = 999,
  onValueChange,
  disabled,
  loading,
}: SettingsNumericInputProps) {
  const [inputValue, setInputValue] = useState(String(value));
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleSave = () => {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setInputValue(String(value));
      return;
    }
    onValueChange(Math.floor(parsed));
  };

  const handleChange = (text: string) => {
    if (text === "" || /^[0-9]*$/.test(text)) {
      setInputValue(text);
    }
  };

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label}</Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      <View style={styles.inputContainer}>
        <View style={styles.countDisplay}>
          <Text style={styles.countText}>{value}</Text>
        </View>
        <View style={styles.controls}>
          <Pressable
            disabled={disabled || loading || value <= min}
            style={[styles.button, styles.decrementButton, (disabled || loading || value <= min) && styles.buttonDisabled]}
            onPress={() => onValueChange(Math.max(min, value - 1))}
          >
            <Icon
              name="minus"
              library="material"
              size={18}
              color={disabled || loading || value <= min ? theme.textSub : theme.textMain}
            />
          </Pressable>
          <Pressable
            disabled={disabled || loading || value >= max}
            style={[styles.button, styles.incrementButton, (disabled || loading || value >= max) && styles.buttonDisabled]}
            onPress={() => onValueChange(Math.min(max, value + 1))}
          >
            <Icon
              name="plus"
              library="material"
              size={18}
              color={disabled || loading || value >= max ? theme.textSub : "#fff"}
            />
          </Pressable>
        </View>
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
    inputContainer: {
      flexDirection: "row-reverse",
      gap: 10,
      alignItems: "center",
    },
    countDisplay: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      height: 44,
      backgroundColor: theme.card,
      justifyContent: "center",
      alignItems: "center",
    },
    countText: {
      color: theme.textMain,
      fontWeight: "900",
      fontSize: 18,
    },
    controls: {
      flexDirection: "row",
      gap: 8,
    },
    button: {
      width: 44,
      height: 44,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.primaryBlue,
    },
    decrementButton: {
      backgroundColor: theme.card,
    },
    incrementButton: {
      backgroundColor: theme.primaryBlue,
    },
    buttonDisabled: {
      opacity: 0.5,
      borderColor: theme.border,
    },
    buttonText: {
      color: theme.textMain,
      fontWeight: "900",
      fontSize: 20,
    },
  });
}
