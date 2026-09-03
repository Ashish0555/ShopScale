export const domainEventTypes = [
  "OrderCreated",
  "PaymentSucceeded",
  "PaymentFailed",
  "InventoryReserved",
  "InventoryReleased",
  "OrderCancelled"
] as const;

export type DomainEventType = (typeof domainEventTypes)[number];

export type DomainEventPayload = {
  OrderCreated: { orderId: string; userId: string; totalCents: number; currency: string };
  PaymentSucceeded: { paymentId: string; orderId: string; userId: string; amountCents: number };
  PaymentFailed: { paymentId: string; orderId: string; userId: string; amountCents: number; reason: string };
  InventoryReserved: { orderId: string; productId: string; quantity: number };
  InventoryReleased: { orderId: string; productId: string; quantity: number };
  OrderCancelled: { orderId: string; userId: string };
};

export type DomainEvent = {
  id: string;
  type: DomainEventType;
  aggregateType: "order" | "payment";
  aggregateId: string;
  payload: DomainEventPayload[DomainEventType];
  occurredAt: string;
};

export type DomainEventPublisher = {
  publish(event: DomainEvent): Promise<void>;
};

export class InMemoryEventPublisher implements DomainEventPublisher {
  readonly events: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
}

export class CompositeEventPublisher implements DomainEventPublisher {
  constructor(private readonly publishers: DomainEventPublisher[]) {}

  async publish(event: DomainEvent): Promise<void> {
    for (const publisher of this.publishers) {
      await publisher.publish(event);
    }
  }
}

export const noopEventPublisher: DomainEventPublisher = {
  async publish(): Promise<void> {}
};
