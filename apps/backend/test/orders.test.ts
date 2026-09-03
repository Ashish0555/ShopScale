import { randomUUID } from "node:crypto";
import createHttpError from "http-errors";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AuthRepository, PublicUser, RefreshTokenRecord, StoredUser, UserRole } from "../src/modules/auth/auth.types.js";
import { ScryptPasswordHasher } from "../src/modules/auth/password.service.js";
import { JwtTokenService } from "../src/modules/auth/token.service.js";
import { canCancelOrder, canTransitionOrder } from "../src/modules/orders/order.state-machine.js";
import type { Order, OrderItem, OrderListQuery, OrderRepository, OrderState, PaginatedOrders } from "../src/modules/orders/order.types.js";

class InMemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, StoredUser>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<StoredUser> {
    const user: StoredUser = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      role: input.role,
      isActive: true,
      createdAt: new Date()
    };

    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    return this.users.get(id) ?? null;
  }

  async listUsers(): Promise<PublicUser[]> {
    return [...this.users.values()].map(({ id, email, name, role, createdAt }) => ({
      id,
      email,
      name,
      role,
      createdAt
    }));
  }

  async createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    const refreshToken: RefreshTokenRecord = {
      id: randomUUID(),
      tokenHash: input.tokenHash,
      userId: input.userId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedByTokenId: null
    };

    this.refreshTokens.set(refreshToken.tokenHash, refreshToken);
    return refreshToken;
  }

  async rotateRefreshToken(input: {
    tokenHash: string;
    nextTokenHash: string;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<{ userId: string; nextRefreshToken: RefreshTokenRecord } | null> {
    const current = this.refreshTokens.get(input.tokenHash);

    if (!current || current.revokedAt || current.expiresAt <= input.now) {
      return null;
    }

    current.revokedAt = input.now;
    const nextRefreshToken: RefreshTokenRecord = {
      id: randomUUID(),
      tokenHash: input.nextTokenHash,
      userId: current.userId,
      expiresAt: input.nextExpiresAt,
      revokedAt: null,
      replacedByTokenId: null
    };
    current.replacedByTokenId = nextRefreshToken.id;
    this.refreshTokens.set(nextRefreshToken.tokenHash, nextRefreshToken);

    return { userId: current.userId, nextRefreshToken };
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(tokenHash) ?? null;
  }

  async revokeRefreshToken(id: string, replacedByTokenId?: string): Promise<void> {
    const refreshToken = [...this.refreshTokens.values()].find((candidate) => candidate.id === id);

    if (refreshToken) {
      refreshToken.revokedAt = new Date();
      refreshToken.replacedByTokenId = replacedByTokenId ?? null;
    }
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    for (const refreshToken of this.refreshTokens.values()) {
      if (refreshToken.userId === userId && !refreshToken.revokedAt) {
        refreshToken.revokedAt = new Date();
      }
    }
  }
}

class InMemoryOrderRepository implements OrderRepository {
  readonly orders = new Map<string, Order>();
  readonly stock = new Map<string, number>();
  readonly carts = new Map<string, Array<{ productId: string; sku: string; name: string; quantity: number; priceCents: number }>>();

  createFromCart(userId: string): Promise<Order> {
    const cart = this.carts.get(userId) ?? [];

    if (cart.length === 0) {
      throw createHttpError(400, "Cart is empty");
    }

    for (const item of cart) {
      const currentStock = this.stock.get(item.productId) ?? 0;

      if (currentStock < item.quantity) {
        throw createHttpError(409, "Insufficient stock");
      }

      this.stock.set(item.productId, currentStock - item.quantity);
    }

    const now = new Date();
    const items: OrderItem[] = cart.map((item) => ({
      id: randomUUID(),
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.priceCents,
      lineTotalCents: item.priceCents * item.quantity
    }));
    const order: Order = {
      id: randomUUID(),
      userId,
      state: "PLACED",
      totalCents: items.reduce((total, item) => total + item.lineTotalCents, 0),
      currency: "USD",
      items,
      reservations: items.map((item) => ({
        id: randomUUID(),
        productId: item.productId,
        quantity: item.quantity,
        releasedAt: null,
        createdAt: now
      })),
      cancelledAt: null,
      createdAt: now,
      updatedAt: now
    };

    this.orders.set(order.id, order);
    this.carts.set(userId, []);
    return Promise.resolve(copyOrder(order));
  }

  async listForUser(userId: string, query: OrderListQuery): Promise<PaginatedOrders> {
    const items = [...this.orders.values()].filter((order) => order.userId === userId);
    const start = (query.page - 1) * query.pageSize;

    return {
      items: items.slice(start, start + query.pageSize).map(copyOrder),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(items.length / query.pageSize)
    };
  }

  async findForUser(orderId: string, userId: string): Promise<Order | null> {
    const order = this.orders.get(orderId);

    return order && order.userId === userId ? copyOrder(order) : null;
  }

  async cancelForUser(orderId: string, userId: string): Promise<Order | null> {
    const order = this.orders.get(orderId);

    if (!order || order.userId !== userId) {
      return null;
    }

    if (!canCancelOrder(order.state)) {
      throw createHttpError(409, `Cannot cancel order in ${order.state} state`);
    }

    for (const reservation of order.reservations) {
      if (!reservation.releasedAt) {
        this.stock.set(reservation.productId, (this.stock.get(reservation.productId) ?? 0) + reservation.quantity);
        reservation.releasedAt = new Date();
      }
    }

    order.state = "CANCELLED";
    order.cancelledAt = new Date();
    order.updatedAt = order.cancelledAt;
    return copyOrder(order);
  }

  async transition(orderId: string, nextState: OrderState): Promise<Order | null> {
    const order = this.orders.get(orderId);

    if (!order) {
      return null;
    }

    if (!canTransitionOrder(order.state, nextState)) {
      throw createHttpError(409, `Cannot transition order from ${order.state} to ${nextState}`);
    }

    order.state = nextState;
    order.updatedAt = new Date();
    return copyOrder(order);
  }
}

function createHarness() {
  const authRepository = new InMemoryAuthRepository();
  const orderRepository = new InMemoryOrderRepository();
  const passwordHasher = new ScryptPasswordHasher();
  const app = createApp({
    readinessCheck: async () => true,
    authRepository,
    passwordHasher,
    tokenService: new JwtTokenService({
      accessSecret: "test-access-secret-that-is-long-enough",
      refreshSecret: "test-refresh-secret-that-is-long-enough"
    }),
    orderRepository
  });

  return { app, authRepository, orderRepository, passwordHasher };
}

async function customer(harness: ReturnType<typeof createHarness>, email: string): Promise<{ token: string; userId: string }> {
  const user = await harness.authRepository.createUser({
    email,
    name: "Buyer",
    role: "CUSTOMER",
    passwordHash: await harness.passwordHasher.hash("correct-horse")
  });
  const response = await request(harness.app)
    .post("/api/auth/login")
    .send({ email, password: "correct-horse" })
    .expect(200);

  return { token: String(response.body.accessToken), userId: user.id };
}

function seedCartAndStock(repository: InMemoryOrderRepository, userId: string, stock: number): string {
  const productId = randomUUID();

  repository.stock.set(productId, stock);
  repository.carts.set(userId, [
    {
      productId,
      sku: "BAG-001",
      name: "Travel Backpack",
      quantity: 1,
      priceCents: 8900
    }
  ]);

  return productId;
}

function copyOrder(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item })),
    reservations: order.reservations.map((reservation) => ({ ...reservation }))
  };
}

