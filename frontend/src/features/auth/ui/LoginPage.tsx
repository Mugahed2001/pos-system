import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../model/authSlice";
import { LoginForm } from "./components/LoginForm";
import type { LoginPayload } from "../model/types";
import { BrandLogo } from "../../../shared/ui";
import { BRAND_COLORS } from "../../../shared/theme/brand";

const THEME = {
  bg: BRAND_COLORS.bg,
  card: BRAND_COLORS.card,
  primary: BRAND_COLORS.primaryBlue,
  accent: BRAND_COLORS.accentOrange,
  textMain: BRAND_COLORS.textMain,
  textSub: BRAND_COLORS.textSub,
  border: BRAND_COLORS.border,
  danger: BRAND_COLORS.danger,
};

const panelShadowStyle =
  Platform.OS === "web"
    ? ({ boxShadow: "0px 10px 18px rgba(14,53,84,0.08)" } as any)
    : {
        shadowColor: "#0E3554",
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 18,
        elevation: 4,
      };

export function LoginPage() {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (payload: LoginPayload) => {
    setIsLoading(true);
    setError("");
    try {
      await signIn(payload);
    } catch {
      setError("تعذر تسجيل الدخول. تأكد من اسم المستخدم وكلمة المرور.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <View style={styles.logoWrap}>
          <BrandLogo size={74} />
        </View>
        <Text style={styles.badge}>POS</Text>
        <Text style={styles.title}>تسجيل الدخول</Text>
        <Text style={styles.subtitle}>سجّل دخولك للوصول إلى صفحات النظام.</Text>
        <LoginForm isLoading={isLoading} error={error} onSubmit={handleSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: THEME.bg,
    padding: 16,
  },
  panel: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    ...panelShadowStyle,
  },
  logoWrap: {
    alignSelf: "center",
    marginBottom: 6,
  },
  badge: {
    alignSelf: "flex-end",
    backgroundColor: THEME.accent,
    color: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: "900",
  },
  title: {
    textAlign: "right",
    fontSize: 32,
    fontWeight: "900",
    color: THEME.textMain,
  },
  subtitle: {
    textAlign: "right",
    color: THEME.textSub,
    marginBottom: 6,
  },
  error: {
    color: THEME.danger,
    textAlign: "right",
    fontWeight: "800",
  },
});
