import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";
import { LoginPage, useAuth } from "../../features/auth";
import { AdminPage, CategoriesViewPage, ItemsViewPage, OrdersManagementPage } from "../../features/admin";
import { DashboardPage } from "../../features/dashboard";
import {
  CustomersLoyaltyPage,
  DailyReportsPage,
  DriversDeliveryPage,
  KitchenKdsPage,
  PickupWindowPage,
  ShiftStartPage,
  MenuModifiersPage,
  OrderChannelsPage,
  PaymentsBillingPage,
  RolesPermissionsPage,
  SalesWorkspacePage,
  ShiftCashPage,
  ShiftOpenClosePage,
  TableServicePage,
  TaxServicePage,
  PromotionsPage,
  SalesPosPage,
  PaymentsPage,
  OpenOrdersPage,
  QuickCustomersPage,
  CashMovementsPage,
  WaiterTablesPage,
  WaiterOrderEntryPage,
  WaiterTrackingPage,
  WaiterBillPage,
  WaiterOpenOrdersPage,
} from "../../features/posOperations";
import { SalesPage } from "../../features/sales";
import { SettingsPage } from "../../features/settings";
import { NotFoundPage } from "../../pages/NotFound";
import { AppLayout } from "../layout/AppLayout";
import { ProtectedRoute } from "./ProtectedRoute";
import { ACTIVE_SHIFT_ID_KEY } from "../../shared/constants/keys";
import { storage } from "../../shared/lib/storage";

