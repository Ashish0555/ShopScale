import { logger } from "../logging/logger.js";
import type { DomainEvent } from "./domain-events.js";

export type ProcessedEventStore = {
  claim(eventId: string, eventType: string): Promise<boolean>;
};

export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly processed = new Set<string>();
  readonly handled: DomainEvent[] = [];

  async claim(eventId: string): Promise<boolean> {
    if (this.processed.has(eventId)) {
      return false;
    }

    this.processed.add(eventId);
    return true;
  }
}

export class DomainEventConsumer {
  constructor(
    private readonly processedEvents: ProcessedEventStore,
    private readonly handlers: Array<(event: DomainEvent) => Promise<void>>
  ) {}

  async consume(event: DomainEvent): Promise<"processed" | "duplicate"> {
    const claimed = await this.processedEvents.claim(event.id, event.type);

    if (!claimed) {
      logger.debug({ eventId: event.id, type: event.type }, "Skipping duplicate domain event");
      return "duplicate";
    }

    for (const handler of this.handlers) {
      await handler(event);
    }

    return "processed";
  }
}
