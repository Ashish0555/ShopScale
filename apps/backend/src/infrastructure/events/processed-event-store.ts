import type { PrismaClient } from "@prisma/client";
import type { ProcessedEventStore } from "../events/event-consumer.js";

export class PrismaProcessedEventStore implements ProcessedEventStore {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(eventId: string, eventType: string): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({
        data: {
          eventId,
          eventType
        }
      });
      return true;
    } catch {
      return false;
    }
  }
}
