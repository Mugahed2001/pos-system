import { Image, StyleSheet, View } from "react-native";

type BrandLogoProps = {
  size?: number;
};

const BRAND_ICON = require("../../assets/icons/icon.jpeg");

export function BrandLogo({ size = 56 }: BrandLogoProps) {
  return (
    <View style={[styles.root, { width: size, height: size }]} accessibilityLabel="شعار النظام">
      <Image source={BRAND_ICON} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
});
