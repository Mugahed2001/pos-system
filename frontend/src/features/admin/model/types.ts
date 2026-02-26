export interface AdminCategory {
  category_id: string;
  subsidiary: string | null;
  name: string;
  parent_category: string | null;
}

export interface AdminItem {
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
  base_price?: string;
  is_active?: boolean;
}

export interface AdminOrder {
  id: string;
  local_id: string;
  branch: string;
  device: string;
  channel_code: string;
  status: "draft" | "submitted" | "canceled" | "paid" | "refunded" | string;
  table: string | null;
  seats_count: number;
  subtotal: string;
  tax_total: string;
  service_charge_total: string;
  discount_total: string;
  grand_total: string;
  offline_created_at: string;
  created_at: string;
}
