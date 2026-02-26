/**
 * Icon System Best Practices & Standards
 * Guidelines for consistent icon usage across the Settings module
 */

// ============================================================================
// NAMING CONVENTIONS
// ============================================================================

export const NAMING_STANDARDS = {
  // DO:
  // ✅ Use descriptive names: "cog", "printer", "palette"
  // ✅ Use hyphen-separated compound names: "white-balance-sunny", "credit-card-fast"
  // ✅ Use consistent prefixes: "check-circle", "minus-circle", "plus-circle"
  // ✅ Match icon semantics to function: cart=sales, printer=printing, palette=appearance

  // DON'T:
  // ❌ Don't use generic names: "icon1", "setting_icon"
  // ❌ Don't use spaces: "clock outline"
  // ❌ Don't invent names: test if name exists first
  // ❌ Don't use emoji alongside vector icons: pick one system
};

// ============================================================================
// SIZE STANDARDS
// ============================================================================

export const SIZE_STANDARDS = {
  // MICRO (14px) - Not commonly used
  // └─ Use for: Tiny indicators, error marks
  // └─ Example: Error notification badge

  SMALL: {
    // SMALL (16-18px) - Button/actionable elements
    // └─ Use for: Numeric input +/- buttons, close buttons
    // └─ Example: SettingsNumericInput decrement/increment buttons
    name: "Small",
    value: 16,
    usage: "Action buttons, inline controls",
    components: ["SettingsNumericInput", "Button close"],
  },

  MEDIUM: {
    // MEDIUM (20px) - Default for most inline usage
    // └─ Use for: Settings toggles, within rows
    // └─ Example: SettingsToggleRow icons, choice buttons
    name: "Medium",
    value: 20,
    usage: "Default settings icons, inline icons",
    components: [
      "SettingsToggleRow",
      "SettingsChoiceRow",
      "Inline icons",
    ],
  },

  LARGE: {
    // LARGE (24px) - Section headers and primary icons
    // └─ Use for: Section headers, primary visual elements
    // └─ Example: SettingsSection header icons (palette, cart, printer)
    name: "Large",
    value: 24,
    usage: "Section headers, primary icons",
    components: ["SettingsSection header", "Main visual elements"],
  },

  XLARGE: {
    // XLARGE (28-32px) - Page headers and major visual elements
    // └─ Use for: Page title icons, modal headers
    // └─ Example: SettingsPage header "إعدادات الكاشير" icon
    name: "XLarge",
    value: 32,
    usage: "Page headers, major visual elements",
    components: ["SettingsPage header", "Modal headers"],
  },

  // RULE: Size should reflect importance and context
  // └─ Larger icons = more important
  // └─ Smaller icons = supporting/secondary
};

// ============================================================================
// COLOR STANDARDS
// ============================================================================

export const COLOR_STANDARDS = {
  // Primary Colors: Use for main, actionable icons
  // ─────────────────────────────────────────────
  PRIMARY: {
    value: "theme.primaryBlue", // #2563eb
    usage:
      "Main section headers, active states, primary actions",
    examples:
      'SettingsSection headers, active toggle icons, primary buttons',
  },

  // Text Colors: Use for inline, contextual icons
  // ─────────────────────────────────────────────
  TEXT_MAIN: {
    value: "theme.textMain",
    usage: "Default icon color for most contexts",
    examples:
      "Toggle labels, description icons, secondary elements",
  },

  TEXT_SUB: {
    value: "theme.textSub",
    usage: "Muted/secondary icons, disabled states",
    examples: "Placeholder labels, disabled buttons",
  },

  // Semantic Colors: Use for state-specific icons
  // ─────────────────────────────────────────────
  SUCCESS: {
    value: "theme.success",
    usage: "Active/enabled states, positive actions",
    examples: "Active choice: check-circle, successful toggle",
  },

  WARNING: {
    value: "theme.warning", // typically orange/red
    usage: "Destructive actions, warnings, caution",
    examples: "Reset button, delete actions, warning alerts",
  },

  WHITE: {
    value: "#ffffff",
    usage: "Icons on dark backgrounds, emphasized icons",
    examples:
      "Active buttons with colored backgrounds, dark modals",
  },

  // RULE: Color should indicate state and importance
  // └─ Primary Blue = Main navigation/selection
  // └─ Text Main = Default/neutral
  // └─ Text Sub = Muted/secondary
  // └─ Success = Active/enabled
  // └─ Warning = Destructive/caution
  // └─ White = Emphasis on colored background
};

