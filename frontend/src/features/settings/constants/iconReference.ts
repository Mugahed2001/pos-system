/**
 * Icon Reference Guide
 * Quick visual reference for all icons used in Settings
 */

// ============================================================================
// SECTION ICONS
// ============================================================================

export const SECTION_ICONS_VISUAL = {
  // appearance: "MaterialCommunityIcons: palette",
  // Looks like: 🎨 (paintbrush/palette)
  
  // sales: "MaterialCommunityIcons: shopping-cart",
  // Looks like: 🛒 (shopping cart)
  
  // printing: "MaterialCommunityIcons: printer",
  // Looks like: 🖨️ (printer machine)
  
  // defaults: "MaterialCommunityIcons: cog",
  // Looks like: ⚙️ (settings gear)
};

// ============================================================================
// APPEARANCE SECTION ICONS
// ============================================================================

export const APPEARANCE_ICONS = {
  // compactProductsGrid: "view-grid-compact",
  // Looks like: Grid layout (compact view)
};

// ============================================================================
// SALES SECTION ICONS
// ============================================================================

export const SALES_ICONS = {
  // requireTableForDineIn: "table-furniture",
  // Looks like: Restaurant table
  
  // autoOpenPaymentAfterSale: "credit-card-fast",
  // Looks like: Credit card with speed lines
  
  // enableServiceCharge: "percent",
  // Looks like: % symbol
  
  // showHeldOrdersBar: "pause-circle",
  // Looks like: ⏸ (pause button in circle)
  
  // showDeferredOrdersBar: "clock-outline",
  // Looks like: ⏰ (clock)
  
  // autoFocusSearch: "magnify",
  // Looks like: 🔍 (magnifying glass)
  
  // dineInPaymentTiming: "clock-check",
  // Looks like: ⏰ with checkmark
  
  // Option icons for dineInPaymentTiming
  // - before_meal: "cash-multiple" (multiple cash notes)
  // - after_meal: "check-circle" (✓ in circle)
};

// ============================================================================
// PRINTING SECTION ICONS
// ============================================================================

export const PRINTING_ICONS = {
  // autoPrintReceipt: "printer-check",
  // Looks like: 🖨️ with ✓ (printer with checkmark)
  
  // soundAlerts: "bell-ring",
  // Looks like: 🔔 (notification bell with lines)
  
  // receiptCopies: "content-duplicate",
  // Looks like: 📋 duplicate/copy icon
};

// ============================================================================
// DEFAULTS SECTION ICONS
// ============================================================================

export const DEFAULTS_ICONS = {
  // defaultSeats: "chair-rolling",
  // Looks like: 🪑 (office/rolling chair)
};

// ============================================================================
// THEME ICONS
// ============================================================================

export const THEME_ICONS = {
  // light: "white-balance-sunny",
  // Looks like: ☀️ (sun)
  
  // dark: "moon-waning-crescent",
  // Looks like: 🌙 (moon)
};

// ============================================================================
// ACTION ICONS
// ============================================================================

export const ACTION_ICONS = {
  // reset: "restart",
  // Looks like: ↻ (circular refresh arrow)
  
  // save: "content-save",
  // Looks like: 💾 (floppy disk)
  
  // delete: "delete",
  // Looks like: 🗑️ (trash can)
  
  // add: "plus",
  // Looks like: + (plus sign)
  
  // remove: "minus",
  // Looks like: − (minus sign)
};

// ============================================================================
// CONTROL ICONS (used in components)
// ============================================================================

export const CONTROL_ICONS = {
  // increment: "plus" (for +1 button)
  // decrement: "minus" (for -1 button)
};

// ============================================================================
// ICON LIBRARIES AVAILABLE
// ============================================================================

/*
 * @expo/vector-icons includes:
 * 
 * 1. MaterialCommunityIcons (~7000 icons)
 *    - Default and most comprehensive
 *    - Design: Material Design style
 *    - Perfect for: Business apps, professional UI
 *    - Website: https://materialdesignicons.com/
 * 
 * 2. FontAwesome5 (~1600 icons)
 *    - Alternative option
 *    - Design: Modern, solid style
 *    - Perfect for: Social media, general purpose
 *    - Website: https://fontawesome.com/icons
 * 
 * 3. AntDesign (~200+ icons)
 *    - Alternative option
 *    - Design: Minimalist, clean
 *    - Perfect for: Business software, dashboards
 *    - Website: https://ant.design/components/icon/
 */

