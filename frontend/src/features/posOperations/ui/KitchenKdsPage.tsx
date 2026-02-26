import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ENV } from "../../../app/config/env";
import { AUTH_TOKEN_KEY, DEVICE_TOKEN_KEY, POS_CASHIER_SETTINGS_KEY } from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import { playPosAlertTone } from "../../../shared/lib/soundAlerts";
import { useAuth } from "../../auth";
import { fetchKdsQueue, markExternalOrderReady, markKdsItemStatus, updateOrderPriority } from "../api/opsApi";
import { usePosOpsBootstrap } from "../model/usePosOpsBootstrap";

type KdsStatus = "new" | "preparing" | "ready" | "served";
type KitchenPriority = "low" | "normal" | "high" | "urgent";
type SyncState = "idle" | "sending" | "success" | "error";

interface KdsItemDto {
  id: string;
  order_id: string;
  order_item_id: string;
  order_number: number | null;
  channel_code: string;
  kitchen_priority: KitchenPriority;
  station: string;
  status: KdsStatus;
  status_at: string;
  queued_at: string;
  item_name: string;
  item_quantity: string;
  order_notes: string;
  item_notes: string;
  can_move_next?: boolean;
  can_change_priority?: boolean;
  external_order_id?: string | null;
  provider_code?: string | null;
  provider_order_id?: string | null;
}

interface AssemblyTicket {
  orderId: string;
  orderNumber: number | null;
  channelCode: string;
  kitchenPriority: KitchenPriority;
  stationSummary: string;
  queuedAt: string;
  orderNotes: string;
  externalOrderId: string | null;
  readyItemIds: string[];
  readyLines: string[];
  canServe: boolean;
}

interface KdsOrderGroup {
  orderId: string;
  orderNumber: number | null;
  channelCode: string;
  kitchenPriority: KitchenPriority;
  stationSummary: string;
  queuedAt: string;
  orderNotes: string;
  items: KdsItemDto[];
}

const STATUS_LABELS: Record<KdsStatus, string> = {
  new: "جديد",
  preparing: "قيد التحضير",
  ready: "جاهز",
  served: "تم التقديم",
};

const CHANNEL_LABELS: Record<string, string> = {
  dine_in: "محلي",
  takeaway: "سفري",
  pickup: "استلام",
  pickup_window: "شباك الاستلام",
  delivery: "توصيل",
  preorder: "طلب مسبق",
};

const PRIORITY_LABELS: Record<KitchenPriority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

const PRIORITY_ORDER: KitchenPriority[] = ["urgent", "high", "normal", "low"];
const KDS_COLUMNS: KdsStatus[] = ["new", "preparing", "ready"];

const NEXT_STATUS: Partial<Record<KdsStatus, KdsStatus>> = {
  new: "preparing",
  preparing: "ready",
  ready: "served",
};

const STATUS_ACTION_LABEL: Partial<Record<KdsStatus, string>> = {
  new: "بدء",
  preparing: "جاهز",
  ready: "تم التقديم",
};

const COOK_ROLES = new Set(["cook", "kitchen", "kitchen_staff"]);
const SUPERVISOR_ROLES = new Set(["kitchen_supervisor", "supervisor", "manager", "kds_manager"]);

const priorityRank = (priority: KitchenPriority) => PRIORITY_ORDER.indexOf(priority);

const normalizeRole = (role: string) => role.trim().toLowerCase();

function buildWsBaseUrl() {
  const apiUrl = ENV.apiBaseUrl;
  const wsUrl = apiUrl.replace(/^http/, "ws");
  const withoutApi = wsUrl.endsWith("/api") ? wsUrl.slice(0, -4) : wsUrl;
  return withoutApi;
}

const STATION_LABELS: Record<string, string> = {
  hot: "الساخن",
  cold: "البارد",
  grill: "الشواية",
  fryer: "القلاية",
  bar: "البار",
  pastry: "الحلويات",
  kitchen: "المطبخ",
  assembly: "التجميع",
};

function formatStationLabel(station: string) {
  if (!station) return "-";
  const normalized = station.trim().toLowerCase();
  return STATION_LABELS[normalized] ?? station;
}

