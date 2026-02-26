/**
 * Icon mappings for different settings sections and actions
 * Using @expo/vector-icons MaterialCommunityIcons and others
 */

import { MaterialCommunityIcons, FontAwesome5, AntDesign } from "@expo/vector-icons";

export type IconName = string;

// Settings section icons
export const SECTION_ICONS = {
  appearance: "palette" as IconName,           // MaterialCommunityIcons
  sales: "shopping-cart" as IconName,          // MaterialCommunityIcons
  printing: "printer" as IconName,             // MaterialCommunityIcons
  defaults: "cog" as IconName,                 // MaterialCommunityIcons
};

// Action icons
export const ACTION_ICONS = {
  save: "content-save" as IconName,
  reset: "restart" as IconName,
  delete: "delete" as IconName,
  add: "plus-circle" as IconName,
  remove: "minus-circle" as IconName,
  edit: "pencil" as IconName,
  close: "close-circle" as IconName,
};

// Theme icons
export const THEME_ICONS = {
  light: "white-balance-sunny" as IconName,    // MaterialCommunityIcons
  dark: "moon-waning-crescent" as IconName,    // MaterialCommunityIcons
};

export const ICON_SETS = {
  material: MaterialCommunityIcons,
  fontawesome: FontAwesome5,
  antdesign: AntDesign,
};

export interface IconProps {
  name: IconName;
  library?: "material" | "fontawesome" | "antdesign";
  size?: number;
  color?: string;
}

export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_LIBRARY = "material" as const;
