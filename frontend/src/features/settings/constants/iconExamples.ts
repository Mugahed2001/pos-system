/**
 * Icon Usage Examples & Patterns
 * Real-world examples of how to use the Icon system in different scenarios
 */

import React from "react";
import { View, Text, TouchableOpacity, Switch } from "react-native";
import { Icon } from "../components";
import { useAppTheme } from "@/contexts/ThemeContext";

// ============================================================================
// EXAMPLE 1: Simple Icon Display
// ============================================================================

export function SimpleIconExample() {
  const { theme } = useAppTheme();

  return (
    <View>
      {/* Basic icon */}
      <Icon name="palette" size={24} color={theme.primaryBlue} />

      {/* Different libraries */}
      <Icon name="palette" library="material" size={24} />
      <Icon name="palette" library="fontawesome" size={24} />
      <Icon name="setting" library="antdesign" size={24} />
    </View>
  );
}

// ============================================================================
// EXAMPLE 2: Icon in Header
// ============================================================================

export function HeaderIconExample() {
  const { theme } = useAppTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {/* Large header icon */}
      <Icon name="cog" size={32} color={theme.primaryBlue} />
      <Text style={{ fontSize: 20, fontWeight: "bold" }}>الإعدادات</Text>
    </View>
  );
}

// ============================================================================
// EXAMPLE 3: Icon with Toggle Switch
// ============================================================================

export function ToggleWithIconExample() {
  const { theme } = useAppTheme();
  const [enabled, setEnabled] = React.useState(false);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
      }}
    >
      {/* Icon in colored container */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          backgroundColor: "rgba(37,99,235,0.1)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="printer-check" size={20} color={theme.primaryBlue} />
      </View>

      {/* Label and description */}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>طباعة تلقائية</Text>
        <Text style={{ fontSize: 13, color: theme.textSub }}>
          اطبع الإيصالات تلقائياً
        </Text>
      </View>

      {/* Toggle switch */}
      <Switch value={enabled} onValueChange={setEnabled} />
    </View>
  );
}

// ============================================================================
// EXAMPLE 4: Icon Button with States
// ============================================================================