export function KitchenKdsPage() {
  const { loading, error, branchId } = usePosOpsBootstrap();
  const { user } = useAuth();

  const [queue, setQueue] = useState<KdsItemDto[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [stationFilter, setStationFilter] = useState("all");
  const [syncState, setSyncState] = useState<Record<string, SyncState>>({});
  const [nowTick, setNowTick] = useState(Date.now());
  const [usePollingFallback, setUsePollingFallback] = useState(!ENV.enablePosWs);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopWsRef = useRef(false);
  const wsFailuresRef = useRef(0);
  const previousItemStatusRef = useRef<Record<string, KdsStatus> | null>(null);

  const roleSet = useMemo(() => new Set((user?.roles ?? []).map(normalizeRole)), [user?.roles]);
  const hasCookRole = useMemo(() => [...roleSet].some((r) => COOK_ROLES.has(r)), [roleSet]);
  const hasSupervisorRole = useMemo(() => [...roleSet].some((r) => SUPERVISOR_ROLES.has(r)), [roleSet]);

  const canSetPriorityByRole = Boolean(user?.is_staff || hasSupervisorRole);

  const canMoveStatusByRole = useCallback(
    (item: KdsItemDto, nextStatus: KdsStatus) => {
      if (user?.is_staff) return true;
      if (nextStatus === "served") return hasSupervisorRole;
      return hasCookRole || hasSupervisorRole;
    },
    [hasCookRole, hasSupervisorRole, user?.is_staff],
  );

  const loadQueue = useCallback(async () => {
    if (!branchId) {
      setQueue([]);
      setQueueLoading(false);
      return;
    }
    setQueueLoading(true);
    setQueueError("");
    try {
      const payload = await fetchKdsQueue(branchId, stationFilter === "all" ? undefined : stationFilter);
      setQueue(payload as KdsItemDto[]);
    } catch {
      setQueueError("تعذر تحميل قائمة المطبخ.");
    } finally {
      setQueueLoading(false);
    }
  }, [branchId, stationFilter]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    void storage.getString(POS_CASHIER_SETTINGS_KEY).then((raw) => {
      if (!mounted) return;
      try {
        const parsed = raw ? (JSON.parse(raw) as { soundAlerts?: unknown }) : null;
        setSoundAlertsEnabled(parsed?.soundAlerts !== false);
      } catch {
        setSoundAlertsEnabled(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    stopWsRef.current = false;
    wsFailuresRef.current = 0;
    if (!ENV.enablePosWs || !branchId) {
      setUsePollingFallback(true);
      return;
    }

    const connect = async () => {
      if (stopWsRef.current || wsFailuresRef.current >= 5) return;
      const [token, storedDeviceToken] = await Promise.all([
        storage.getString(AUTH_TOKEN_KEY),
        storage.getString(DEVICE_TOKEN_KEY),
      ]);
      if (!token) return;
      const base = buildWsBaseUrl();
      const url = `${base}/ws/pos/kds/${branchId}/?token=${encodeURIComponent(token)}&device_token=${encodeURIComponent(storedDeviceToken || ENV.defaultDeviceToken || "")}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      const connectedAt = Date.now();
      let opened = false;

      ws.onopen = () => {
        opened = true;
        wsFailuresRef.current = 0;
        setUsePollingFallback(false);
      };

      ws.onmessage = () => {
        wsFailuresRef.current = 0;
        void loadQueue();
      };

      ws.onclose = () => {
        if (stopWsRef.current) return;
        const closedBeforeOpen = !opened && Date.now() - connectedAt < 2000;
        if (closedBeforeOpen) {
          wsFailuresRef.current = 5;
          setUsePollingFallback(true);
          return;
        }
        wsFailuresRef.current += 1;
        if (wsFailuresRef.current >= 5) {
          setUsePollingFallback(true);
          return;
        }
        reconnectRef.current = setTimeout(() => {
          void connect();
        }, Math.min(15000, wsFailuresRef.current * 2000));
      };

      ws.onerror = () => ws.close();
    };

    void connect();
    return () => {
      stopWsRef.current = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [branchId, loadQueue]);

  useEffect(() => {
    if (!branchId || !usePollingFallback) return;
    const timer = setInterval(() => {
      void loadQueue();
    }, 8000);
    return () => clearInterval(timer);
  }, [branchId, loadQueue, usePollingFallback]);

  useEffect(() => {
    const currentStatusByItem: Record<string, KdsStatus> = {};
    for (const item of queue) currentStatusByItem[item.id] = item.status;

    const previous = previousItemStatusRef.current;
    if (!previous) {
      previousItemStatusRef.current = currentStatusByItem;
      return;
    }

    if (soundAlertsEnabled) {
      let hasNewKitchenOrder = false;
      let hasWaiterReceived = false;

      for (const item of queue) {
        const prevStatus = previous[item.id];
        if (!prevStatus && item.status === "new") hasNewKitchenOrder = true;
        if (prevStatus && prevStatus !== "served" && item.status === "served") hasWaiterReceived = true;
      }

      if (hasNewKitchenOrder) {
        void playPosAlertTone("kitchen_new_order");
      }
      if (hasWaiterReceived) {
        void playPosAlertTone("kitchen_waiter_received");
      }
    }

    previousItemStatusRef.current = currentStatusByItem;
  }, [queue, soundAlertsEnabled]);

  const stations = useMemo(() => {
    const unique = new Set(queue.map((entry) => entry.station).filter(Boolean));
    return ["all", ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [queue]);

  const groupedByStatus = useMemo(() => {
    const initial: Record<KdsStatus, KdsItemDto[]> = {
      new: [],
      preparing: [],
      ready: [],
      served: [],
    };
    for (const item of queue) {
      initial[item.status]?.push(item);
    }
    for (const status of Object.keys(initial) as KdsStatus[]) {
      initial[status].sort((a, b) => {
        const byPriority = priorityRank(a.kitchen_priority) - priorityRank(b.kitchen_priority);
        if (byPriority !== 0) return byPriority;
        return new Date(a.queued_at || a.status_at).getTime() - new Date(b.queued_at || b.status_at).getTime();
      });
    }
    return initial;
  }, [queue]);

  const groupedByStatusByOrder = useMemo(() => {
    const initial: Record<KdsStatus, KdsOrderGroup[]> = {
      new: [],
      preparing: [],
      ready: [],
      served: [],
    };

    for (const status of Object.keys(groupedByStatus) as KdsStatus[]) {
      const byOrder = new Map<string, KdsItemDto[]>();
      for (const item of groupedByStatus[status]) {
        const current = byOrder.get(item.order_id) ?? [];
        current.push(item);
        byOrder.set(item.order_id, current);
      }

      const orders: KdsOrderGroup[] = [];
      for (const [orderId, items] of byOrder.entries()) {
        const first = items[0];
        const stationSummary = Array.from(new Set(items.map((item) => item.station).filter(Boolean))).join(" / ");
        const queuedAt = items.reduce((minIso, item) => {
          const currentIso = item.queued_at || item.status_at;
          if (!minIso) return currentIso;
          return new Date(currentIso).getTime() < new Date(minIso).getTime() ? currentIso : minIso;
        }, first?.queued_at || first?.status_at || new Date().toISOString());

        orders.push({
          orderId,
          orderNumber: first?.order_number ?? null,
          channelCode: first?.channel_code ?? "",
          kitchenPriority: first?.kitchen_priority ?? "normal",
          stationSummary,
          queuedAt,
          orderNotes: first?.order_notes ?? "",
          items,
        });
      }

      orders.sort((a, b) => {
        const byPriority = priorityRank(a.kitchenPriority) - priorityRank(b.kitchenPriority);
        if (byPriority !== 0) return byPriority;
        return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
      });

      initial[status] = orders;
    }

    return initial;
  }, [groupedByStatus]);

  const statusCounts = useMemo(() => {
    return queue.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [queue]);

  const assemblyTickets = useMemo(() => {
    const byOrder = new Map<string, KdsItemDto[]>();
    for (const item of queue) {
      const current = byOrder.get(item.order_id) ?? [];
      current.push(item);
      byOrder.set(item.order_id, current);
    }

    const tickets: AssemblyTicket[] = [];
    for (const [orderId, items] of byOrder.entries()) {
      const readyItems = items.filter((item) => item.status === "ready");
      if (!readyItems.length) continue;
      const allReadyOrServed = items.every((item) => item.status === "ready" || item.status === "served");
      if (!allReadyOrServed) continue;

      const first = items[0];
      const stationSummary = Array.from(new Set(items.map((item) => item.station))).join(" / ");
      const canServe = readyItems.every((item) => {
        const target = "served";
        const backendAllows = item.can_move_next ?? true;
        return backendAllows && canMoveStatusByRole(item, target);
      });
      tickets.push({
        orderId,
        orderNumber: first?.order_number ?? null,
        channelCode: first?.channel_code ?? "",
        kitchenPriority: first?.kitchen_priority ?? "normal",
        stationSummary,
        queuedAt: first?.queued_at ?? first?.status_at ?? new Date().toISOString(),
        orderNotes: first?.order_notes ?? "",
        externalOrderId: first?.external_order_id ?? null,
        readyItemIds: readyItems.map((item) => item.id),
        readyLines: readyItems.map((item) => `${item.item_name} × ${normalizeQty(item.item_quantity)}`),
        canServe,
      });
    }

    tickets.sort((a, b) => {
      const byPriority = priorityRank(a.kitchenPriority) - priorityRank(b.kitchenPriority);
      if (byPriority !== 0) return byPriority;
      return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    });
    return tickets;
  }, [canMoveStatusByRole, queue]);

  const handleStatusMove = async (item: KdsItemDto) => {
    const nextStatus = NEXT_STATUS[item.status];
    if (!nextStatus) return;
    if (!(item.can_move_next ?? true)) return;
    if (!canMoveStatusByRole(item, nextStatus)) return;

    setSyncState((prev) => ({ ...prev, [item.id]: "sending" }));
    try {
      await markKdsItemStatus(item.id, nextStatus);
      setQueue((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: nextStatus,
                status_at: new Date().toISOString(),
              }
            : entry,
        ),
      );
      setSyncState((prev) => ({ ...prev, [item.id]: "success" }));
    } catch {
      setSyncState((prev) => ({ ...prev, [item.id]: "error" }));
    }
  };

  const handleOrderPriorityChange = async (orderId: string, priority: KitchenPriority) => {
    setSyncState((prev) => ({ ...prev, [`priority-${orderId}`]: "sending" }));
    try {
      await updateOrderPriority(orderId, priority);
      setQueue((current) => current.map((entry) => (entry.order_id === orderId ? { ...entry, kitchen_priority: priority } : entry)));
      setSyncState((prev) => ({ ...prev, [`priority-${orderId}`]: "success" }));
    } catch {
      setSyncState((prev) => ({ ...prev, [`priority-${orderId}`]: "error" }));
    }
  };

  const handleSendReadyToProvider = async (item: KdsItemDto) => {
    if (!item.external_order_id) return;
    setSyncState((prev) => ({ ...prev, [item.external_order_id as string]: "sending" }));
    try {
      await markExternalOrderReady(item.external_order_id);
      setSyncState((prev) => ({ ...prev, [item.external_order_id as string]: "success" }));
    } catch {
      setSyncState((prev) => ({ ...prev, [item.external_order_id as string]: "error" }));
    }
  };

  const handleAssemblyComplete = async (ticket: AssemblyTicket) => {
    if (!ticket.readyItemIds.length || !ticket.canServe) return;
    setSyncState((prev) => ({ ...prev, [ticket.orderId]: "sending" }));
    try {
      await Promise.all(ticket.readyItemIds.map((itemId) => markKdsItemStatus(itemId, "served")));
      setQueue((current) =>
        current.map((entry) =>
          ticket.readyItemIds.includes(entry.id)
            ? {
                ...entry,
                status: "served",
                status_at: new Date().toISOString(),
              }
            : entry,
        ),
      );
      setSyncState((prev) => ({ ...prev, [ticket.orderId]: "success" }));
    } catch {
      setSyncState((prev) => ({ ...prev, [ticket.orderId]: "error" }));
    }
  };

  if (loading) return <Text style={styles.meta}>جار تحميل بيانات المطبخ...</Text>;
  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>شاشة المطبخ</Text>
        <Pressable style={styles.refreshButton} onPress={() => void loadQueue()}>
          <Text style={styles.refreshButtonText}>تحديث</Text>
        </Pressable>
      </View>

      <View style={styles.statsCard}>
        <Text style={styles.meta}>إجمالي العناصر: {queue.length}</Text>
        <Text style={styles.meta}>جديد: {statusCounts.new ?? 0}</Text>
        <Text style={styles.meta}>قيد التحضير: {statusCounts.preparing ?? 0}</Text>
        <Text style={styles.meta}>جاهز: {statusCounts.ready ?? 0}</Text>
        <Text style={styles.meta}>تم التقديم: {statusCounts.served ?? 0}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stationFilters}>
        {stations.map((station) => (
          <Pressable
            key={station}
            style={[styles.filterChip, stationFilter === station && styles.filterChipActive]}
            onPress={() => setStationFilter(station)}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.filterChipText, stationFilter === station && styles.filterChipTextActive]}
            >
              {station === "all" ? "الكل" : formatStationLabel(station)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {queueLoading ? <Text style={styles.meta}>جار تحميل قائمة المطبخ...</Text> : null}
      {queueError ? <Text style={styles.error}>{queueError}</Text> : null}

      <ScrollView horizontal style={styles.board} contentContainerStyle={styles.boardContent}>
        {KDS_COLUMNS.map((status) => (
          <View key={status} style={styles.column}>
            <View style={styles.columnHeader}>
              <Text style={styles.columnTitle}>{STATUS_LABELS[status]}</Text>
              <Text style={styles.columnCount}>{groupedByStatus[status].length}</Text>
            </View>

            <ScrollView style={styles.columnList} contentContainerStyle={styles.columnListContent}>
              {groupedByStatusByOrder[status].map((orderGroup) => {
                const ageMins = calcAgeMinutes(orderGroup.queuedAt, nowTick);
                const timerTone = getTimerTone(ageMins);
                const prioritySync = syncState[`priority-${orderGroup.orderId}`] ?? "idle";
                const canChangePriority = Boolean(
                  orderGroup.items.some((item) => item.can_change_priority ?? true) && canSetPriorityByRole,
                );

                return (
                  <View key={`${status}-${orderGroup.orderId}`} style={styles.orderCard}>
                    <View style={styles.ticketTop}>
                      <Text style={styles.ticketOrderNo}>طلب #{orderGroup.orderNumber ?? orderGroup.orderId.slice(0, 6)}</Text>
                      <Text style={[styles.timerBadge, timerTone.style]}>{ageMins} د</Text>
                    </View>
                    <Text style={styles.ticketMeta}>النوع: {CHANNEL_LABELS[orderGroup.channelCode] ?? orderGroup.channelCode}</Text>
                    <Text style={[styles.ticketMeta, styles.priorityMeta]}>
                      الأولوية: {PRIORITY_LABELS[orderGroup.kitchenPriority] ?? orderGroup.kitchenPriority}
                    </Text>
                    <Text style={styles.ticketMeta}>
                      المحطات: {orderGroup.stationSummary ? orderGroup.stationSummary.split(" / ").map(formatStationLabel).join(" / ") : "-"}
                    </Text>
                    {orderGroup.orderNotes ? <Text style={styles.ticketNotes}>ملاحظة الطلب: {orderGroup.orderNotes}</Text> : null}
                    <Text style={styles.ticketMeta}>دخل: {formatLocalTime(orderGroup.queuedAt)}</Text>

                    {canChangePriority ? (
                      <View style={styles.priorityRow}>
                        {PRIORITY_ORDER.map((priority) => (
                          <Pressable
                            key={`${orderGroup.orderId}-${priority}`}
                            style={[
                              styles.priorityChip,
                              orderGroup.kitchenPriority === priority && styles.priorityChipActive,
                              prioritySync === "sending" && styles.buttonDisabled,
                            ]}
                            onPress={() => void handleOrderPriorityChange(orderGroup.orderId, priority)}
                            disabled={prioritySync === "sending"}
                          >
                            <Text
                              style={[
                                styles.priorityChipText,
                                orderGroup.kitchenPriority === priority && styles.priorityChipTextActive,
                              ]}
                            >
                              {PRIORITY_LABELS[priority]}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.orderItemsWrap}>
                      {orderGroup.items.map((item) => {
                        const nextStatus = NEXT_STATUS[item.status];
                        const backendAllows = item.can_move_next ?? true;
                        const roleAllows = nextStatus ? canMoveStatusByRole(item, nextStatus) : false;
                        const canMove = Boolean(nextStatus && backendAllows && roleAllows);
                        const itemSyncState = syncState[item.id] ?? "idle";
                        const externalSyncState = item.external_order_id ? syncState[item.external_order_id] ?? "idle" : "idle";

                        return (
                          <View key={item.id} style={styles.itemCard}>
                            <Text style={styles.ticketItem}>{item.item_name} × {normalizeQty(item.item_quantity)}</Text>
                            <Text style={styles.ticketMeta}>المحطة: {formatStationLabel(item.station)}</Text>
                            {item.item_notes ? <Text style={styles.ticketNotes}>ملاحظة الصنف: {item.item_notes}</Text> : null}

                            <View style={styles.ticketActions}>
                              {nextStatus ? (
                                <Pressable
                                  style={[styles.actionButton, (!canMove || itemSyncState === "sending") && styles.buttonDisabled]}
                                  onPress={() => void handleStatusMove(item)}
                                  disabled={!canMove || itemSyncState === "sending"}
                                >
                                  <Text style={styles.actionButtonText}>
                                    {itemSyncState === "sending" ? "جار..." : STATUS_ACTION_LABEL[item.status]}
                                  </Text>
                                </Pressable>
                              ) : null}

                              {item.external_order_id && item.status === "ready" ? (
                                <Pressable
                                  style={[styles.secondaryButton, externalSyncState === "sending" && styles.buttonDisabled]}
                                  onPress={() => void handleSendReadyToProvider(item)}
                                  disabled={externalSyncState === "sending"}
                                >
                                  <Text style={styles.secondaryButtonText}>إرسال جاهز للمزود</Text>
                                </Pressable>
                              ) : null}
                            </View>

                            {itemSyncState === "error" ? <Text style={styles.error}>تعذر تحديث الحالة.</Text> : null}
                            {externalSyncState === "error" ? <Text style={styles.error}>تعذر الإرسال للمزود.</Text> : null}
                          </View>
                        );
                      })}
                    </View>

                    {prioritySync === "error" ? <Text style={styles.error}>تعذر تحديث الأولوية.</Text> : null}
                  </View>
                );
              })}

              {!groupedByStatusByOrder[status].length ? <Text style={styles.emptyColumn}>لا توجد عناصر</Text> : null}
            </ScrollView>
          </View>
        ))}

        <View style={styles.column}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>التجميع</Text>
            <Text style={styles.columnCount}>{assemblyTickets.length}</Text>
          </View>
          <ScrollView style={styles.columnList} contentContainerStyle={styles.columnListContent}>
            {assemblyTickets.map((ticket) => {
              const ageMins = calcAgeMinutes(ticket.queuedAt, nowTick);
              const timerTone = getTimerTone(ageMins);
              const assemblySync = syncState[ticket.orderId] ?? "idle";
              return (
                <View key={ticket.orderId} style={styles.ticket}>
                  <View style={styles.ticketTop}>
                    <Text style={styles.ticketOrderNo}>طلب #{ticket.orderNumber ?? ticket.orderId.slice(0, 6)}</Text>
                    <Text style={[styles.timerBadge, timerTone.style]}>{ageMins} د</Text>
                  </View>
                  <Text style={styles.ticketMeta}>النوع: {CHANNEL_LABELS[ticket.channelCode] ?? ticket.channelCode}</Text>
                  <Text style={[styles.ticketMeta, styles.priorityMeta]}>الأولوية: {PRIORITY_LABELS[ticket.kitchenPriority] ?? ticket.kitchenPriority}</Text>
                  <Text style={styles.ticketMeta}>محطات الطلب: {ticket.stationSummary ? ticket.stationSummary.split(" / ").map(formatStationLabel).join(" / ") : "-"}</Text>
                  <Text style={styles.ticketMeta}>أصناف جاهزة للتجميع: {ticket.readyItemIds.length}</Text>
                  {ticket.readyLines.slice(0, 3).map((line) => (
                    <Text key={`${ticket.orderId}-${line}`} style={styles.ticketNotes}>{line}</Text>
                  ))}
                  {ticket.orderNotes ? <Text style={styles.ticketNotes}>ملاحظة الطلب: {ticket.orderNotes}</Text> : null}

                  <View style={styles.ticketActions}>
                    <Pressable
                      style={[styles.assemblyButton, (!ticket.canServe || assemblySync === "sending") && styles.buttonDisabled]}
                      onPress={() => void handleAssemblyComplete(ticket)}
                      disabled={!ticket.canServe || assemblySync === "sending"}
                    >
                      <Text style={styles.assemblyButtonText}>{assemblySync === "sending" ? "جار..." : "تم التجميع"}</Text>
                    </Pressable>
                  </View>
                  {assemblySync === "error" ? <Text style={styles.error}>تعذر تحديث التجميع.</Text> : null}
                </View>
              );
            })}
            {!assemblyTickets.length ? <Text style={styles.emptyColumn}>لا توجد طلبات جاهزة للتجميع</Text> : null}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function calcAgeMinutes(iso: string, nowTick: number) {
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((nowTick - start) / 60000));
}

function normalizeQty(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
  return n.toFixed(3);
}

function formatLocalTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

function getTimerTone(ageMinutes: number) {
  if (ageMinutes < 3) return { style: styles.timerGreen };
  if (ageMinutes < 6) return { style: styles.timerOrange };
  return { style: styles.timerRed };
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 28, fontWeight: "900", color: "#1F2937", textAlign: "right" },
  refreshButton: {
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#EEF5FF",
  },
  refreshButtonText: { color: "#2563EB", fontWeight: "900" },
  statsCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFFFFF",
    gap: 2,
  },
  stationFilters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 2,
    minHeight: 34,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    minHeight: 30,
    maxWidth: 110,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "#fff",
  },
  filterChipActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EAF2FF",
  },
  filterChipText: { color: "#374151", fontWeight: "800", fontSize: 13 },
  filterChipTextActive: { color: "#1D4ED8" },

  board: { minHeight: 420, maxHeight: 620 },
  boardContent: { gap: 10, alignItems: "flex-start", paddingBottom: 8 },
  column: {
    width: 360,
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#DDE3EA",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },
  columnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#EEF2F7",
  },
  columnTitle: { color: "#111827", fontWeight: "900" },
  columnCount: { color: "#2563EB", fontWeight: "900" },
  columnList: { maxHeight: 560 },
  columnListContent: { gap: 8, padding: 8 },
  ticket: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    padding: 10,
    gap: 4,
  },
  orderCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    padding: 10,
    gap: 6,
  },
  orderItemsWrap: {
    gap: 6,
    marginTop: 2,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    padding: 8,
    gap: 4,
  },
  ticketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ticketOrderNo: { color: "#111827", fontWeight: "900", fontSize: 15 },
  ticketMeta: { color: "#4B5563", fontWeight: "700", textAlign: "right" },
  priorityMeta: { color: "#B45309" },
  ticketItem: { color: "#1F2937", fontWeight: "900", textAlign: "right" },
  ticketNotes: { color: "#6B7280", fontWeight: "700", textAlign: "right", fontSize: 13 },
  timerBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontWeight: "900",
    overflow: "hidden",
  },
  timerGreen: { color: "#15803D", backgroundColor: "#DCFCE7" },
  timerOrange: { color: "#B45309", backgroundColor: "#FFEDD5" },
  timerRed: { color: "#B91C1C", backgroundColor: "#FEE2E2" },

  priorityRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  priorityChip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#fff",
  },
  priorityChipActive: {
    borderColor: "#B45309",
    backgroundColor: "#FFF7ED",
  },
  priorityChipText: { color: "#6B7280", fontWeight: "800", fontSize: 12 },
  priorityChipTextActive: { color: "#B45309" },

  ticketActions: { flexDirection: "row", gap: 8, marginTop: 2, flexWrap: "wrap" },
  actionButton: {
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionButtonText: { color: "#fff", fontWeight: "900" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#EEF5FF",
  },
  secondaryButtonText: { color: "#2563EB", fontWeight: "900" },
  assemblyButton: {
    backgroundColor: "#B45309",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assemblyButtonText: { color: "#fff", fontWeight: "900" },
  buttonDisabled: { opacity: 0.6 },
  emptyColumn: { color: "#6B7280", textAlign: "center", fontWeight: "700", paddingVertical: 8 },
  meta: { color: "#4B5563", textAlign: "right", fontWeight: "700" },
  error: { color: "#DC2626", textAlign: "right", fontWeight: "700" },
});
