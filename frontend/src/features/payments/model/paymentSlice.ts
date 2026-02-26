import type { PaymentMethod } from "./types";

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: "cash", name: "نقدي" },
  { id: "card", name: "بطاقة" },
];
