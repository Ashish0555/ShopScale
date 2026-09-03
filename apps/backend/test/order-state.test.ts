import { canCancelOrder, canTransitionOrder } from "../src/modules/orders/order.state-machine.js";

describe("order state machine", () => {
  it("allows valid transitions and rejects invalid transitions", () => {
    expect(canTransitionOrder("PLACED", "CONFIRMED")).toBe(true);
    expect(canTransitionOrder("CONFIRMED", "PACKED")).toBe(true);
    expect(canTransitionOrder("PACKED", "SHIPPED")).toBe(true);
    expect(canTransitionOrder("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransitionOrder("PLACED", "DELIVERED")).toBe(false);
    expect(canTransitionOrder("DELIVERED", "CANCELLED")).toBe(false);
  });

  it("allows cancellation only before packing", () => {
    expect(canCancelOrder("PLACED")).toBe(true);
    expect(canCancelOrder("CONFIRMED")).toBe(true);
    expect(canCancelOrder("PACKED")).toBe(false);
    expect(canCancelOrder("SHIPPED")).toBe(false);
  });
});