describe("order routes", () => {
  it("creates an order from the authenticated user's cart and clears it", async () => {
    const harness = createHarness();
    const { token, userId } = await customer(harness, "buyer@example.com");
    seedCartAndStock(harness.orderRepository, userId, 2);

    const response = await request(harness.app).post("/api/orders").set("Authorization", `Bearer ${token}`).expect(201);

    expect(response.body.order).toMatchObject({
      userId,
      state: "PLACED",
      totalCents: 8900
    });
    expect(harness.orderRepository.carts.get(userId)).toEqual([]);
  });

  it("lists and reads only the authenticated user's orders", async () => {
    const harness = createHarness();
    const owner = await customer(harness, "owner@example.com");
    const other = await customer(harness, "other@example.com");
    seedCartAndStock(harness.orderRepository, owner.userId, 1);
    const created = await request(harness.app).post("/api/orders").set("Authorization", `Bearer ${owner.token}`).expect(201);
    const orderId = String(created.body.order.id);

    await request(harness.app).get(`/api/orders/${orderId}`).set("Authorization", `Bearer ${other.token}`).expect(404);

    const listResponse = await request(harness.app).get("/api/orders").set("Authorization", `Bearer ${owner.token}`).expect(200);

    expect(listResponse.body.total).toBe(1);
    expect(listResponse.body.items[0].id).toBe(orderId);
  });

  it("cancels an order and releases inventory", async () => {
    const harness = createHarness();
    const { token, userId } = await customer(harness, "buyer@example.com");
    const productId = seedCartAndStock(harness.orderRepository, userId, 1);
    const created = await request(harness.app).post("/api/orders").set("Authorization", `Bearer ${token}`).expect(201);

    expect(harness.orderRepository.stock.get(productId)).toBe(0);

    const response = await request(harness.app)
      .post(`/api/orders/${String(created.body.order.id)}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.order.state).toBe("CANCELLED");
    expect(harness.orderRepository.stock.get(productId)).toBe(1);
  });

  it("rejects empty carts and insufficient stock", async () => {
    const harness = createHarness();
    const { token, userId } = await customer(harness, "buyer@example.com");

    await request(harness.app).post("/api/orders").set("Authorization", `Bearer ${token}`).expect(400);

    seedCartAndStock(harness.orderRepository, userId, 0);
    await request(harness.app).post("/api/orders").set("Authorization", `Bearer ${token}`).expect(409);
  });

  it("does not oversell when many buyers attempt limited stock concurrently", async () => {
    const harness = createHarness();
    const productId = randomUUID();
    harness.orderRepository.stock.set(productId, 1);

    const buyers = await Promise.all(
      Array.from({ length: 100 }, async (_unused, index) => {
        const buyer = await customer(harness, `buyer-${index}@example.com`);
        harness.orderRepository.carts.set(buyer.userId, [
          {
            productId,
            sku: "ONE-001",
            name: "Only One",
            quantity: 1,
            priceCents: 1000
          }
        ]);
        return buyer;
      })
    );

    const results = await Promise.allSettled(
      buyers.map((buyer) => request(harness.app).post("/api/orders").set("Authorization", `Bearer ${buyer.token}`))
    );
    const successfulPurchases = results.filter(
      (result) => result.status === "fulfilled" && result.value.status === 201
    ).length;

    expect(successfulPurchases).toBeLessThanOrEqual(1);
    expect(harness.orderRepository.stock.get(productId)).toBeGreaterThanOrEqual(0);
  });
});
