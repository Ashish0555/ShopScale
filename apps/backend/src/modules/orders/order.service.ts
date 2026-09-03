import createHttpError from "http-errors";
import type { Order, OrderListQuery, OrderRepository, OrderState, PaginatedOrders } from "./order.types.js";

export class OrderService {
  private orderUpdatedHandler: ((order: Order) => void) | undefined;

  constructor(private readonly repository: OrderRepository) {}

  setOrderUpdatedHandler(handler: (order: Order) => void): void {
    this.orderUpdatedHandler = handler;
  }

  async createOrder(userId: string): Promise<Order> {
    const order = await this.repository.createFromCart(userId);
    this.orderUpdatedHandler?.(order);
    return order;
  }

  listOrders(userId: string, query: OrderListQuery): Promise<PaginatedOrders> {
    return this.repository.listForUser(userId, query);
  }

  async getOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.repository.findForUser(orderId, userId);

    if (!order) {
      throw createHttpError(404, "Order not found");
    }

    return order;
  }

  async cancelOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.repository.cancelForUser(orderId, userId);

    if (!order) {
      throw createHttpError(404, "Order not found");
    }

    this.orderUpdatedHandler?.(order);
    return order;
  }

  async transitionOrder(orderId: string, nextState: OrderState): Promise<Order> {
    const order = await this.repository.transition(orderId, nextState);

    if (!order) {
      throw createHttpError(404, "Order not found");
    }

    this.orderUpdatedHandler?.(order);
    return order;
  }
}
