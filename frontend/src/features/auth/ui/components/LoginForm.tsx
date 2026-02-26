import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Input } from "../../../../shared/ui";
import type { LoginPayload } from "../../model/types";
import { BRAND_COLORS } from "../../../../shared/theme/brand";

const THEME = {
  textSub: BRAND_COLORS.textSub,
  danger: BRAND_COLORS.danger,
};

interface LoginFormProps {
  isLoading: boolean;
  error: string;
  onSubmit: (payload: LoginPayload) => Promise<void>;
}

export function LoginForm({ isLoading, error, onSubmit }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async () => {
    await onSubmit({ username: username.trim(), password });
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>اسم المستخدم</Text>
      <Input value={username} onChangeText={setUsername} placeholder="admin" autoCapitalize="none" />

      <Text style={styles.label}>كلمة المرور</Text>
      <Input
        value={password}
        onChangeText={setPassword}
        placeholder="********"
        secureTextEntry
        autoCapitalize="none"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={isLoading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        onPress={handleSubmit}
        disabled={isLoading || !username.trim() || !password}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
  },
  label: {
    fontSize: 14,
    color: THEME.textSub,
    fontWeight: "800",
    textAlign: "right",
  },
  error: {
    color: THEME.danger,
    fontSize: 13,
    textAlign: "right",
    fontWeight: "800",
  },
});
