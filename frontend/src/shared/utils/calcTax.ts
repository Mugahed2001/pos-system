export function calcTax(subtotal: number, taxRate: number) {
  return Number((subtotal * taxRate).toFixed(2));
}
