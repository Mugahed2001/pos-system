import { apiClient } from "../../../shared/lib/apiClient";
import type { CartLine } from "../model/posTypes";

export interface CreateTransactionPayload {
  subsidiary: string | null;
  location: string | null;
  station: string | null;
  user: string | null;
  customer: string | null;
  status: string | null;
  notes?: string | null;
  lines: Array<{
    item: string;
    uom: string | null;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    tax_amount: number;
  }>;
}

export async function createTransaction(input: {
  context: Omit<CreateTransactionPayload, "lines">;
  cart: CartLine[];
}) {
  const payload: CreateTransactionPayload = {
    ...input.context,
    notes: input.context.notes ?? null,
    lines: input.cart.map((line) => ({
      item: line.item.item_id,
      uom: line.item.uom,
      quantity: line.qty,
      unit_price: line.unitPrice,
      discount_amount: line.discount,
      tax_amount: line.tax,
    })),
  };

  const response = await apiClient.post("/transactions/transactions/", payload);
  return response.data;
}

