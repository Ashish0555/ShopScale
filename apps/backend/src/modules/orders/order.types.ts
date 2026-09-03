export type OrderState = "PLACED" | "CONFIRMED" | "PACKED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export type OrderItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type InventoryReservation = {
  id: string;
  productId: string;
  quantity: number;
  releasedAt: Date | null;
  createdAt: Date;
};

export type Order = {
  id: string;
  userId: string;
  state: OrderState;
  totalCents: number;
  currency: string;
  items: OrderItem[];
  reservations: InventoryReservation[];
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderListQuery = {
  page: number;
  pageSize: number;
};

export type PaginatedOrders = {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type OrderRepository = {
  createFromCart(userId: string): Promise<Order>;
  listForUser(userId: string, query: OrderListQuery): Promise<PaginatedOrders>;
  findForUser(orderId: string, userId: string): Promise<Order | null>;
  cancelForUser(orderId: string, userId: string): Promise<Order | null>;
  transition(orderId: string, nextState: OrderState): Promise<Order | null>;
};
