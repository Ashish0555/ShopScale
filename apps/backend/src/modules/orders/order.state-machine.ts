import type { OrderState } from "./order.types.js";

const allowedTransitions: Record<OrderState, OrderState[]> = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: []
};

export function canTransitionOrder(currentState: OrderState, nextState: OrderState): boolean {
  return allowedTransitions[currentState].includes(nextState);
}

export function canCancelOrder(state: OrderState): boolean {
  return canTransitionOrder(state, "CANCELLED");
}
