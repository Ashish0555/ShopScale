import { Prisma, type PrismaClient } from "@prisma/client";
import createHttpError from "http-errors";
import { writeOutboxEvent } from "../../infrastructure/kafka/outbox.js";
import { canCancelOrder, canTransitionOrder } from "./order.state-machine.js";
import type { Order, OrderListQuery, OrderRepository, OrderState, PaginatedOrders } from "./order.types.js";

type OrderModel = Prisma.OrderGetPayload<{
  include: {
    items: true;
    reservations: true;
  };
}>;

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createFromCart(userId: string): Promise<Order> {
    return this.prisma.$transaction(async (transaction) => {
      const cart = await transaction.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: true
            },
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      });

      if (!cart || cart.items.length === 0) {
        throw createHttpError(400, "Cart is empty");
      }

      for (const item of cart.items) {
        if (!item.product.isActive) {
          throw createHttpError(400, `Product ${item.productId} is not active`);
        }
      }

      const currency = cart.items[0]?.product.currency ?? "USD";

      if (cart.items.some((item) => item.product.currency !== currency)) {
        throw createHttpError(400, "Cart contains multiple currencies");
      }

      for (const item of cart.items) {
        const update = await transaction.inventory.updateMany({
          where: {
            productId: item.productId,
            availableQuantity: {
              gte: item.quantity
            }
          },
          data: {
            availableQuantity: {
              decrement: item.quantity
            },
            reservedQuantity: {
              increment: item.quantity
            },
            version: {
              increment: 1
            }
          }
        });

        if (update.count !== 1) {
          throw createHttpError(409, "Insufficient stock");
        }
      }

      const totalCents = cart.items.reduce((total, item) => total + item.product.priceCents * item.quantity, 0);
      const order = await transaction.order.create({
        data: {
          userId,
          state: "PLACED",
          totalCents,
          currency,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              sku: item.product.sku,
              name: item.product.name,
              quantity: item.quantity,
              unitPriceCents: item.product.priceCents,
              lineTotalCents: item.product.priceCents * item.quantity
            }))
          },
          reservations: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity
            }))
          }
        },
        include: orderInclude
      });

      await writeOutboxEvent(transaction, {
        type: "OrderCreated",
        aggregateType: "order",
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          userId: order.userId,
          totalCents: order.totalCents,
          currency: order.currency
        }
      });
      for (const item of cart.items) {
        await writeOutboxEvent(transaction, {
          type: "InventoryReserved",
          aggregateType: "order",
          aggregateId: order.id,
          payload: { orderId: order.id, productId: item.productId, quantity: item.quantity }
        });
      }

      await transaction.cartItem.deleteMany({
        where: { cartId: cart.id }
      });

      return mapOrder(order);
    });
  }

  async listForUser(userId: string, query: OrderListQuery): Promise<PaginatedOrders> {
    const where: Prisma.OrderWhereInput = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.order.count({ where })
    ]);

    return {
      items: items.map(mapOrder),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize)
    };
  }

  async findForUser(orderId: string, userId: string): Promise<Order | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderInclude
    });

    return order ? mapOrder(order) : null;
  }

  async cancelForUser(orderId: string, userId: string): Promise<Order | null> {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: { id: orderId, userId },
        include: orderInclude
      });

      if (!order) {
        return null;
      }

      if (!canCancelOrder(order.state)) {
        throw createHttpError(409, `Cannot cancel order in ${order.state} state`);
      }

      await releaseReservations(transaction, order.id);

      const cancelled = await transaction.order.update({
        where: { id: order.id },
        data: {
          state: "CANCELLED",
          cancelledAt: new Date()
        },
        include: orderInclude
      });

      for (const reservation of order.reservations.filter((item) => item.releasedAt === null)) {
        await writeOutboxEvent(transaction, {
          type: "InventoryReleased",
          aggregateType: "order",
          aggregateId: order.id,
          payload: { orderId: order.id, productId: reservation.productId, quantity: reservation.quantity }
        });
      }
      await writeOutboxEvent(transaction, {
        type: "OrderCancelled",
        aggregateType: "order",
        aggregateId: order.id,
        payload: { orderId: order.id, userId: order.userId }
      });

      return mapOrder(cancelled);
    });
  }

  async transition(orderId: string, nextState: OrderState): Promise<Order | null> {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: orderInclude
      });

      if (!order) {
        return null;
      }

      if (!canTransitionOrder(order.state, nextState)) {
        throw createHttpError(409, `Cannot transition order from ${order.state} to ${nextState}`);
      }

      const updated = await transaction.order.update({
        where: { id: orderId },
        data: { state: nextState },
        include: orderInclude
      });

      return mapOrder(updated);
    });
  }
}

const orderInclude = {
  items: true,
  reservations: true
} satisfies Prisma.OrderInclude;

async function releaseReservations(
  transaction: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  orderId: string
): Promise<void> {
  const reservations = await transaction.inventoryReservation.findMany({
    where: {
      orderId,
      releasedAt: null
    }
  });

  for (const reservation of reservations) {
    await transaction.inventory.update({
      where: { productId: reservation.productId },
      data: {
        availableQuantity: {
          increment: reservation.quantity
        },
        reservedQuantity: {
          decrement: reservation.quantity
        },
        version: {
          increment: 1
        }
      }
    });
  }

  await transaction.inventoryReservation.updateMany({
    where: {
      orderId,
      releasedAt: null
    },
    data: {
      releasedAt: new Date()
    }
  });
}

function mapOrder(order: OrderModel): Order {
  return {
    id: order.id,
    userId: order.userId,
    state: order.state,
    totalCents: order.totalCents,
    currency: order.currency,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents
    })),
    reservations: order.reservations.map((reservation) => ({
      id: reservation.id,
      productId: reservation.productId,
      quantity: reservation.quantity,
      releasedAt: reservation.releasedAt,
      createdAt: reservation.createdAt
    }))
  };
}
