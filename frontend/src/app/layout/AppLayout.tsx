import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../features/auth";
import { useAppTheme } from "../../shared/theme";
import { BrandLogo } from "../../shared/ui";

const shadowStyle =
  Platform.OS === "web"
    ? ({ boxShadow: "0px 10px 24px rgba(31,41,55,0.08)" } as any)
    : {
        shadowColor: "#1F2937",
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 24,
        elevation: 8,
      };

const STAFF_MENU_ITEMS = [
  { route: "Dashboard", icon: "speedometer-outline" as const, label: "لوحة التحكم" },
  { route: "Admin", icon: "grid-outline" as const, label: "لوحة الإدارة" },
  { route: "POS", icon: "storefront-outline" as const, label: "نقطة البيع" },
];

const CASHIER_MENU_ITEMS = [
  { route: "PosShiftStart", icon: "play-circle-outline" as const, label: " الوردية" },
  { route: "PosCashierSales", icon: "cart-outline" as const, label: "البيع" },
  { route: "PosCashierOrders", icon: "list-outline" as const, label: "الطلبات" },
  { route: "PosCashierPayments", icon: "cash-outline" as const, label: "المدفوعات" },
];

const KITCHEN_MENU_ITEMS = [
  { route: "PosShiftStart", icon: "play-circle-outline" as const, label: "الوردية" },
  { route: "PosKitchenKds", icon: "restaurant-outline" as const, label: "المطبخ" },
];

const WAITER_MENU_ITEMS = [
  { route: "PosShiftStart", icon: "play-circle-outline" as const, label: "الوردية" },
  { route: "PosWaiterTables", icon: "grid-outline" as const, label: "الطاولات" },
  { route: "PosWaiterOrderEntry", icon: "restaurant-outline" as const, label: "إدخال الطلب" },
  { route: "PosWaiterTracking", icon: "time-outline" as const, label: "المتابعة" },
  { route: "PosWaiterBill", icon: "receipt-outline" as const, label: "الفاتورة" },
  { route: "PosWaiterOpenOrders", icon: "list-outline" as const, label: "الطلبات" },
];

const ADMIN_ROUTE_NAMES = new Set([
  "Admin",
  "AdminOrders",
  "AdminItems",
  "AdminCategories",
  "PosOrderChannels",
  "PosTableService",
  "PosSalesWorkspace",
  "PosMenuModifiers",
  "PosTaxService",
  "PosPromotions",
  "PosCustomersLoyalty",
  "PosPaymentsBilling",
  "PosKitchenKds",
  "PosShiftCash",
  "PosShiftOpenClose",
  "PosRolesPermissions",
  "PosDriversDelivery",
  "PosPickupWindow",
  "PosDailyReports",
]);

const POS_ROUTE_NAMES = new Set([
  "POS",
  "PosOrderChannels",
  "PosTableService",
  "PosSalesWorkspace",
  "PosMenuModifiers",
  "PosTaxService",
  "PosPromotions",
  "PosCustomersLoyalty",
  "PosPaymentsBilling",
  "PosKitchenKds",
  "PosShiftCash",
  "PosShiftOpenClose",
  "PosRolesPermissions",
  "PosDriversDelivery",
  "PosPickupWindow",
  "PosDailyReports",
  "PosShiftStart",
  "PosCashierSales",
  "PosCashierPayments",
  "PosCashierOrders",
  "PosCashierCustomers",
  "PosCashierCashMovements",
  "PosWaiterTables",
  "PosWaiterOrderEntry",
  "PosWaiterTracking",
  "PosWaiterBill",
  "PosWaiterOpenOrders",
]);

function isMenuItemActive(menuRoute: string, currentRouteName: string) {
  if (menuRoute === "Admin") {
    return ADMIN_ROUTE_NAMES.has(currentRouteName);
  }
  if (menuRoute === "POS") {
    return POS_ROUTE_NAMES.has(currentRouteName);
  }
  return menuRoute === currentRouteName;
}

function MenuIconButton({
  icon,
  active,
  label,
  onPress,
  primaryColor,
  textSubColor,
}: {
  icon: any;
  active: boolean;
  label: string;
  onPress: () => void;
  primaryColor: string;
  textSubColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.menuIconWrap, active && styles.menuIconWrapActive, pressed && styles.menuIconWrapPressed]}
    >
      <Ionicons name={icon} size={22} color={active ? primaryColor : textSubColor} />
    </Pressable>
  );
}

interface AppLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function AppLayout({ title, children }: AppLayoutProps) {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { user, signOut } = useAuth();
  const { theme } = useAppTheme();
  const roles = (user?.roles ?? []).map((role) => role.trim().toLowerCase());
  const kitchenRoleCodes = new Set(["cook", "kitchen", "kitchen_staff", "kitchen_supervisor", "supervisor", "kds_manager"]);
  const waiterRoleCodes = new Set(["waiter", "captain_waiter", "service_staff"]);
  const isKitchenUser = !user?.is_staff && roles.some((role) => kitchenRoleCodes.has(role));
  const isWaiterUser = !user?.is_staff && roles.some((role) => waiterRoleCodes.has(role));
  const menuItems = user?.is_staff
    ? STAFF_MENU_ITEMS
    : isKitchenUser
      ? KITCHEN_MENU_ITEMS
      : isWaiterUser
        ? WAITER_MENU_ITEMS
        : CASHIER_MENU_ITEMS;

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />

      <View style={[styles.sidebar, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.sidebarTop}>
          <View style={styles.logo}>
            <BrandLogo size={48} />
          </View>

          {menuItems.map((item) => (
            <MenuIconButton
              key={item.route}
              icon={item.icon}
              label={item.label}
              primaryColor={theme.primaryBlue}
              textSubColor={theme.textSub}
              active={isMenuItemActive(item.route, route.name)}
              onPress={() => navigation.navigate(item.route)}
            />
          ))}
        </View>

        <View style={styles.sidebarBottom}>
          <MenuIconButton
            icon="settings-outline"
            label="الإعدادات"
            primaryColor={theme.primaryBlue}
            textSubColor={theme.textSub}
            active={route.name === "Settings"}
            onPress={() => navigation.navigate("Settings")}
          />
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [styles.logoutBtn, { backgroundColor: theme.accentOrange }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.main, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.mainHeader}>
          <View style={[styles.userChip, { backgroundColor: theme.soft, borderColor: theme.border }]}>
            <Ionicons name="person-circle-outline" size={18} color={theme.textSub} />
            <Text style={[styles.userText, { color: theme.textMain }]} numberOfLines={1}>
              {user?.username ?? "مستخدم"}
            </Text>
          </View>
          <Text style={[styles.pageTitle, { color: theme.textMain }]}>{title}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    padding: 16,
  },
  sidebar: {
    width: 90,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    justifyContent: "space-between",
    ...shadowStyle,
  },
  sidebarTop: {
    alignItems: "center",
    gap: 14,
  },
  sidebarBottom: {
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    marginBottom: 4,
  },
  menuIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconWrapActive: {
    backgroundColor: "rgba(42,120,188,0.12)",
  },
  menuIconWrapPressed: {
    opacity: 0.75,
  },
  logoutBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    ...shadowStyle,
  },
  mainHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right",
  },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: 220,
  },
  userText: {
    fontWeight: "800",
  },
  content: {
    paddingBottom: 12,
    gap: 12,
  },
});
