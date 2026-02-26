import type { CartLine } from "./types";

export interface CartState {
  lines: CartLine[];
}

export const initialCartState: CartState = {
  lines: [],
};