// ============================================================================
// ICON LIBRARY SELECTION
// ============================================================================

export const LIBRARY_SELECTION = {
  // MaterialCommunityIcons (RECOMMENDED - 95% of usage)
  // ───────────────────────────────────────────────
  MATERIAL: {
    name: "MaterialCommunityIcons",
    iconCount: "~7000+",
    design: "Material Design 2/3 style",
    pros: [
      "Most comprehensive library",
      "Professional design",
      "Best icon coverage for business apps",
      "Consistent visual style",
      "Well-maintained by community",
    ],
    cons: ["Can be opinionated design-wise"],
    usage:
      "Use for 95% of all icons - is the default",
    examples: [
      "palette",
      "shopping-cart",
      "printer",
      "cog",
      "restart",
      "content-save",
    ],
    website: "https://materialdesignicons.com/",
  },

  // FontAwesome5 (ALTERNATIVE - 3% of usage)
  // ────────────────────────────────────────
  FONTAWESOME: {
    name: "FontAwesome5",
    iconCount: "~1600",
    design:
      "Modern, solid, bold style",
    pros: [
      "Well-known and trusted",
      "Good for social/web icons",
      "Bold, clear appearance",
    ],
    cons: [
      "Smaller library",
      "Different visual style from Material",
    ],
    usage:
      "Use only when MaterialCommunityIcons lacks specific icon",
    examples: [
      "cog",
      "print",
      "dollar-sign",
      "clock",
    ],
    website: "https://fontawesome.com/icons",
  },

  // AntDesign (ALTERNATIVE - 2% of usage)
  // ────────────────────────────────────
  ANTDESIGN: {
    name: "AntDesign",
    iconCount: "~200+",
    design: "Minimalist, clean enterprise style",
    pros: [
      "Clean, modern appearance",
      "Good for enterprise software",
      "Consistent sizing",
    ],
    cons: [
      "Very limited library",
      "Niche use cases",
    ],
    usage:
      "Use only for specific enterprise design needs",
    examples: [
      "setting",
      "delete",
      "check-circle",
    ],
    website: "https://ant.design/components/icon/",
  },

  // RECOMMENDATION:
  // └─ Default to MaterialCommunityIcons for all cases
  // └─ Only switch libraries if icon not available
  // └─ Keep library switches minimal for visual consistency
};

// ============================================================================
// COMPONENT INTEGRATION STANDARDS
// ============================================================================

export const COMPONENT_STANDARDS = {
  // SettingsSection: Section Header Icons
  // ──────────────────────────────────────
  SETTINGS_SECTION: {
    iconNames: [
      "palette",         // Appearance
      "shopping-cart",   // Sales
      "printer",         // Printing
      "cog",             // Defaults
    ],
    size: 24,
    color: "theme.primaryBlue",
    container: {
      enabled: true,
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "rgba(37,99,235,0.1)", // Light blue bg
    },
    positioning: "left",
    spacing: 12,
  },

  // SettingsToggleRow: Toggle Icons
  // ──────────────────────────────
  SETTINGS_TOGGLE_ROW: {
    optional: true, // Icon is optional
    size: 20,
    color: "theme.primaryBlue",
    container: {
      enabled: true,
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "rgba(37,99,235,0.1)", // Light blue bg
    },
    positioning: "left",
    spacing: 8,
    examples: [
      "view-grid-compact",      // Appearance
      "table-furniture",        // Sales
      "printer-check",          // Printing
      "chair-rolling",          // Defaults
    ],
  },

  // SettingsNumericInput: Control Icons
  // ───────────────────────────────────
  SETTINGS_NUMERIC_INPUT: {
    decrementIcon: "minus",
    incrementIcon: "plus",
    size: 18,
    color: {
      default: "theme.textMain",
      disabled: "theme.textSub",
      active: "#ffffff",
    },
    buttonSize: 36,
    spacing: 12,
  },

  // SettingsChoiceRow: Option Icons
  // ────────────────────────────────
  SETTINGS_CHOICE_ROW: {
    optional: true, // Icon is optional
    size: 20,
    color: {
      selected: "#ffffff",
      unselected: "theme.primaryBlue",
    },
    positioning: "left",
    spacing: 8,
    examples: {
      paymentTiming: [
        { label: "قبل الأكل", icon: "cash-multiple" },
        { label: "بعد الأكل", icon: "check-circle" },
      ],
    },
  },

  // SettingsModeToggle: Theme Icons
  // ───────────────────────────────
  SETTINGS_MODE_TOGGLE: {
    lightIcon: "white-balance-sunny",
    darkIcon: "moon-waning-crescent",
    size: 20,
    color: {
      active: "#ffffff",
      inactive: "theme.textMain",
    },
    positioning: "inside button",
    spacing: 8,
  },

  // SettingsPage: Page Elements
  // ──────────────────────────
  SETTINGS_PAGE: {
    headerIcon: {
      name: "cog",
      size: 32,
      color: "theme.primaryBlue",
    },
    resetButton: {
      name: "restart",
      size: 18,
      color: "theme.warning",
    },
  },
};

