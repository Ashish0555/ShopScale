import type { PrismaClient } from "@prisma/client";

export type AdminOrder = {
  id: string;
  userId: string;
  state: string;
  totalCents: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

export type InventoryView = {
  productId: string;
  sku: string;
  name: string;
  availableQuantity: number;
  reservedQuantity: number;
  version: number;
};

export type AdminRepository = {
  listOrders(query: { page: number; pageSize: number }): Promise<{ items: AdminOrder[]; total: number; page: number; pageSize: number; totalPages: number }>;
  listInventory(): Promise<InventoryView[]>;
};

export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listOrders(query: { page: number; pageSize: number }) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.order.count()
    ]);

    return {
      items: items.map(({ id, userId, state, totalCents, currency, createdAt, updatedAt }) => ({
        id,
        userId,
        state,
        totalCents,
        currency,
        createdAt,
        updatedAt
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize)
    };
  }

  async listInventory(): Promise<InventoryView[]> {
    const inventory = await this.prisma.inventory.findMany({
      include: { product: { select: { sku: true, name: true } } },
      orderBy: { updatedAt: "desc" }
    });

    return inventory.map((item) => ({
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      availableQuantity: item.availableQuantity,
      reservedQuantity: item.reservedQuantity,
      version: item.version
    }));
  }
}
