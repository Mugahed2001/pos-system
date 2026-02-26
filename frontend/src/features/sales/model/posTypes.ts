export type OrderChannelCode = "dine_in" | "takeaway" | "pickup" | "pickup_window" | "delivery" | "preorder";

export interface CategoryDto {
  category_id: string;
  subsidiary: string | null;
  name: string;
  parent_category: string | null;
}

export interface ItemDto {
  item_id: string;
  subsidiary: string | null;
  category: string | null;
  uom: string | null;
  item_code: string;
  item_name: string;
  barcode: string | null;
  description: string | null;
  is_taxable: boolean;
  created_at: string | null;
  price?: string | number | null;
  excise_category?: string | null;
  excise_rate_percent?: string | number | null;
}

export interface ChannelDto {
  id: string;
  code: OrderChannelCode;
  display_name: string;
}

export interface ChannelConfigDto {
  id: string;
  channel: string;
  channel_code: OrderChannelCode;
  price_list_id: string;
  tax_profile_id: string;
  service_charge_rule_id: string | null;
  discount_policy_id: string | null;
  is_enabled: boolean;
  allow_new_orders: boolean;
  availability_rules: Record<string, unknown>;
  printing_routing: Record<string, unknown>;
  config_version: number;
}

export interface FloorDto {
  id: string;
  name: string;
  sort_order: number;
  floor_plan: Record<string, unknown>;
}

export interface TableDto {
  id: string;
  floor: string;
  code: string;
  seats_count: number;
  status: "available" | "occupied" | "reserved";
}

export interface ErpOfferDto {
  id: string;
  external_id: string;
  title: string;
  description: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_order_amount: string;
  max_discount_amount: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  stackable: boolean;
  applies_to: Record<string, unknown>;
  metadata: Record<string, unknown>;
  last_synced_at: string;
  updated_at: string;
}

export interface ErpCouponDto {
  id: string;
  external_id: string;
  code: string;
  title: string;
  description: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_order_amount: string;
  max_discount_amount: string | null;
  usage_limit: number;
  per_customer_limit: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  last_synced_at: string;
  updated_at: string;
}

export interface PosConfigResponse {
  version: number;
  branch: string;
  checksum?: string;
  channels: ChannelDto[];
  channel_configs: ChannelConfigDto[];
  floors: FloorDto[];
  tables: TableDto[];
  menu_categories: Array<{
    id: string;
    name: string;
    sort_order: number;
    is_active: boolean;
  }>;
  menu_items: Array<{
    id: string;
    category: string | null;
    code: string;
    name: string;
    base_price: string;
    excise_category?: string;
    excise_rate_percent?: string;
    kitchen_station: string;
    is_active: boolean;
  }>;
  modifiers: Array<{
    id: string;
    name: string;
    required: boolean;
    min_select: number;
    max_select: number;
    items: Array<{
      id: string;
      name: string;
      price_delta: string;
      is_active: boolean;
    }>;
  }>;
  price_lists: Array<{
    id: string;
    name: string;
    is_default: boolean;
    items: Array<{ id: string; menu_item_id: string; price: string }>;
  }>;
  taxes: Array<{
    id: string;
    name: string;
    rules: Array<{ id: string; code: string; rate_percent: string; is_inclusive: boolean }>;
  }>;
  service_charges: Array<{
    id: string;
    name: string;
    charge_type: "percentage" | "fixed";
    value: string;
  }>;
  discount_policies: Array<{
    id: string;
    name: string;
    max_discount_percent: string;
    requires_manager_override: boolean;
    is_active: boolean;
  }>;
  offers: ErpOfferDto[];
  coupons: ErpCouponDto[];
  ui_toggles?: Record<string, unknown>;
  allowed_payment_methods?: string[];
  allowed_fulfillment_methods?: string[];
}

export type PickupWindowStatus = "pending" | "arrived" | "ready" | "handed_over";

export interface ExternalOrderDto {
  id: string;
  provider: string;
  provider_code: string;
  provider_name: string;
  provider_order_id: string;
  branch: string;
  status_external: string;
  mapped_order: string | null;
  mapped_order_status: string | null;
  last_error: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickupWindowOrderDto {
  id: string;
  order_number: number | null;
  channel_code: OrderChannelCode;
  status: string;
  pickup_window_status: PickupWindowStatus;
  arrival_at: string | null;
  ready_at: string | null;
  handed_over_at: string | null;
  pickup_code: string;
  customer_name: string | null;
  customer_phone: string | null;
  grand_total: string;
  created_at: string;
}

export interface CartLine {
  item: ItemDto;
  qty: number;
  unitPrice: number;
  discount: number;
  tax: number;
}

export interface PosCustomer {
  id: string;
  branch: string;
  name: string;
  phone: string;
  notes: string;
}

export interface PosAddress {
  id: string;
  customer: string;
  label: string;
  line1: string;
  city: string;
  latitude: string | null;
  longitude: string | null;
}

export interface PosDriver {
  id: string;
  branch: string;
  name: string;
  phone: string;
  is_active: boolean;
}

export interface CreatePosOrderPayload {
  local_id: string;
  idempotency_key: string;
  branch_id: string;
  device_id: string;
  channel: OrderChannelCode;
  fulfillment_mode?: "counter" | "window";
  pickup_window_status?: PickupWindowStatus;
  pickup_code?: string;
  car_info?: Record<string, unknown>;
  table_id?: string | null;
  seats_count?: number;
  customer_id?: string | null;
  address_id?: string | null;
  customer_phone?: string;
  scheduled_at?: string | null;
  channel_for_preorder?: "pickup" | "delivery";
  offline_created_at: string;
  items: Array<{
    menu_item_id: string;
    quantity: string;
    unit_price_snapshot: string;
    tax_amount_snapshot: string;
    discount_amount_snapshot: string;
    modifiers_snapshot_json: Array<Record<string, unknown>>;
    notes?: string;
  }>;
  notes?: string;
}

export interface OutboxItem {
  id: string;
  kind: "create_order";
  payload: CreatePosOrderPayload;
  retries: number;
  next_retry_at: number;
  created_at: number;
}