// ============================================================================
// COMMON ICON PATTERNS
// ============================================================================

export const COMMON_PATTERNS = {
  // PATTERN: Section Header
  // │
  // ├─ Icon (24px, primary blue)
  // ├─ Title (18px, bold)
  // └─ Description (13px, text-sub)
  SECTION_HEADER: {
    description:
      "Use for grouping related settings",
    elements: [
      "Icon (24px, primary blue, in container)",
      "Title (18px, bold)",
      "Description (13px, muted)",
    ],
    spacing: 12,
    example: "SectionHeader",
  },

  // PATTERN: Toggle with Icon
  // │
  // ├─ Icon (20px, primary blue, in container)
  // ├─ Label (16px, bold)
  // ├─ Description (13px, text-sub)
  // └─ Toggle Switch
  TOGGLE_WITH_ICON: {
    description:
      "Use for boolean settings with visual indicator",
    elements: [
      "Icon (20px, in container)",
      "Label (16px)",
      "Description (13px)",
      "Toggle Switch",
    ],
    spacing: 12,
    example: "ToggleRow",
  },

  // PATTERN: Choice Selector with Icons
  // │
  // ├─ Option 1 Icon + Label (selected: white text on blue)
  // ├─ Option 2 Icon + Label (unselected: blue text on light)
  // └─ Option N...
  CHOICE_WITH_ICONS: {
    description:
      "Use for multiple choice settings with visual labels",
    elements: [
      "Option icons (20px)",
      "Option labels",
      "Visual state indication",
    ],
    spacing: 8,
    stateColors: {
      selected: "primary blue background",
      unselected: "light background",
    },
    example: "ChoiceRow",
  },

  // PATTERN: Control Buttons (Numeric Input)
  // │
  // ├─ Decrement Button (minus icon)
  // ├─ Value Display
  // └─ Increment Button (plus icon)
  CONTROL_BUTTONS: {
    description:
      "Use for numeric adjustments with increment/decrement",
    elements: [
      "Decrement (18px minus icon)",
      "Value display (numeric)",
      "Increment (18px plus icon)",
    ],
    spacing: 12,
    buttonSize: 36,
    example: "NumericInput",
  },

  // PATTERN: Action Button with Icon
  // │
  // └─ Icon + Text (both on colored background)
  ACTION_BUTTON: {
    description:
      "Use for primary actions like Reset",
    elements: [
      "Icon (18px, semantic color)",
      "Text label",
    ],
    spacing: 8,
    backgroundColor: "semantic (warning for destructive)",
    example: "Reset button in Settings",
  },

  // PATTERN: Status Indicator
  // │
  // └─ Icon only (conditional based on state)
  STATUS_INDICATOR: {
    description:
      "Use for showing status/state conditionally",
    elements: ["Icon only"],
    stateColors: {
      online: "success",
      offline: "warning/error",
      loading: "primary",
    },
    example: "Sync status indicator",
  },
};

// ============================================================================
// ACCESSIBILITY STANDARDS
// ============================================================================

export const ACCESSIBILITY_STANDARDS = {
  // RULE 1: Never use icon alone for critical information
  // └─ Always pair with text label for important actions
  // └─ Example: Reset button should have "استعادة" text too

  // RULE 2: Ensure sufficient color contrast
  // └─ Minimum 4.5:1 ratio for WCAG AA compliance
  // └─ Don't rely on color alone to convey meaning

  // RULE 3: Icons should be at least 24x24 for tap targets
  // └─ Exceptions: Inline badges, decorative elements
  // └─ Minimum touch target size: 44x44dp (standard)

  // RULE 4: Use semantic icon names
  // └─ "printer" communicates function better than "device"
  // └─ Screen readers benefit from clear semantics

  // RULE 5: Provide alt text in critical contexts
  // └─ Example: accessibilityLabel="اطبع الإيصالات تلقائياً"
  // └─ Especially important for toggles and buttons

  WCAG_CHECKLIST: {
    colorContrast: "Minimum 4.5:1 (AA standard)",
    touchTarget: "Minimum 44x44dp",
    semantics: "Use meaningful icon names",
    textPairing: "Always pair with text for critical info",
    stateIndicator: "Color + icon shape combination",
  },
};

