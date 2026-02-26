import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
// datetime picker for mobile platforms
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from "@expo/vector-icons";
import type { AppThemePalette } from "../../../../../shared/theme";

import type {
  ChannelDto,
  ErpOfferDto,
  FloorDto,
  ItemDto,
  OrderChannelCode,
  TableDto,
} from "../../../../sales/model/posTypes";

const THEME = {
  card: "#FFFFFF",
  primary: "#2A78BC",
  accent: "#C67E00",
  text: "#18324A",
  muted: "#5E7285",
  border: "#D8E6F2",
  danger: "#C83C3C",
  success: "#1D8A58",
};

type SelectedModifier = {
  groupId: string;
  itemId: string;
  name: string;
  priceDelta: number;
};

type CartLine = {
  lineId: string;
  item: ItemDto;
  qty: number;
  unitPrice: number;
  modifiers: SelectedModifier[];
  notes: string;
};

const CHANNEL_ICON_BY_CODE: Partial<Record<OrderChannelCode, keyof typeof Ionicons.glyphMap>> = {
  dine_in: "restaurant-outline",
  takeaway: "bag-handle-outline",
  pickup: "walk-outline",
  delivery: "bicycle-outline",
  preorder: "calendar-outline",
};

type CartPanelProps = {
  theme: AppThemePalette;
  cart: CartLine[];
  channelLabel: string;
  channels: ChannelDto[];
  selectedChannel: OrderChannelCode;
  onSelectChannel: (code: OrderChannelCode) => void;
  showWindowType: boolean;
  windowType: "internal" | "car";
  onSelectWindowType: (value: "internal" | "car") => void;
  showTableSelection: boolean;
  floors: FloorDto[];
  tables: TableDto[];
  unavailableTableIds: string[];
  selectedFloorId: string | null;
  selectedTableId: string | null;
  seatsCount: number;
  onSelectFloor: (id: string) => void;
  onSelectTable: (id: string) => void;
  onSeatsChange: (value: number) => void;
  isDeliveryContext: boolean;
  showDeliveryPhone: boolean;
  deliveryPhone: string;
  onDeliveryPhoneChange: (value: string) => void;
  deliveryCustomerLabel: string;
  showOrderNotes: boolean;
  orderNotes: string;
  onOrderNotesChange: (value: string) => void;
  availableOffers: ErpOfferDto[];
  couponInput: string;
  appliedCouponCode: string | null;
  appliedOfferId: string | null;
  appliedPromotionLabel: string | null;
  promotionError: string;
  onCouponInputChange: (value: string) => void;
  onApplyCoupon: () => void;
  onSelectOffer: (offerId: string | null) => void;
  onClearPromotion: () => void;
  onUpdateQty: (lineId: string, qty: number) => void;
  onRemoveLine: (lineId: string) => void;
  onOpenModifiers: (lineId: string) => void;
  summary: ReactNode;
  total: number;
  // preorder fields
  scheduledAt: string | null;
  onScheduledAtChange: (value: string | null) => void;
  preorderDestination: "pickup" | "delivery";
  onPreorderDestinationChange: (value: "pickup" | "delivery") => void;
  onHold: () => void;
  onSend: () => void;
  onPrint: () => void;
  onPay: () => void;
  canHold: boolean;
  canSend: boolean;
  canPrint: boolean;
  canPay: boolean;
  compact: boolean;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  online: boolean;
  pendingSync: number;
  rushMode: boolean;
};

