import type { Prisma, PrismaClient } from "@prisma/client";

export type AuditLog = {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: Date;
};

export type AuditRepository = {
  write(input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
  }): Promise<AuditLog>;
  list(query: { page: number; pageSize: number }): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;
};

export class InMemoryAuditRepository implements AuditRepository {
  readonly logs: AuditLog[] = [];

  async write(input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
  }): Promise<AuditLog> {
    const log: AuditLog = {
      id: crypto.randomUUID(),
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? null,
      createdAt: new Date()
    };
    this.logs.unshift(log);
    return log;
  }

  async list(query: { page: number; pageSize: number }): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const start = (query.page - 1) * query.pageSize;
    return {
      items: this.logs.slice(start, start + query.pageSize),
      total: this.logs.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(this.logs.length / query.pageSize)
    };
  }
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async write(input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: unknown;
  }): Promise<AuditLog> {
    const log = await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue
      }
    });

    return {
      id: log.id,
      actorUserId: log.actorUserId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt
    };
  }

  async list(query: { page: number; pageSize: number }): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.auditLog.count()
    ]);

    return {
      items: items.map((log) => ({
        id: log.id,
        actorUserId: log.actorUserId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        createdAt: log.createdAt
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize)
    };
  }
}