// ============================================================================
// PERFORMANCE STANDARDS
// ============================================================================

export const PERFORMANCE_STANDARDS = {
  // RULE 1: Preload frequently used icons
  // └─ Import at component level
  // └─ Avoid dynamic requires

  // RULE 2: Don't abuse icon re-rendering
  // └─ Use React.memo for static icon containers
  // └─ Avoid unnecessary re-creates

  // RULE 3: Keep icon count reasonable
  // └─ Current implementation: 13 unique icons
  // └─ Aim for < 30 unique icons per screen

  // RULE 4: Use consistent icon sizing
  // └─ Reduces number of rendered sizes
  // └─ Improves caching efficiency

  // RULE 5: Defer unneeded icon loading
  // └─ Load additional icons on-demand
  // └─ Don't load all 7000+ Material icons at startup

  OPTIMIZATION_TIPS: [
    "Use theme colors to reduce unique color values",
    "Batch similar sized icons",
    "Memoize icon components with useMemo",
    "Avoid SVG manipulation inside renders",
    "Use production builds (not debug)",
  ],
};

// ============================================================================
// TESTING STANDARDS
// ============================================================================

export const TESTING_STANDARDS = {
  // TEST 1: Visual Regression Testing
  // ─────────────────────────────────
  // └─ Screenshot each icon size on light/dark modes
  // └─ Verify colors match theme

  // TEST 2: Icon Availability Testing
  // ──────────────────────────────────
  // └─ Verify icon names exist in libraries
  // └─ Check fallback behavior for missing icons

  // TEST 3: Accessibility Testing
  // ──────────────────────────────
  // └─ Verify color contrast ratios
  // └─ Test with screen readers
  // └─ Check keyboard navigation

  // TEST 4: Cross-Platform Testing
  // ───────────────────────────────
  // └─ iOS rendering
  // └─ Android rendering
  // └─ Different device sizes

  // TEST 5: Theme Testing
  // ─────────────────────
  // └─ Light mode rendering
  // └─ Dark mode rendering
  // └─ Color transitions

  SAMPLE_TEST_CASES: [
    "Icon renders at correct size",
    "Icon color matches theme",
    "Icon appears on both light/dark modes",
    "Icon is accessible (keyboard navigation)",
    "Icon name validation (exists in library)",
    "Icon doesn't cause layout shifts",
    "Icon RTL layout (Arabic) works correctly",
  ],
};

// ============================================================================
// TROUBLESHOOTING GUIDE
// ============================================================================

export const TROUBLESHOOTING = {
  // ISSUE: Icon not rendering / invisible
  // ─────────────────────────────────────
  // Solutions:
  // 1. Verify icon name is correct (default to materialdesignicons.com)
  // 2. Check if icon exists in selected library
  // 3. Verify color is not transparent/same as background
  // 4. Check if library parameter is set correctly
  INVISIBLE_ICON: {
    problem: "Icon not visible",
    solutions: [
      "Verify icon name: visit https://materialdesignicons.com/",
      "Check library parameter matches icon library",
      "Verify color is not transparent",
      "Ensure size is large enough (>= 16px)",
      "Check if parent container has proper flexbox alignment",
    ],
  },

  // ISSUE: Icon looks blurry or pixelated
  // ──────────────────────────────────────
  // Solutions:
  // 1. Use whole number sizes (avoid 15.5, use 16)
  // 2. Verify display scale is set correctly
  // 3. Check if running on dev server (use production build)
  BLURRY_ICON: {
    problem: "Icon appears blurry",
    solutions: [
      "Use whole number pixel sizes (16, 20, 24, not 15.3)",
      "Build production version for testing",
      "Check device pixel ratio (avoid fractional scaling)",
      "Verify icon library is up-to-date",
    ],
  },

  // ISSUE: Color not applying to icon
  // ────────────────────────────────
  // Solutions:
  // 1. Verify theme object has color defined
  // 2. Check if library parameter is wrong
  // 3. Ensure color format is correct (hex, rgb)
  COLOR_NOT_APPLIED: {
    problem: "Icon color not changing",
    solutions: [
      "Verify theme.colorName exists in ThemeContext",
      "Check if wrong library selected (different icons = different colors)",
      "Ensure color value is valid hex/rgb format",
      "Verify Icon component receives color prop",
      "Check parent View doesn't override color",
    ],
  },

  // ISSUE: Icon not centered in container
  // ──────────────────────────────────────
  // Solutions:
  // 1. Use flexbox alignItems: 'center', justifyContent: 'center'
  // 2. Verify container has explicit width/height
  // 3. Check for extra padding/margin
  NOT_CENTERED: {
    problem: "Icon misaligned in container",
    solutions: [
      "Use View with flexDirection row/column + alignItems center + justifyContent center",
      "Verify container has explicit size (width, height)",
      "Check for unexpected padding or margin",
      "Ensure icon size matches container size",
    ],
  },

  // ISSUE: Type error with icon library
  // ────────────────────────────────────
  // Solutions:
  // 1. Import Icon component correctly
  // 2. Verify library parameter is one of: 'material', 'fontawesome', 'antdesign'
  // 3. Check TypeScript types are correct
  TYPE_ERROR: {
    problem: "TypeScript error with Icon props",
    solutions: [
      'Check library prop is "material" | "fontawesome" | "antdesign"',
      "Verify Icon component import: import { Icon } from '../components'",
      "Ensure size is number type, not string",
      "Check color is string type",
      "Run `tsc --noEmit` to validate types",
    ],
  },
};

