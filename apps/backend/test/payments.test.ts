import { randomUUID } from "node:crypto";
import createHttpError from "http-errors";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AuthRepository, PublicUser, RefreshTokenRecord, StoredUser, UserRole } from "../src/modules/auth/auth.types.js";
import { ScryptPasswordHasher } from "../src/modules/auth/password.service.js";
import { JwtTokenService } from "../src/modules/auth/token.service.js";
import type { Payment, PaymentRepository } from "../src/modules/payments/payment.types.js";

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
    this.refreshTokens.set(nextRefreshToken.tokenHash, nextRefreshToken);
    return { userId: current.userId, nextRefreshToken };
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(tokenHash) ?? null;
  }

  async revokeRefreshToken(): Promise<void> {}

  async revokeAllRefreshTokensForUser(): Promise<void> {}
}

class InMemoryPaymentRepository implements PaymentRepository {
  readonly payments = new Map<string, Payment>();
  private readonly orderTotals = new Map<string, { userId: string; totalCents: number; currency: string; cancelled: boolean }>();
  private readonly idempotency = new Map<string, { requestHash: string; status: number; body: unknown }>();

  seedOrder(input: { id?: string; userId: string; totalCents?: number; cancelled?: boolean }): string {
    const id = input.id ?? randomUUID();
    this.orderTotals.set(id, {
      userId: input.userId,
      totalCents: input.totalCents ?? 8900,
      currency: "USD",
      cancelled: input.cancelled ?? false
    });
    return id;
  }

  async createPaymentWithIdempotency(input: {
    userId: string;
    idempotencyKey: string;
    method: string;
    path: string;
    requestHash: string;
    orderId: string;
    simulateFailure: boolean;
  }): Promise<{ status: number; body: unknown; replayed: boolean }> {
    const key = `${input.userId}:${input.idempotencyKey}:${input.method}:${input.path}`;
    const existing = this.idempotency.get(key);

    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw createHttpError(409, "Idempotency key was already used with a different request");
      }

      return { status: existing.status, body: existing.body, replayed: true };
    }

    const order = this.orderTotals.get(input.orderId);

    if (!order || order.userId !== input.userId) {
      throw createHttpError(404, "Order not found");
    }

    if (order.cancelled) {
      throw createHttpError(409, "Cannot pay for a cancelled order");
    }

    const now = new Date();
    const payment: Payment = {
      id: randomUUID(),
      userId: input.userId,
      orderId: input.orderId,
      amountCents: order.totalCents,
      currency: order.currency,
      state: input.simulateFailure ? "FAILED" : "SUCCESS",
      providerRef: `sim_${randomUUID()}`,
      failureReason: input.simulateFailure ? "Simulated payment failure" : null,
      createdAt: now,
      updatedAt: now
    };
    const status = input.simulateFailure ? 402 : 201;
    const body = { payment };

    this.payments.set(payment.id, payment);
    this.idempotency.set(key, { requestHash: input.requestHash, status, body });

    return { status, body, replayed: false };
  }

  async findPaymentForUser(paymentId: string, userId: string): Promise<Payment | null> {
    const payment = this.payments.get(paymentId);

    return payment && payment.userId === userId ? payment : null;
  }
}

function createHarness() {
  const authRepository = new InMemoryAuthRepository();
  const paymentRepository = new InMemoryPaymentRepository();
  const passwordHasher = new ScryptPasswordHasher();
  const app = createApp({
    readinessCheck: async () => true,
    authRepository,
    passwordHasher,
    tokenService: new JwtTokenService({
      accessSecret: "test-access-secret-that-is-long-enough",
      refreshSecret: "test-refresh-secret-that-is-long-enough"
    }),
    paymentRepository
  });

  return { app, authRepository, paymentRepository, passwordHasher };
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

describe("payment routes", () => {
  it("creates a successful simulated payment and replays duplicate idempotent requests", async () => {
    const harness = createHarness();
    const buyer = await customer(harness, "buyer@example.com");
    const orderId = harness.paymentRepository.seedOrder({ userId: buyer.userId });
    const payload = { orderId };

    const first = await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${buyer.token}`)
      .set("Idempotency-Key", "pay-1")
      .send(payload)
      .expect(201);
    const replay = await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${buyer.token}`)
      .set("Idempotency-Key", "pay-1")
      .send(payload)
      .expect(201);

    expect(first.body.payment).toMatchObject({ orderId, state: "SUCCESS", amountCents: 8900 });
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body.payment.id).toBe(first.body.payment.id);
    expect(harness.paymentRepository.payments.size).toBe(1);
  });

  it("rejects reused idempotency keys with a different request body", async () => {
    const harness = createHarness();
    const buyer = await customer(harness, "buyer@example.com");
    const orderId = harness.paymentRepository.seedOrder({ userId: buyer.userId });

    await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${buyer.token}`)
      .set("Idempotency-Key", "pay-1")
      .send({ orderId })
      .expect(201);
    await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${buyer.token}`)
      .set("Idempotency-Key", "pay-1")
      .send({ orderId, simulateFailure: true })
      .expect(409);
  });

  it("stores and replays failed payment results", async () => {
    const harness = createHarness();
    const buyer = await customer(harness, "buyer@example.com");
    const orderId = harness.paymentRepository.seedOrder({ userId: buyer.userId });

    const first = await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${buyer.token}`)
      .set("Idempotency-Key", "pay-fail")
      .send({ orderId, simulateFailure: true })
      .expect(402);
    const replay = await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${buyer.token}`)
      .set("Idempotency-Key", "pay-fail")
      .send({ orderId, simulateFailure: true })
      .expect(402);

    expect(first.body.payment.state).toBe("FAILED");
    expect(replay.body.payment.id).toBe(first.body.payment.id);
    expect(harness.paymentRepository.payments.size).toBe(1);
  });

  it("requires idempotency keys and user-owned orders", async () => {
    const harness = createHarness();
    const owner = await customer(harness, "owner@example.com");
    const other = await customer(harness, "other@example.com");
    const orderId = harness.paymentRepository.seedOrder({ userId: owner.userId });

    await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ orderId })
      .expect(400);
    await request(harness.app)
      .post("/api/payments")
      .set("Authorization", `Bearer ${other.token}`)
      .set("Idempotency-Key", "pay-1")
      .send({ orderId })
      .expect(404);
  });

  it("replays concurrent duplicate payment requests without duplicate payments", async () => {
    const harness = createHarness();
    const buyer = await customer(harness, "buyer@example.com");
    const orderId = harness.paymentRepository.seedOrder({ userId: buyer.userId });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(harness.app)
          .post("/api/payments")
          .set("Authorization", `Bearer ${buyer.token}`)
          .set("Idempotency-Key", "pay-concurrent")
          .send({ orderId })
      )
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(responses.map((response) => response.body.payment.id)).size).toBe(1);
    expect(harness.paymentRepository.payments.size).toBe(1);
  });
});
