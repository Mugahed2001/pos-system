import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { BRAND_COLORS } from "../../theme/brand";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: Variant;
  compact?: boolean;
}

export function Button({ label, variant = "primary", compact = false, disabled, ...props }: ButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        pressed && !disabled && variant === "primary" ? styles.primaryPressed : null,
        pressed && !disabled && variant === "secondary" ? styles.secondaryPressed : null,
        pressed && !disabled && variant === "danger" ? styles.dangerPressed : null,
        disabled && styles.disabled,
      ]}
      {...props}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: BRAND_COLORS.primaryBlue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  compact: {
    minHeight: 40,
  },
  primaryPressed: {
    backgroundColor: BRAND_COLORS.deepBlue,
  },
  secondary: {
    backgroundColor: BRAND_COLORS.accentOrange,
  },
  secondaryPressed: {
    backgroundColor: "#D29A1E",
  },
  danger: {
    backgroundColor: BRAND_COLORS.danger,
  },
  dangerPressed: {
    backgroundColor: "#B91C1C",
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 16,
  },
});
