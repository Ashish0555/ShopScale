import { KafkaEventPublisher } from "../src/infrastructure/kafka/kafka-runtime.js";
import { DomainEventConsumer, InMemoryProcessedEventStore } from "../src/infrastructure/events/event-consumer.js";
import type { DomainEvent } from "../src/infrastructure/events/domain-events.js";
import type { Producer } from "kafkajs";

describe("domain events", () => {
  const event: DomainEvent = {
    id: "event-1",
    type: "OrderCreated",
    aggregateType: "order",
    aggregateId: "order-1",
    payload: {
      orderId: "order-1",
      userId: "user-1",
      totalCents: 2500,
      currency: "USD"
    },
    occurredAt: "2026-09-03T00:00:00.000Z"
  };

  it("publishes typed events with stable Kafka routing metadata", async () => {
    const sent: unknown[] = [];
    const producer = {
      send: async (input: unknown): Promise<void> => {
        sent.push(input);
      }
    } as unknown as Producer;
    const publisher = new KafkaEventPublisher(producer, "shopscale.domain.events");

    await publisher.publish(event);

    expect(sent).toEqual([{
      topic: "shopscale.domain.events",
      messages: [{
        key: "order-1",
        value: JSON.stringify(event),
        headers: { eventType: "OrderCreated", eventId: "event-1" }
      }]
    }]);
  });

  it("processes each event once even when Kafka redelivers it", async () => {
    const store = new InMemoryProcessedEventStore();
    let handled = 0;
    const handler = async (): Promise<void> => {
      handled += 1;
    };
    const consumer = new DomainEventConsumer(store, [handler]);

    await expect(consumer.consume(event)).resolves.toBe("processed");
    await expect(consumer.consume(event)).resolves.toBe("duplicate");

    expect(handled).toBe(1);
  });
});