export function IconButtonExample() {
  const { theme } = useAppTheme();
  const [loading, setLoading] = React.useState(false);

  return (
    <TouchableOpacity
      onPress={() => {
        setLoading(true);
        setTimeout(() => setLoading(false), 1000);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.warningBg,
        borderRadius: 8,
      }}
    >
      <Icon
        name={loading ? "loading" : "restart"}
        size={18}
        color={theme.warning}
      />
      <Text style={{ color: theme.warning, fontWeight: "600" }}>
        {loading ? "جاري..." : "استعادة"}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// EXAMPLE 5: Icon with Choice Options
// ============================================================================

export function ChoiceWithIconsExample() {
  const { theme } = useAppTheme();
  const [selected, setSelected] = React.useState("before");

  const options = [
    {
      label: "قبل الأكل",
      value: "before",
      icon: "cash-multiple",
    },
    {
      label: "بعد الأكل",
      value: "after",
      icon: "check-circle",
    },
  ];

  return (
    <View style={{ gap: 8 }}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.value}
          onPress={() => setSelected(option.value)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor:
              selected === option.value
                ? theme.primaryBlue
                : theme.surfaceLight,
          }}
        >
          <Icon
            name={option.icon}
            size={20}
            color={
              selected === option.value ? "#fff" : theme.primaryBlue
            }
          />
          <Text
            style={{
              color:
                selected === option.value ? "#fff" : theme.textMain,
              fontSize: 14,
              fontWeight: "500",
            }}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ============================================================================
// EXAMPLE 6: Icon with Numeric Input
// ============================================================================

export function NumericInputWithIconsExample() {
  const { theme } = useAppTheme();
  const [value, setValue] = React.useState(2);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text>عدد الكراسي:</Text>

      <TouchableOpacity
        disabled={value <= 1}
        onPress={() => setValue(value - 1)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          backgroundColor: value > 1
            ? theme.surfaceLight
            : "rgba(0,0,0,0.05)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name="minus"
          size={18}
          color={
            value > 1
              ? theme.textMain
              : theme.textSub
          }
        />
      </TouchableOpacity>

      <Text style={{ fontSize: 18, fontWeight: "600", minWidth: 20 }}>
        {value}
      </Text>

      <TouchableOpacity
        onPress={() => setValue(value + 1)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 6,
          backgroundColor: theme.surfaceLight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name="plus"
          size={18}
          color={theme.textMain}
        />
      </TouchableOpacity>
    </View>
  );
}

// ============================================================================
// EXAMPLE 7: Section Header with Icon
// ============================================================================

export function SectionHeaderExample() {
  const { theme } = useAppTheme();

  return (
    <View style={{ marginVertical: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Icon name="shopping-cart" size={24} color={theme.primaryBlue} />
        <Text style={{ fontSize: 18, fontWeight: "700" }}>المبيعات</Text>
      </View>
      <Text style={{ fontSize: 13, color: theme.textSub }}>
        إدارة إعدادات المبيعات والطلبات
      </Text>
    </View>
  );
}

// ============================================================================
// EXAMPLE 8: Loading State with Icon
// ============================================================================

export function LoadingIconExample() {
  const { theme } = useAppTheme();

  return (
    <View style={{ alignItems: "center", padding: 20 }}>
      {/* Using pulse animation concept */}
      <Icon name="sync" size={28} color={theme.primaryBlue} />
      <Text style={{ marginTop: 8, color: theme.textSub }}>
        جاري المزامنة...
      </Text>
    </View>
  );
}

// ============================================================================
// EXAMPLE 9: Icon Grid
// ============================================================================

export function IconGridExample() {
  const { theme } = useAppTheme();

  const icons = [
    { name: "palette", label: "Palette" },
    { name: "shopping-cart", label: "Cart" },
    { name: "printer", label: "Printer" },
    { name: "cog", label: "Settings" },
    { name: "check-circle", label: "Success" },
    { name: "alert-circle", label: "Warning" },
  ];

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {/* 3-column grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {icons.map((icon) => (
          <View
            key={icon.name}
            style={{
              width: "31%",
              padding: 12,
              borderRadius: 8,
              backgroundColor: theme.surfaceLight,
              alignItems: "center",
            }}
          >
            <Icon name={icon.name} size={28} color={theme.primaryBlue} />
            <Text
              style={{
                marginTop: 8,
                fontSize: 12,
                color: theme.textMain,
                textAlign: "center",
              }}
            >
              {icon.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// EXAMPLE 10: Conditional Icon Display
// ============================================================================

export function ConditionalIconExample() {
  const { theme } = useAppTheme();
  const [isOffline, setIsOffline] = React.useState(false);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: isOffline
          ? "rgba(255,0,0,0.1)"
          : "rgba(0,255,0,0.1)",
        borderRadius: 6,
      }}
    >
      <Icon
        name={isOffline ? "wifi-off" : "wifi"}
        size={18}
        color={
          isOffline
            ? theme.error
            : theme.success
        }
      />
      <Text
        style={{
          color: isOffline
            ? theme.error
            : theme.success,
          fontSize: 13,
        }}
      >
        {isOffline ? "غير متصل" : "متصل"}
      </Text>
    </View>
  );
}

// ============================================================================
// QUICK REFERENCE: COMMON PATTERNS
// ============================================================================

/*
 * PATTERN 1: Icon in Container
 * ─────────────────────────────────────
 * <View style={{ width: 40, height: 40, borderRadius: 8,
 *         backgroundColor: "rgba(37,99,235,0.1)" }}>
 *   <Icon name="..." size={24} color={theme.primaryBlue} />
 * </View>
 *
 * PATTERN 2: Icon with Text (Header)
 * ─────────────────────────────────────
 * <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
 *   <Icon name="..." size={24} color={theme.primaryBlue} />
 *   <Text style={{ fontSize: 18, fontWeight: "700" }}>Title</Text>
 * </View>
 *
 * PATTERN 3: Icon Button
 * ─────────────────────────────────────
 * <TouchableOpacity onPress={handlePress}
 *     style={{ width: 40, height: 40, borderRadius: 8,
 *             backgroundColor: theme.surfaceLight }}>
 *   <Icon name="..." size={20} color={theme.textMain} />
 * </TouchableOpacity>
 *
 * PATTERN 4: State-Aware Color
 * ─────────────────────────────────────
 * <Icon name="..."
 *   color={isActive ? theme.success : theme.textSub}
 * />
 *
 * PATTERN 5: Conditional Icon
 * ─────────────────────────────────────
 * {condition && <Icon name="..." size={24} />}
 */

export default {
  SimpleIconExample,
  HeaderIconExample,
  ToggleWithIconExample,
  IconButtonExample,
  ChoiceWithIconsExample,
  NumericInputWithIconsExample,
  SectionHeaderExample,
  LoadingIconExample,
  IconGridExample,
  ConditionalIconExample,
};