// ============================================================================
// MIGRATION GUIDE
// ============================================================================

export const MIGRATION_GUIDE = {
  // FROM: Emoji icons (old system)
  // TO: Professional vector icons (new system)

  STEP_1_REMOVE_EMOJI: {
    description: "Remove emoji from component props",
    before: '<SettingsSection icon="🎨" title="Appearance" />',
    after:
      '<SettingsSection icon="palette" title="Appearance" />',
  },

  STEP_2_ADD_ICON_COMPONENT: {
    description: "Use Icon component instead of Text",
    before: '<Text style={styles.icon}>{icon}</Text>',
    after: '<Icon name={icon} size={24} color={theme.primaryBlue} />',
  },

  STEP_3_UPDATE_IMPORTS: {
    description: "Add Icon import to component",
    before: "import { View, Text } from 'react-native'",
    after:
      "import { View, Text } from 'react-native';\nimport { Icon } from '../components';",
  },

  STEP_4_ADD_ICON_NAMES: {
    description: "Assign semantic icon names to settings",
    before:
      "const settingsConfig = { label: 'Auto Print' }",
    after:
      'const settingsConfig = { label: "Auto Print", icon: "printer-check" }',
  },

  STEP_5_UPDATE_STYLES: {
    description: "Update styles for icon containers",
    before:
      "{ fontSize: 24, color: '#000' }",
    after:
      "{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' }",
  },

  STEP_6_TEST: {
    description: "Test icons on light/dark modes",
    before: "Manual testing",
    after:
      "Verify on iOS/Android in both light and dark modes",
  },
};

// ============================================================================
// QUICK REFERENCE
// ============================================================================

export const QUICK_REFERENCE = {
  DEFAULT_SIZE: 24,
  DEFAULT_COLOR: "theme.primaryBlue",
  DEFAULT_LIBRARY: "material",

  ICON_SIZE_REFERENCE: {
    small: 16,      // Buttons
    medium: 20,     // Default
    large: 24,      // Headers
    xlarge: 32,     // Page headers
  },

  ALL_SECTION_ICONS: [
    "palette",         // Appearance
    "shopping-cart",   // Sales
    "printer",         // Printing
    "cog",             // Defaults
  ],

  POPULAR_ACTION_ICONS: [
    "content-save",    // Save
    "restart",         // Reset
    "delete",          // Delete
    "plus",            // Add
    "minus",           // Remove
    "check-circle",    // Success
    "alert-circle",    // Warning
  ],

  POPULAR_THEME_ICONS: [
    "white-balance-sunny",      // Light
    "moon-waning-crescent",      // Dark
  ],
};

export default {
  NAMING_STANDARDS,
  SIZE_STANDARDS,
  COLOR_STANDARDS,
  LIBRARY_SELECTION,
  COMPONENT_STANDARDS,
  COMMON_PATTERNS,
  ACCESSIBILITY_STANDARDS,
  PERFORMANCE_STANDARDS,
  TESTING_STANDARDS,
  TROUBLESHOOTING,
  MIGRATION_GUIDE,
  QUICK_REFERENCE,
};
