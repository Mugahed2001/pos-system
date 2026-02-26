import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../../features/auth";
import { NotificationProvider } from "../../shared/notifications";
import { ThemeProvider } from "../../shared/theme";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NotificationProvider>
          <AuthProvider>{children}</AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
