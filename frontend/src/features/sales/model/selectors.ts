import type { CartState } from "./cartSlice";

export function selectCartCount(state: CartState) {
  return state.lines.length;
}
