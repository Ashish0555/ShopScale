import type { PrismaClient } from "@prisma/client";
import type { InventoryRepository } from "./cart.types.js";

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getAvailableQuantity(productId: string): Promise<number> {
    const inventory = await this.prisma.inventory.findUnique({
      where: { productId }
    });

    return inventory?.availableQuantity ?? 0;
  }
}