export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  Admin: undefined;
  AdminOrders: undefined;
  AdminItems: undefined;
  AdminCategories: undefined;
  PosOrderChannels: undefined;
  PosTableService: undefined;
  PosSalesWorkspace: undefined;
  PosMenuModifiers: undefined;
  PosTaxService: undefined;
  PosPromotions: undefined;
  PosCustomersLoyalty: undefined;
  PosPaymentsBilling: undefined;
  PosKitchenKds: undefined;
  PosShiftCash: undefined;
  PosShiftOpenClose: undefined;
  PosRolesPermissions: undefined;
  PosDriversDelivery: undefined;
  PosPickupWindow: undefined;
  PosDailyReports: undefined;
  PosShiftStart: undefined;
  PosCashierSales: { orderId?: string } | undefined;
  PosCashierPayments: undefined;
  PosCashierOrders: undefined;
  PosCashierCustomers: undefined;
  PosCashierCashMovements: undefined;
  PosWaiterTables: undefined;
  PosWaiterOrderEntry: { orderId?: string } | undefined;
  PosWaiterTracking: undefined;
  PosWaiterBill: undefined;
  PosWaiterOpenOrders: undefined;
  POS: undefined;
  Settings: undefined;
  NotFound: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function DashboardScreen() {
  return (
    <ProtectedRoute>
      <AppLayout title="لوحة التحكم">
        <DashboardPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function AdminScreen() {
  return (
    <ProtectedRoute>
      <AppLayout title="لوحة الإدارة">
        <AdminPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function AdminOrdersScreen() {
  return (
    <ProtectedRoute>
      <AppLayout title="إدارة الطلبات">
        <OrdersManagementPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function AdminItemsScreen() {
  return (
    <ProtectedRoute>
      <AppLayout title="عرض المنتجات">
        <ItemsViewPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function AdminCategoriesScreen() {
  return (
    <ProtectedRoute>
      <AppLayout title="عرض الفئات">
        <CategoriesViewPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function PosOrderChannelsScreen() { return <ProtectedRoute><AppLayout title="قنوات الطلب"><OrderChannelsPage /></AppLayout></ProtectedRoute>; }
function PosTableServiceScreen() { return <ProtectedRoute><AppLayout title="خدمة الطاولات"><TableServicePage /></AppLayout></ProtectedRoute>; }
function PosSalesWorkspaceScreen() { return <ProtectedRoute><AppLayout title="شاشة البيع"><SalesWorkspacePage /></AppLayout></ProtectedRoute>; }
function PosMenuModifiersScreen() { return <ProtectedRoute><AppLayout title="المنيو والمعدلات"><MenuModifiersPage /></AppLayout></ProtectedRoute>; }
function PosTaxServiceScreen() { return <ProtectedRoute><AppLayout title="الضرائب والرسوم"><TaxServicePage /></AppLayout></ProtectedRoute>; }
function PosPromotionsScreen() { return <ProtectedRoute><AppLayout title="الخصومات والعروض"><PromotionsPage /></AppLayout></ProtectedRoute>; }
function PosCustomersLoyaltyScreen() { return <ProtectedRoute><AppLayout title="العملاء والولاء"><CustomersLoyaltyPage /></AppLayout></ProtectedRoute>; }
function PosPaymentsBillingScreen() { return <ProtectedRoute><AppLayout title="الدفع والفوترة"><PaymentsBillingPage /></AppLayout></ProtectedRoute>; }
function PosKitchenKdsScreen() { return <ProtectedRoute><AppLayout title="المطبخ وشاشة الطلبات"><KitchenKdsPage /></AppLayout></ProtectedRoute>; }
function PosShiftCashScreen() { return <ProtectedRoute><AppLayout title="الوردية والكاش"><ShiftCashPage /></AppLayout></ProtectedRoute>; }
function PosShiftOpenCloseScreen() { return <ProtectedRoute><AppLayout title="فتح وإغلاق الوردية"><ShiftOpenClosePage /></AppLayout></ProtectedRoute>; }
function PosRolesPermissionsScreen() { return <ProtectedRoute><AppLayout title="الأدوار والصلاحيات"><RolesPermissionsPage /></AppLayout></ProtectedRoute>; }
function PosDriversDeliveryScreen() { return <ProtectedRoute><AppLayout title="السائقون والتوصيل"><DriversDeliveryPage /></AppLayout></ProtectedRoute>; }
function PosPickupWindowScreen() { return <ProtectedRoute><AppLayout title="شباك الاستلام"><PickupWindowPage /></AppLayout></ProtectedRoute>; }
function PosDailyReportsScreen() { return <ProtectedRoute><AppLayout title="التقارير اليومية"><DailyReportsPage /></AppLayout></ProtectedRoute>; }
function PosShiftStartScreen() { return <ProtectedRoute><AppLayout title=" الوردية"><ShiftStartPage /></AppLayout></ProtectedRoute>; }

function CashierShiftGuard({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<any>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const activeShiftId = await storage.getString(ACTIVE_SHIFT_ID_KEY);
      if (!activeShiftId) {
        navigation.navigate("PosShiftStart");
      }
      if (mounted) setReady(true);
    };
    void check();
    return () => {
      mounted = false;
    };
  }, [navigation]);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return <>{children}</>;
}
function PosCashierSalesScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="نقطة البيع (الكاشير)">
          <SalesPosPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosCashierPaymentsScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="مدفوعات الكاشير">
          <PaymentsPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosCashierOrdersScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="الطلبات المعلقة">
          <OpenOrdersPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosCashierCustomersScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="العملاء السريعون">
          <QuickCustomersPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosCashierCashMovementsScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="حركات النقد">
          <CashMovementsPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosWaiterTablesScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="طاولات الويتر">
          <WaiterTablesPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosWaiterOrderEntryScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="إدخال طلب الويتر">
          <WaiterOrderEntryPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosWaiterTrackingScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="متابعة طلبات الويتر">
          <WaiterTrackingPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosWaiterBillScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="فاتورة الويتر">
          <WaiterBillPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}
function PosWaiterOpenOrdersScreen() {
  return (
    <ProtectedRoute>
      <CashierShiftGuard>
        <AppLayout title="الطلبات المفتوحة (ويتر)">
          <WaiterOpenOrdersPage />
        </AppLayout>
      </CashierShiftGuard>
    </ProtectedRoute>
  );
}

function PosScreen() {
  return (
    <ProtectedRoute>
      <AppLayout title="نقطة البيع">
        <SalesPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function SettingsScreen() {
  return (
    <ProtectedRoute>
      <AppLayout title="الإعدادات">
        <SettingsPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

export function AppRoutes() {
  const { isBootstrapping, isAuthenticated, user } = useAuth();
  const roles = (user?.roles ?? []).map((role) => role.trim().toLowerCase());
  const kitchenRoleCodes = new Set(["cook", "kitchen", "kitchen_staff", "kitchen_supervisor", "supervisor", "kds_manager"]);
  const waiterRoleCodes = new Set(["waiter", "captain_waiter", "service_staff"]);
  const isKitchenUser = !user?.is_staff && roles.some((role) => kitchenRoleCodes.has(role));
  const isWaiterUser = !user?.is_staff && roles.some((role) => waiterRoleCodes.has(role));

  if (isBootstrapping) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator key={isAuthenticated ? "auth" : "guest"} screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          user?.is_staff ? (
            <>
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="Admin" component={AdminScreen} />
              <Stack.Screen name="AdminOrders" component={AdminOrdersScreen} />
              <Stack.Screen name="AdminItems" component={AdminItemsScreen} />
              <Stack.Screen name="AdminCategories" component={AdminCategoriesScreen} />
              <Stack.Screen name="PosOrderChannels" component={PosOrderChannelsScreen} />
              <Stack.Screen name="PosTableService" component={PosTableServiceScreen} />
              <Stack.Screen name="PosSalesWorkspace" component={PosSalesWorkspaceScreen} />
              <Stack.Screen name="PosMenuModifiers" component={PosMenuModifiersScreen} />
              <Stack.Screen name="PosTaxService" component={PosTaxServiceScreen} />
              <Stack.Screen name="PosPromotions" component={PosPromotionsScreen} />
              <Stack.Screen name="PosCustomersLoyalty" component={PosCustomersLoyaltyScreen} />
              <Stack.Screen name="PosPaymentsBilling" component={PosPaymentsBillingScreen} />
              <Stack.Screen name="PosKitchenKds" component={PosKitchenKdsScreen} />
              <Stack.Screen name="PosShiftCash" component={PosShiftCashScreen} />
              <Stack.Screen name="PosShiftOpenClose" component={PosShiftOpenCloseScreen} />
              <Stack.Screen name="PosRolesPermissions" component={PosRolesPermissionsScreen} />
              <Stack.Screen name="PosDriversDelivery" component={PosDriversDeliveryScreen} />
              <Stack.Screen name="PosPickupWindow" component={PosPickupWindowScreen} />
              <Stack.Screen name="PosDailyReports" component={PosDailyReportsScreen} />
              <Stack.Screen name="PosShiftStart" component={PosShiftStartScreen} />
              <Stack.Screen name="PosCashierSales" component={PosCashierSalesScreen} />
              <Stack.Screen name="PosCashierPayments" component={PosCashierPaymentsScreen} />
              <Stack.Screen name="PosCashierOrders" component={PosCashierOrdersScreen} />
              <Stack.Screen name="PosCashierCustomers" component={PosCashierCustomersScreen} />
              <Stack.Screen name="PosCashierCashMovements" component={PosCashierCashMovementsScreen} />
              <Stack.Screen name="POS" component={PosScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="NotFound" component={NotFoundPage} />
            </>
          ) : isKitchenUser ? (
            <>
              <Stack.Screen name="PosShiftStart" component={PosShiftStartScreen} />
              <Stack.Screen name="PosKitchenKds" component={PosKitchenKdsScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="NotFound" component={NotFoundPage} />
            </>
          ) : isWaiterUser ? (
            <>
              <Stack.Screen name="PosShiftStart" component={PosShiftStartScreen} />
              <Stack.Screen name="PosWaiterTables" component={PosWaiterTablesScreen} />
              <Stack.Screen name="PosWaiterOrderEntry" component={PosWaiterOrderEntryScreen} />
              <Stack.Screen name="PosWaiterTracking" component={PosWaiterTrackingScreen} />
              <Stack.Screen name="PosWaiterBill" component={PosWaiterBillScreen} />
              <Stack.Screen name="PosWaiterOpenOrders" component={PosWaiterOpenOrdersScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="NotFound" component={NotFoundPage} />
            </>
          ) : (
            <>
              <Stack.Screen name="PosShiftStart" component={PosShiftStartScreen} />
              <Stack.Screen name="PosCashierSales" component={PosCashierSalesScreen} />
              <Stack.Screen name="PosCashierPayments" component={PosCashierPaymentsScreen} />
              <Stack.Screen name="PosCashierOrders" component={PosCashierOrdersScreen} />
              <Stack.Screen name="PosCashierCustomers" component={PosCashierCustomersScreen} />
              <Stack.Screen name="PosCashierCashMovements" component={PosCashierCashMovementsScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="NotFound" component={NotFoundPage} />
            </>
          )
        ) : (
          <Stack.Screen name="Login" component={LoginPage} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6F8",
  },
});
