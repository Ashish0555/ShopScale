import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { DomainEvent, DomainEventPublisher } from "../events/domain-events.js";

type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function writeOutboxEvent(
  transaction: TransactionClient,
  event: Omit<DomainEvent, "id" | "occurredAt"> & { id?: string; occurredAt?: string }
): Promise<DomainEvent> {
  const stored: DomainEvent = {
    id: event.id ?? randomUUID(),
    type: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    occurredAt: event.occurredAt ?? new Date().toISOString()
  };

  await transaction.outboxEvent.create({
    data: {
      id: stored.id,
      eventType: stored.type,
      aggregateType: stored.aggregateType,
      aggregateId: stored.aggregateId,
      payload: stored as unknown as Prisma.InputJsonValue
    }
  });

  return stored;
}

export class PrismaOutboxPublisher implements DomainEventPublisher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sink: DomainEventPublisher
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, publishedAt: null },
      data: { publishedAt: new Date() }
    });
    await this.sink.publish(event);
  }
}

export async function publishUnpublishedOutboxEvents(
  prisma: PrismaClient,
  sink: DomainEventPublisher
): Promise<number> {
  const unpublished = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: "asc" },
    take: 50
  });

  for (const record of unpublished) {
    const event = record.payload as unknown as DomainEvent;
    await sink.publish(event);
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { publishedAt: new Date() }
    });
  }

  return unpublished.length;
}
