import React from "react";
import { MaterialCommunityIcons, FontAwesome5, AntDesign } from "@expo/vector-icons";
import { useAppTheme } from "../../../shared/theme";

type IconLibrary = "material" | "fontawesome" | "antdesign";

interface IconProps {
  name: string;
  library?: IconLibrary;
  size?: number;
  color?: string;
}

/**
 * Reusable Icon component
 * Supports multiple icon libraries from @expo/vector-icons
 */
export function Icon({
  name,
  library = "material",
  size = 24,
  color,
}: IconProps) {
  const { theme } = useAppTheme();
  const iconColor = color || theme.textMain;

  switch (library) {
    case "fontawesome":
      return <FontAwesome5 name={name} size={size} color={iconColor} />;
    case "antdesign":
      return <AntDesign name={name} size={size} color={iconColor} />;
    case "material":
    default:
      return <MaterialCommunityIcons name={name} size={size} color={iconColor} />;
  }
}
