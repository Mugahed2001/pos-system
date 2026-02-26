import type { OrderChannelCode, PickupWindowStatus } from "../../../sales/model/posTypes";

export interface CashierOrderListItem {
  id: string;
  local_id: string;
  channel_code: OrderChannelCode;
  status: string;
  is_held: boolean;
  held_at: string | null;
  order_number: number | null;
  fulfillment_mode: "counter" | "window";
  pickup_window_status: PickupWindowStatus;
  arrival_at: string | null;
  ready_at: string | null;
  handed_over_at: string | null;
  pickup_code: string;
  table: string | null;
  seats_count: number;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: string;
  tax_total: string;
  service_charge_total: string;
  discount_total: string;
  grand_total: string;
  offline_created_at: string;
  created_at: string;
}

export interface CashierOrderItem {
  id: string;
  menu_item: string;
  menu_item_name: string;
  quantity: string;
  unit_price_snapshot: string;
  tax_amount_snapshot: string;
  discount_amount_snapshot: string;
  modifiers_snapshot_json: Array<Record<string, unknown>>;
  notes: string;
}

export interface CashierOrderDetail {
  id: string;
  local_id: string;
  idempotency_key: string;
  channel: string;
  channel_code: OrderChannelCode;
  status: string;
  is_held: boolean;
  held_at: string | null;
  order_number: number | null;
  fulfillment_mode: "counter" | "window";
  pickup_window_status: PickupWindowStatus;
  arrival_at: string | null;
  ready_at: string | null;
  handed_over_at: string | null;
  pickup_code: string;
  car_info: Record<string, unknown>;
  table: string | null;
  seats_count: number;
  customer: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  subtotal: string;
  tax_total: string;
  service_charge_total: string;
  discount_total: string;
  grand_total: string;
  offline_created_at: string;
  submitted_at: string | null;
  notes: string;
  items: CashierOrderItem[];
  channel_snapshot: Record<string, unknown>;
}

export interface CashierPayment {
  id: string;
  order: string;
  method: string;
  amount: string;
  paid_at: string;
  reference_no: string;
}

export interface CashMovementDto {
  id: string;
  shift_id: string;
  movement_type: "paid_in" | "paid_out";
  amount: string;
  reason: string;
  device_id: string;
  username: string;
  created_at: string;
}

export interface PrintJobDto {
  id: string;
  order: string;
  device: string;
  job_type: "receipt" | "kitchen";
  status: string;
  attempts: number;
  last_error: string;
  sent_at: string | null;
  created_at: string;
}
