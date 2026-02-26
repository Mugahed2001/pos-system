export function calculateLineTotal(price: number, quantity: number) {
  return Number((price * quantity).toFixed(2));
}