export const CartPanel = memo(function CartPanel(props: CartPanelProps) {
  const [detailsCollapsed, setDetailsCollapsed] = useState(true);
  const [cartExpanded, setCartExpanded] = useState(false);
  const detailsContainerRef = useRef<View | null>(null);

  // separate date/time fields for preorder
  const [dateValue, setDateValue] = useState<string>("");
  const [timeValue, setTimeValue] = useState<string>("");

  // mobile picker visibility & mode (date or time)
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");
  const [pickerDate, setPickerDate] = useState<Date>(() => new Date());

  // refs for native html5 inputs on web
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const timeInputRef = useRef<HTMLInputElement | null>(null);

  const palette = useMemo(
    () => ({
      bg: props.theme.card,
      soft: props.theme.soft,
      softAlt: props.theme.mode === "dark" ? "#1E2D3E" : "#FFFFFF",
      border: props.theme.border,
      text: props.theme.textMain,
      muted: props.theme.textSub,
      primary: props.theme.primaryBlue,
      accent: props.theme.accentOrange,
      success: props.theme.success,
      danger: props.theme.danger,
      totalBar: props.theme.mode === "dark" ? "#0C141D" : "#0F172A",
      totalLabel: props.theme.mode === "dark" ? "#C9D4DF" : "#E5E7EB",
      totalValue: props.theme.mode === "dark" ? "#F4F8FC" : "#F8FAFC",
      dangerSoft: props.theme.mode === "dark" ? "#3D2024" : "#FEE2E2",
    }),
    [props.theme],
  );

  const panelStyles = [
    styles.panel,
    props.rushMode && styles.panelRush,
    props.compact && styles.panelCompact,
    props.compact && !props.drawerOpen && styles.panelHidden,
  ];

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (detailsCollapsed) return;

    const onMouseDown = (event: MouseEvent) => {
      const container = detailsContainerRef.current as unknown as { contains?: (node: Node | null) => boolean } | null;
      if (!container?.contains) return;
      if (!container.contains(event.target as Node | null)) {
        setDetailsCollapsed(true);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [detailsCollapsed]);

  // derive separate date/time strings from prop
  useEffect(() => {
    if (props.scheduledAt) {
      const d = new Date(props.scheduledAt);
      if (!isNaN(d.getTime())) {
        setDateValue(d.toISOString().slice(0, 10));
        setTimeValue(d.toISOString().slice(11, 16));
        setPickerDate(d);
      }
    } else {
      setDateValue("");
      setTimeValue("");
    }
  }, [props.scheduledAt]);

  return (
    <View style={[panelStyles, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={styles.panelHeader}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>تفاصيل الطلب</Text>
        {props.compact ? (
          <Pressable accessibilityLabel="إغلاق تفاصيل الطلب" style={styles.closeButton} onPress={props.onToggleDrawer}>
            <Text style={[styles.closeButtonText, { color: palette.primary }]}>إغلاق</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statusRow}>
        <Text style={[styles.metaStrong, { color: palette.text }]}>القناة: {props.channelLabel}</Text>
        <Text style={[styles.metaSoft, { color: palette.muted }]}>{props.online ? "متصل" : "غير متصل"}</Text>
        <Text style={[styles.metaSoft, { color: palette.muted }]}>معلّقات: {props.pendingSync}</Text>
      </View>

      <View style={styles.scrollBodyWrap}>
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollBodyContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
      <View
        ref={detailsContainerRef}
        style={[
          styles.detailsContainer,
          { borderColor: palette.border, backgroundColor: palette.softAlt },
          detailsCollapsed ? styles.detailsContainerCollapsed : styles.detailsContainerExpanded,
        ]}
      >
        <Pressable
          accessibilityLabel={detailsCollapsed ? "توسيع خيارات الطلب" : "طي خيارات الطلب"}
          style={styles.collapseRow}
          onPress={() => setDetailsCollapsed((prev) => !prev)}
        >
          <Text style={[styles.metaSoft, { color: palette.muted }]}>خيارات الطلب</Text>
          <View style={styles.collapseIconButton}>
            <Ionicons name={detailsCollapsed ? "chevron-down-circle" : "chevron-up-circle"} size={26} color={palette.primary} />
          </View>
        </Pressable>

        {!detailsCollapsed ? (
          <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsContent} nestedScrollEnabled>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
              {props.channels.filter((ch) => ch.code !== "pickup_window").map((channel) => (
                <Pressable
                  key={channel.id}
                  accessibilityLabel={`اختيار قناة ${channel.display_name}`}
                  style={[
                    styles.segment,
                    { borderColor: palette.border, backgroundColor: palette.softAlt },
                    props.selectedChannel === channel.code && [styles.segmentActive, { backgroundColor: palette.primary, borderColor: palette.primary }],
                  ]}
                  onPress={() => props.onSelectChannel(channel.code)}
                >
                  {CHANNEL_ICON_BY_CODE[channel.code] ? (
                    <Ionicons
                      name={CHANNEL_ICON_BY_CODE[channel.code] as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={props.selectedChannel === channel.code ? "#FFFFFF" : palette.primary}
                    />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>

            {props.selectedChannel === "preorder" ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: palette.text }]}>موعد الطلب المسبق</Text>
                {/* date picker */}
                <Pressable
                  accessibilityLabel="تحديد تاريخ الطلب المسبق"
                  style={[styles.input, { borderColor: palette.border, backgroundColor: palette.softAlt }]}
                  onPress={() => {
                    if (Platform.OS === "web") {
                      dateInputRef.current?.click();
                    } else {
                      setPickerMode("date");
                      setPickerVisible(true);
                    }
                  }}
                >
                  <Text style={{ color: palette.text }}>
                    {dateValue || "اختر تاريخ"}
                  </Text>
                </Pressable>
                {/* time picker */}
                <Pressable
                  accessibilityLabel="تحديد وقت الطلب المسبق"
                  style={[styles.input, { borderColor: palette.border, backgroundColor: palette.softAlt, marginTop: 6 }]}
                  onPress={() => {
                    if (Platform.OS === "web") {
                      timeInputRef.current?.click();
                    } else {
                      setPickerMode("time");
                      setPickerVisible(true);
                    }
                  }}
                >
                  <Text style={{ color: palette.text }}>
                    {timeValue || "اختر وقت"}
                  </Text>
                </Pressable>
                {pickerVisible && Platform.OS !== "web" ? (
                  <DateTimePicker
                    value={pickerDate}
                    mode={pickerMode}
                    display="default"
                    onChange={(event, date) => {
                      setPickerVisible(false);
                      if (!date) return;
                      if (pickerMode === "date") {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        const d = String(date.getDate()).padStart(2, "0");
                        setDateValue(`${y}-${m}-${d}`);
                      } else {
                        const h = String(date.getHours()).padStart(2, "0");
                        const min = String(date.getMinutes()).padStart(2, "0");
                        setTimeValue(`${h}:${min}`);
                      }
                      // combine if both parts present
                      if (dateValue && timeValue) {
                        const combined = new Date(`${dateValue}T${timeValue}`);
                        props.onScheduledAtChange(combined.toISOString());
                      }
                      // update local pickerDate so next open shows current
                      setPickerDate(date);
                    }}
                  />
                ) : null}
                {Platform.OS === "web" ? (
                  <>
                    <input
                      ref={dateInputRef}
                      type="date"
                      style={{ display: "none" }}
                      min={new Date().toISOString().split("T")[0]}
                      value={dateValue}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setDateValue(val);
                        if (val && timeValue) {
                          const combined = new Date(`${val}T${timeValue}`);
                          props.onScheduledAtChange(combined.toISOString());
                        }
                      }}
                    />
                    <input
                      ref={timeInputRef}
                      type="time"
                      style={{ display: "none" }}
                      value={timeValue}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setTimeValue(val);
                        if (dateValue && val) {
                          const combined = new Date(`${dateValue}T${val}`);
                          props.onScheduledAtChange(combined.toISOString());
                        }
                      }}
                    />
                  </>
                ) : null}
                <Text style={[styles.sectionLabel, { color: palette.text }]}>قناة الطلب عند التوقيت</Text>
                <View style={styles.row}>
                  <Pressable
                    accessibilityLabel="استلام عند الموعد"
                    style={[
                      styles.chip,
                      { borderColor: palette.border, backgroundColor: palette.softAlt },
                      props.preorderDestination === "pickup" && [styles.chipActive, { backgroundColor: palette.primary, borderColor: palette.primary }],
                    ]}
                    onPress={() => props.onPreorderDestinationChange("pickup")}
                  >
                    <Text style={[styles.chipText, { color: palette.text }, props.preorderDestination === "pickup" && styles.chipTextActive]}>استلام</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="توصيل عند الموعد"
                    style={[
                      styles.chip,
                      { borderColor: palette.border, backgroundColor: palette.softAlt },
                      props.preorderDestination === "delivery" && [styles.chipActive, { backgroundColor: palette.primary, borderColor: palette.primary }],
                    ]}
                    onPress={() => props.onPreorderDestinationChange("delivery")}
                  >
                    <Text style={[styles.chipText, { color: palette.text }, props.preorderDestination === "delivery" && styles.chipTextActive]}>توصيل</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {props.showWindowType ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: palette.text }]}>نوع الكاشير</Text>
                <View style={styles.row}>
                  <Pressable
                    accessibilityLabel="اختيار كاشير داخلي"
                    style={[
                      styles.chip,
                      { borderColor: palette.border, backgroundColor: palette.softAlt },
                      props.windowType === "internal" && [styles.chipActive, { backgroundColor: palette.primary, borderColor: palette.primary }],
                    ]}
                    onPress={() => props.onSelectWindowType("internal")}
                  >
                    <Text style={[styles.chipText, { color: palette.text }, props.windowType === "internal" && styles.chipTextActive]}>كاشير داخلي</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="اختيار كاشير خارجي"
                    style={[
                      styles.chip,
                      { borderColor: palette.border, backgroundColor: palette.softAlt },
                      props.windowType === "car" && [styles.chipActive, { backgroundColor: palette.primary, borderColor: palette.primary }],
                    ]}
                    onPress={() => props.onSelectWindowType("car")}
                  >
                    <Text style={[styles.chipText, { color: palette.text }, props.windowType === "car" && styles.chipTextActive]}>كاشير خارجي</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {props.showTableSelection && props.selectedChannel === "dine_in" ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: palette.text }]}>الطاولة</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {props.floors.map((floor) => (
                    <Pressable
                      key={floor.id}
                      accessibilityLabel={`اختيار منطقة ${floor.name}`}
                      style={[
                        styles.chip,
                        { borderColor: palette.border, backgroundColor: palette.softAlt },
                        props.selectedFloorId === floor.id && [styles.chipActive, { backgroundColor: palette.primary, borderColor: palette.primary }],
                      ]}
                      onPress={() => props.onSelectFloor(floor.id)}
                    >
                      <Text style={[styles.chipText, { color: palette.text }, props.selectedFloorId === floor.id && styles.chipTextActive]}>{floor.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {props.tables
                    .filter((table) => !props.selectedFloorId || table.floor === props.selectedFloorId)
                    .map((table) => (
                      (() => {
                        const isOutOfService = table.status === "reserved";
                        const isUnavailable = props.unavailableTableIds.includes(table.id);
                        const isOccupied = table.status === "occupied";
                        const isBlocked = isOutOfService || isUnavailable;
                        return (
                      <Pressable
                        key={table.id}
                        accessibilityLabel={`اختيار الطاولة ${table.code}${isOutOfService ? " خارج الخدمة" : isUnavailable ? " غير مسددة" : isOccupied ? " مشغولة" : ""}`}
                        style={[
                          styles.tableChip,
                          { borderColor: palette.border, backgroundColor: palette.softAlt },
                          isBlocked && styles.tableChipBlocked,
                          !isBlocked && isOccupied && styles.tableChipOccupied,
                          props.selectedTableId === table.id && [styles.tableChipActive, { borderColor: palette.primary, backgroundColor: palette.soft }],
                        ]}
                        onPress={() => {
                          if (isBlocked) return;
                          props.onSelectTable(table.id);
                        }}
                        disabled={isBlocked}
                      >
                        <Text
                          style={[
                            styles.tableChipText,
                            { color: palette.text },
                            isBlocked && styles.tableChipTextBlocked,
                            !isBlocked && isOccupied && styles.tableChipTextOccupied,
                            props.selectedTableId === table.id && [styles.tableChipTextActive, { color: palette.primary }],
                          ]}
                        >
                          {table.code}
                        </Text>
                        {isOutOfService ? <Text style={styles.tableChipBlockedHint}>خارج الخدمة</Text> : null}
                        {!isOutOfService && isUnavailable ? <Text style={styles.tableChipBlockedHint}>غير مسددة</Text> : null}
                        {!isBlocked && isOccupied ? <Text style={styles.tableChipOccupiedHint}>مشغولة</Text> : null}
                      </Pressable>
                        );
                      })()
                    ))}
                </ScrollView>
                <TextInput
                  accessibilityLabel="عدد المقاعد"
                  value={String(props.seatsCount)}
                  onChangeText={(val) => props.onSeatsChange(Math.max(1, Number(val) || 1))}
                  keyboardType="numeric"
                  placeholder="عدد المقاعد"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.softAlt }]}
                />
              </View>
            ) : null}

            {props.showDeliveryPhone && props.isDeliveryContext ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: palette.text }]}>رقم العميل</Text>
                <TextInput
                  accessibilityLabel="رقم هاتف العميل"
                  value={props.deliveryPhone}
                  onChangeText={props.onDeliveryPhoneChange}
                  keyboardType="phone-pad"
                  placeholder="ادخل رقم الهاتف"
                  placeholderTextColor={palette.muted}
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.softAlt }]}
                />
                <Text style={[styles.metaSoft, { color: palette.muted }]}>الاسم في الطلب: {props.deliveryCustomerLabel}</Text>
              </View>
            ) : null}

            {props.showOrderNotes ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: palette.text }]}>ملاحظات على الطلب</Text>
                <TextInput
                  accessibilityLabel="ملاحظات الطلب"
                  value={props.orderNotes}
                  onChangeText={props.onOrderNotesChange}
                  placeholder="ملاحظات إضافية..."
                  placeholderTextColor={palette.muted}
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.softAlt }]}
                />
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: palette.text }]}>العروض والكوبونات</Text>
              <TextInput
                accessibilityLabel="إدخال كوبون"
                value={props.couponInput}
                onChangeText={props.onCouponInputChange}
                placeholder="أدخل كود الكوبون"
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.softAlt }]}
              />
              <View style={styles.row}>
                <Pressable
                  accessibilityLabel="تطبيق الكوبون"
                  style={[styles.couponApplyButton, { backgroundColor: palette.primary }]}
                  onPress={props.onApplyCoupon}
                >
                  <Text style={styles.couponApplyButtonText}>تطبيق الكوبون</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="مسح العرض أو الكوبون"
                  style={[styles.couponClearButton, { borderColor: palette.border, backgroundColor: palette.softAlt }]}
                  onPress={props.onClearPromotion}
                >
                  <Text style={[styles.couponClearButtonText, { color: palette.muted }]}>مسح</Text>
                </Pressable>
              </View>

              {props.availableOffers.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {props.availableOffers.map((offer) => (
                    <Pressable
                      key={offer.id}
                      accessibilityLabel={`اختيار عرض ${offer.title}`}
                      style={[
                        styles.chip,
                        { borderColor: palette.border, backgroundColor: palette.softAlt },
                        props.appliedOfferId === offer.id && [styles.chipActive, { backgroundColor: palette.primary, borderColor: palette.primary }],
                      ]}
                      onPress={() => props.onSelectOffer(props.appliedOfferId === offer.id ? null : offer.id)}
                    >
                      <Text style={[styles.chipText, { color: palette.text }, props.appliedOfferId === offer.id && styles.chipTextActive]}>
                        {offer.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {props.appliedPromotionLabel ? (
                <Text style={[styles.metaSoft, { color: palette.success }]}>المطبق: {props.appliedPromotionLabel}</Text>
              ) : null}
              {!props.appliedPromotionLabel && props.appliedCouponCode ? (
                <Text style={[styles.metaSoft, { color: palette.success }]}>الكوبون المطبق: {props.appliedCouponCode}</Text>
              ) : null}
              {props.promotionError ? (
                <Text style={[styles.metaSoft, { color: palette.danger }]}>{props.promotionError}</Text>
              ) : null}
            </View>
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.cartTitleRow}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>السلة</Text>
        <Pressable style={styles.linkButton} onPress={() => setCartExpanded((prev) => !prev)}>
          <Text style={[styles.linkText, { color: palette.primary }]}>{cartExpanded ? "تصغير السلة" : "تمديد السلة"}</Text>
        </Pressable>
      </View>
      <FlatList
        style={[styles.cartList, !props.compact && styles.cartListByContent, cartExpanded && styles.cartListExpanded]}
        contentContainerStyle={styles.cartListContent}
        data={props.cart}
        keyExtractor={(line) => line.lineId}
        ItemSeparatorComponent={() => <View style={styles.cartSeparator} />}
        ListEmptyComponent={<Text style={[styles.metaSoft, { color: palette.muted }]}>لا توجد أصناف في السلة.</Text>}
        nestedScrollEnabled
        renderItem={({ item: line }) => (
          <View style={[styles.cartLine, { borderColor: palette.border, backgroundColor: palette.softAlt }]}>
            {/* Show unit price as the primary value and keep line subtotal visible as supporting detail. */}
            {(() => {
              const modifiersPerUnit = line.modifiers.reduce((sum, mod) => sum + mod.priceDelta, 0);
              const unitBeforeTax = line.unitPrice + modifiersPerUnit;
              const lineSubtotalBeforeTax = unitBeforeTax * line.qty;
              return (
                <>
            <View style={styles.cartHeader}>
              <Text style={[styles.itemTitle, { color: palette.text }]}>{line.item.item_name}</Text>
              <Text style={[styles.itemPrice, { color: palette.primary }]}>{unitBeforeTax.toFixed(2)}</Text>
            </View>
            <Text style={[styles.lineSubtotalText, { color: palette.muted }]}>إجمالي الصنف قبل الضريبة: {lineSubtotalBeforeTax.toFixed(2)}</Text>
            <View style={styles.rowBetween}>
              <View style={styles.row}>
                <Pressable
                  accessibilityLabel="تقليل الكمية"
                  style={[styles.qtyButton, { borderColor: palette.border, backgroundColor: palette.softAlt }]}
                  onPress={() => props.onUpdateQty(line.lineId, line.qty - 1)}
                >
                  <Text style={[styles.qtyText, { color: palette.text }]}>-</Text>
                </Pressable>
                <Text style={[styles.qtyValue, { color: palette.text }]}>{line.qty}</Text>
                <Pressable
                  accessibilityLabel="زيادة الكمية"
                  style={[styles.qtyButton, { borderColor: palette.border, backgroundColor: palette.softAlt }]}
                  onPress={() => props.onUpdateQty(line.lineId, line.qty + 1)}
                >
                  <Text style={[styles.qtyText, { color: palette.text }]}>+</Text>
                </Pressable>
              </View>
              <View style={styles.row}>
                <Pressable accessibilityLabel="فتح الإضافات" style={styles.linkButton} onPress={() => props.onOpenModifiers(line.lineId)}>
                  <Text style={[styles.linkText, { color: palette.primary }]}>إضافات</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="حذف الصنف"
                  style={[styles.removeButton, { backgroundColor: palette.dangerSoft }]}
                  onPress={() => props.onRemoveLine(line.lineId)}
                >
                  <Text style={[styles.removeButtonText, { color: palette.danger }]}>حذف</Text>
                </Pressable>
              </View>
            </View>
            {line.modifiers.length ? (
              <Text style={[styles.metaSoft, { color: palette.muted }]} numberOfLines={1}>
                الإضافات: {line.modifiers.map((mod) => mod.name).join("، ")}
              </Text>
            ) : null}
                </>
              );
            })()}
          </View>
        )}
      />
        </ScrollView>
      </View>

      <View style={[styles.footerSticky, { borderTopColor: palette.border, backgroundColor: palette.bg }]}>
        <View style={[styles.summaryBox, { borderColor: palette.border, backgroundColor: palette.softAlt }]}>{props.summary}</View>

        <View style={[styles.totalBar, { backgroundColor: palette.totalBar }]}>
          <Text style={[styles.totalLabel, { color: palette.totalLabel }]}>الإجمالي</Text>
          <Text style={[styles.totalValue, { color: palette.totalValue }]}>{props.total.toFixed(2)}</Text>
        </View>

        <View style={styles.actionsRow}>
          {props.canHold ? (
            <Pressable
              accessibilityLabel="تعليق الطلب"
              style={[styles.holdButton, { borderColor: palette.border, backgroundColor: palette.soft }]}
              onPress={props.onHold}
            >
              <Text style={[styles.holdButtonText, { color: palette.muted }]}>تعليق</Text>
            </Pressable>
          ) : null}
          {props.canSend ? (
            <Pressable accessibilityLabel="إرسال الطلب للمطبخ" style={[styles.sendButton, { backgroundColor: palette.primary }]} onPress={props.onSend}>
              <Text style={styles.sendButtonText}>إرسال للمطبخ</Text>
            </Pressable>
          ) : null}
          {props.canPrint ? (
            <Pressable accessibilityLabel="طباعة الفاتورة" style={[styles.printButton, { backgroundColor: palette.accent }]} onPress={props.onPrint}>
              <Text style={styles.printButtonText}>طباعة</Text>
            </Pressable>
          ) : null}
          {props.canPay ? (
            <Pressable accessibilityLabel="إتمام الدفع" style={[styles.payButton, { backgroundColor: palette.success }]} onPress={props.onPay}>
              <Text style={styles.payButtonText}>دفع</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: THEME.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
    gap: 10,
  },
  panelRush: {
    padding: 6,
    gap: 4,
  },
  panelByContent: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    alignSelf: "stretch",
  },
  panelCompact: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 360,
    maxWidth: "94%",
    zIndex: 15,
  },
  panelHidden: {
    transform: [{ translateX: 380 }],
  },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeButton: { paddingHorizontal: 8, paddingVertical: 4 },
  closeButtonText: { color: THEME.primary, fontWeight: "800" },

  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scrollBodyWrap: { flex: 1, minHeight: 0 },
  scrollBody: { flex: 1, minHeight: 0 },
  scrollBodyContent: { gap: 8, paddingBottom: 8 },
  detailsContainer: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  detailsContainerCollapsed: {
    minHeight: 44,
    maxHeight: 44,
  },
  detailsContainerExpanded: {
    minHeight: 220,
    maxHeight: 220,
  },
  detailsScroll: {
    flex: 1,
  },
  detailsContent: {
    gap: 6,
    paddingBottom: 2,
  },
  collapseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  collapseIconButton: { paddingHorizontal: 2, paddingVertical: 2 },
  cartTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: THEME.text, textAlign: "right" },
  section: { gap: 4 },
  sectionLabel: { fontWeight: "800", color: THEME.text, textAlign: "right", fontSize: 14 },
  metaStrong: { color: THEME.text, textAlign: "right", fontWeight: "800", fontSize: 13 },
  metaSoft: { color: THEME.muted, textAlign: "right", fontWeight: "700", fontSize: 13 },

  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  segmentRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2 },
  segment: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  segmentActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },

  chip: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 34,
    justifyContent: "center",
  },
  chipActive: { backgroundColor: THEME.primary, borderColor: THEME.primary },
  chipText: { color: THEME.text, fontWeight: "700", textAlign: "right", fontSize: 14 },
  chipTextActive: { color: "#fff" },

  tableChip: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    minWidth: 44,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  tableChipActive: { backgroundColor: "#EAF3FB", borderColor: THEME.primary },
  tableChipBlocked: { borderColor: "#DC2626", backgroundColor: "#FEF2F2" },
  tableChipOccupied: { borderColor: THEME.accent, backgroundColor: "#FFF7ED" },
  tableChipText: { color: THEME.text, fontWeight: "900", fontSize: 15 },
  tableChipTextActive: { color: THEME.primary },
  tableChipTextBlocked: { color: "#B91C1C" },
  tableChipTextOccupied: { color: THEME.accent },
  tableChipBlockedHint: { color: "#B91C1C", fontSize: 11, fontWeight: "800" },
  tableChipOccupiedHint: { color: THEME.accent, fontSize: 11, fontWeight: "800" },

  input: {
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    color: THEME.text,
    textAlign: "right",
    backgroundColor: "#fff",
  },

  cartList: { minHeight: 220, maxHeight: 440 },
  cartListByContent: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  cartListExpanded: { minHeight: 340, maxHeight: 720 },
  cartListContent: { paddingBottom: 8 },
  cartSeparator: { height: 4 },
  cartLine: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 10, gap: 6, backgroundColor: "#fff" },
  cartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineSubtotalText: { fontWeight: "700", fontSize: 13, textAlign: "right" },
  itemTitle: { fontWeight: "800", color: THEME.text, textAlign: "right", flex: 1, marginLeft: 8 },
  itemPrice: { color: THEME.primary, fontWeight: "900", textAlign: "right", fontSize: 15 },

  qtyButton: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  qtyText: { fontWeight: "900", color: THEME.text, fontSize: 16 },
  qtyValue: { fontWeight: "800", color: THEME.text, minWidth: 20, textAlign: "center" },

  linkButton: { paddingHorizontal: 6, paddingVertical: 4 },
  linkText: { color: THEME.primary, fontWeight: "800" },
  removeButton: { backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  removeButtonText: { color: THEME.danger, fontWeight: "800" },

  footerSticky: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    gap: 6,
    backgroundColor: THEME.card,
  },
  summaryBox: { borderWidth: 1, borderColor: THEME.border, borderRadius: 10, padding: 8, backgroundColor: "#fff" },

  totalBar: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: { color: "#E5E7EB", fontWeight: "800", fontSize: 15 },
  totalValue: { color: "#F8FAFC", fontWeight: "900", fontSize: 24 },

  actionsRow: { flexDirection: "row", gap: 6 },
  holdButton: {
    flex: 0.9,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  holdButtonText: { color: "#4B5563", fontWeight: "900" },
  couponApplyButton: {
    flex: 1,
    borderRadius: 8,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  couponApplyButtonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  couponClearButton: {
    minWidth: 64,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  couponClearButtonText: { fontWeight: "800", fontSize: 13 },
  sendButton: {
    flex: 1.1,
    backgroundColor: THEME.primary,
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: { color: "#fff", fontWeight: "900" },
  printButton: {
    flex: 1,
    backgroundColor: "#F59E0B",
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  printButtonText: { color: "#fff", fontWeight: "900" },
  payButton: {
    flex: 1.3,
    backgroundColor: THEME.success,
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  payButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});





