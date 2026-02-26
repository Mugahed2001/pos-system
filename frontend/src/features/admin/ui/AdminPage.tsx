import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BRAND_COLORS } from "../../../shared/theme/brand";

const THEME = {
  card: BRAND_COLORS.card,
  border: BRAND_COLORS.border,
  primary: BRAND_COLORS.primaryBlue,
  primarySoft: "rgba(42,120,188,0.10)",
  primaryHover: "rgba(42,120,188,0.18)",
  textMain: BRAND_COLORS.textMain,
  textSub: BRAND_COLORS.textSub,
};

const adminCards = [
  {
    route: "AdminOrders",
    title: "إدارة الطلبات",
    description: "متابعة حالة الطلبات اليومية وإدارة سير العمل داخل الفرع.",
    icon: "receipt-outline",
  },
  {
    route: "AdminItems",
    title: "عرض المنتجات",
    description: "استعراض الأصناف المتاحة في النظام مع السعر والحالة.",
    icon: "cube-outline",
  },
  {
    route: "AdminCategories",
    title: "عرض الفئات",
    description: "مراجعة الفئات الرئيسية وتنظيم أصناف القائمة بسهولة.",
    icon: "layers-outline",
  },
  {
    route: "PosTableService",
    title: "إدارة الطاولات والحجوزات",
    description:
      "مخطط الصالة وحالات الطاولات، فتح الجلسة، نقل/دمج/فصل الطاولات، تقسيم المقاعد، مراحل التقديم، الحجوزات وقائمة الانتظار، ومؤقت الخدمة.",
    icon: "restaurant-outline",
  },
  {
    route: "PosPickupWindow",
    title: "شباك الاستلام",
    description: "متابعة طلبات الاستلام عبر الشباك، البحث السريع، وتحديث حالات الوصول والتسليم.",
    icon: "car-outline",
  },
  {
    route: "PosCashierSales",
    title: "نقطة البيع للكاشير",
    description: "شاشة البيع الرئيسية مع اختيار القناة والمنيو والسلة وإرسال المطبخ.",
    icon: "cart-outline",
  },
  {
    route: "PosCashierOrders",
    title: "طلبات الكاشير المفتوحة",
    description: "استعراض الطلبات المعلقة والجارية واستئنافها أو تعليقها.",
    icon: "list-outline",
  },
  {
    route: "PosCashierPayments",
    title: "مدفوعات الكاشير",
    description: "تسجيل الدفعات وتقسيم المدفوعات وطباعة الإيصالات.",
    icon: "cash-outline",
  },
  {
    route: "PosCashierCustomers",
    title: "عملاء سريعون",
    description: "إنشاء عميل سريع وربطه بالطلبات الحالية.",
    icon: "person-outline",
  },
  {
    route: "PosCashierCashMovements",
    title: "حركات النقد",
    description: "إيداعات وسحوبات الكاش المرتبطة بالوردية.",
    icon: "wallet-outline",
  },
  {
    route: "PosShiftOpenClose",
    title: "فتح وإغلاق الوردية",
    description: "تشغيل وردية جديدة أو إغلاق الوردية الحالية مع احتساب الفارق.",
    icon: "timer-outline",
  },
] as const;

export function AdminPage() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>لوحة الإدارة</Text>
      <Text style={styles.subtitle}>اختر القسم المطلوب من البطاقات التالية.</Text>

      <View style={styles.cardsGrid}>
        {adminCards.map((card) => (
          <Pressable
            key={card.route}
            onPress={() => navigation.navigate(card.route)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardTop}>
              <Ionicons name={card.icon} size={22} color={THEME.primary} />
            </View>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardDescription}>{card.description}</Text>
            <View style={styles.cardAction}>
              <Ionicons name="arrow-back" size={16} color={THEME.primary} />
              <Text style={styles.cardActionText}>فتح الصفحة</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: THEME.textMain,
    textAlign: "right",
  },
  subtitle: {
    fontSize: 15,
    color: THEME.textSub,
    textAlign: "right",
  },
  cardsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    minHeight: 170,
    flexBasis: 260,
    flexGrow: 1,
  },
  cardPressed: {
    backgroundColor: THEME.primarySoft,
    borderColor: THEME.primaryHover,
  },
  cardTop: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: THEME.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: THEME.textMain,
    fontWeight: "900",
    fontSize: 20,
    textAlign: "right",
  },
  cardDescription: {
    color: THEME.textSub,
    textAlign: "right",
    lineHeight: 22,
  },
  cardAction: {
    marginTop: "auto",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  cardActionText: {
    color: THEME.primary,
    fontWeight: "800",
    textAlign: "right",
  },
});