// ============================================================================
// SIZE GUIDELINES
// ============================================================================

export const ICON_SIZES = {
  xs: 14,      // Very small (not used)
  sm: 16,      // Small indicators
  md: 18,      // Medium (button icons)
  base: 20,    // Default (most common)
  lg: 24,      // Large (section headers)
  xl: 28,      // Extra large
  2xl: 32,     // 2X large (page headers)
};

// ============================================================================
// COLOR GUIDELINES
// ============================================================================

export const ICON_COLORS = {
  // Primary
  primary: "theme.primaryBlue",      // #2563eb - Main color
  
  // Text
  text: "theme.textMain",            // Primary text color
  textSub: "theme.textSub",          // Secondary text color
  
  // Semantic
  warning: "theme.warning",          // Warning/danger color
  success: "theme.success",          // Success color
  
  // Special
  white: "#ffffff",                  // For dark backgrounds
  transparent: "rgba(0,0,0,0)",     // Transparent
};

// ============================================================================
// EXAMPLE COMPONENT USAGE
// ============================================================================

/*
 * import { Icon } from "@/features/settings/components";
 * 
 * // Basic icon
 * <Icon name="palette" size={24} color={theme.primaryBlue} />
 * 
 * // In section header
 * <Icon
 *   name="shopping-cart"
 *   library="material"
 *   size={24}
 *   color={theme.primaryBlue}
 * />
 * 
 * // Conditional color based on state
 * <Icon
 *   name="check-circle"
 *   size={24}
 *   color={value ? theme.success : theme.textSub}
 * />
 * 
 * // In button
 * <View style={styles.buttonContent}>
 *   <Icon name="restart" size={18} color={theme.warning} />
 *   <Text>Reset Settings</Text>
 * </View>
 * 
 * // With different library
 * <Icon
 *   name="setting"
 *   library="antdesign"
 *   size={24}
 * />
 */

// ============================================================================
// FINDING MORE ICONS
// ============================================================================

/*
 * To find icons by name:
 * 
 * 1. MaterialCommunityIcons (recommended):
 *    - Visit: https://materialdesignicons.com/
 *    - Search by keyword or behavior
 *    - Copy the icon name directly
 * 
 * 2. In your app code:
 *    import { MaterialCommunityIcons } from "@expo/vector-icons";
 *    // Then type <MaterialCommunityIcons name="...
 * 
 * 3. Common patterns:
 *    - Start with category: "check-", "arrow-", "pause-"
 *    - Then add specifics: "check-circle", "arrow-right", "pause-circle"
 *    - Color variations: Add "-outline" or "-filled" suffix
 */

// ============================================================================
// ICON CONSISTENCY RULES
// ============================================================================

/*
 * ✅ DO:
 *    - Use meaningful icon names (palette for appearance, cart for sales)
 *    - Keep icon size consistent within sections (24px for headers)
 *    - Use theme colors consistently
 *    - Provide fallback icons if unsure
 * 
 * ❌ DON'T:
 *    - Mix icon styles (don't use emoji with vector icons)
 *    - Use mismatched colors with theme
 *    - Use unclear icon names
 *    - Scale icons excessively (keep to guidelines)
 */

// ============================================================================
// CHANGELOG
// ============================================================================

/*
 * v2.0 (2026-02-26) - Professional Icons
 *   - Replaced emoji with MaterialCommunityIcons
 *   - Added Icon reusable component
 *   - Updated all 12 settings with specific icons
 *   - Added theme icon support (light/dark)
 *   - Added action icons (reset, save, delete)
 *   - Support for multiple icon libraries
 * 
 * v1.0 (2026-02-24) - Initial Settings
 *   - Emoji icons (🎨 🛒 🖨️ ⚙️)
 */

export default {
  SECTION_ICONS_VISUAL,
  APPEARANCE_ICONS,
  SALES_ICONS,
  PRINTING_ICONS,
  DEFAULTS_ICONS,
  THEME_ICONS,
  ACTION_ICONS,
  CONTROL_ICONS,
  ICON_SIZES,
  ICON_COLORS,
};
