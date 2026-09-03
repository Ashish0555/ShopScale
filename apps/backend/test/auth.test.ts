import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AuthRepository, PublicUser, RefreshTokenRecord, StoredUser, UserRole } from "../src/modules/auth/auth.types.js";
import { ScryptPasswordHasher } from "../src/modules/auth/password.service.js";
import { JwtTokenService } from "../src/modules/auth/token.service.js";

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
    return [...this.users.values()].map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
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
    const currentRefreshToken = this.refreshTokens.get(input.tokenHash);

    if (!currentRefreshToken || currentRefreshToken.revokedAt || currentRefreshToken.expiresAt <= input.now) {
      return null;
    }

    currentRefreshToken.revokedAt = input.now;

    const nextRefreshToken: RefreshTokenRecord = {
      id: randomUUID(),
      tokenHash: input.nextTokenHash,
      userId: currentRefreshToken.userId,
      expiresAt: input.nextExpiresAt,
      revokedAt: null,
      replacedByTokenId: null
    };

    currentRefreshToken.replacedByTokenId = nextRefreshToken.id;
    this.refreshTokens.set(nextRefreshToken.tokenHash, nextRefreshToken);

    return {
      userId: currentRefreshToken.userId,
      nextRefreshToken
    };
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

function createTestApp(repository = new InMemoryAuthRepository()) {
  const passwordHasher = new ScryptPasswordHasher();
  const tokenService = new JwtTokenService({
    accessSecret: "test-access-secret-that-is-long-enough",
    refreshSecret: "test-refresh-secret-that-is-long-enough"
  });

  return {
    app: createApp({
      readinessCheck: async () => true,
      authRepository: repository,
      passwordHasher,
      tokenService
    }),
    passwordHasher,
    repository
  };
}

describe("auth routes", () => {
  it("registers a customer and never accepts a frontend role", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "Buyer@Example.com",
        name: "Buyer",
        password: "correct-horse",
        role: "ADMIN"
      })
      .expect(201);

    expect(response.body.user).toMatchObject({
      email: "buyer@example.com",
      name: "Buyer",
      role: "CUSTOMER"
    });
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.tokenType).toBe("Bearer");
  });

  it("rejects duplicate registration emails", async () => {
    const { app } = createTestApp();
    const payload = {
      email: "buyer@example.com",
      name: "Buyer",
      password: "correct-horse"
    };

    await request(app).post("/api/auth/register").send(payload).expect(201);
    const response = await request(app).post("/api/auth/register").send(payload).expect(409);

    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("logs in with valid credentials and rejects invalid passwords", async () => {
    const { app } = createTestApp();

    await request(app).post("/api/auth/register").send({
      email: "buyer@example.com",
      name: "Buyer",
      password: "correct-horse"
    });

    await request(app)
      .post("/api/auth/login")
      .send({ email: "buyer@example.com", password: "wrong-password" })
      .expect(401);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "buyer@example.com", password: "correct-horse" })
      .expect(200);

    expect(response.body.user.email).toBe("buyer@example.com");
    expect(response.body.accessToken).toEqual(expect.any(String));
  });

  it("protects current-user identity with a valid access token", async () => {
    const { app } = createTestApp();
    const authResponse = await request(app).post("/api/auth/register").send({
      email: "buyer@example.com",
      name: "Buyer",
      password: "correct-horse"
    });

    await request(app).get("/api/users/me").expect(401);

    const response = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${String(authResponse.body.accessToken)}`)
      .expect(200);

    expect(response.body.user).toMatchObject({
      email: "buyer@example.com",
      role: "CUSTOMER"
    });
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it("rotates refresh tokens and invalidates the previous token", async () => {
    const { app } = createTestApp();
    const registerResponse = await request(app).post("/api/auth/register").send({
      email: "buyer@example.com",
      name: "Buyer",
      password: "correct-horse"
    });
    const originalRefreshToken = String(registerResponse.body.refreshToken);

    const refreshResponse = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: originalRefreshToken })
      .expect(200);

    expect(refreshResponse.body.refreshToken).not.toBe(originalRefreshToken);

    await request(app).post("/api/auth/refresh").send({ refreshToken: originalRefreshToken }).expect(401);
    await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: String(refreshResponse.body.refreshToken) })
      .expect(200);
  });

  it("logs out by revoking the submitted refresh token", async () => {
    const { app } = createTestApp();
    const registerResponse = await request(app).post("/api/auth/register").send({
      email: "buyer@example.com",
      name: "Buyer",
      password: "correct-horse"
    });
    const refreshToken = String(registerResponse.body.refreshToken);

    await request(app).post("/api/auth/logout").send({ refreshToken }).expect(204);
    await request(app).post("/api/auth/refresh").send({ refreshToken }).expect(401);
  });

  it("enforces admin-only authorization", async () => {
    const repository = new InMemoryAuthRepository();
    const { app, passwordHasher } = createTestApp(repository);

    const customerResponse = await request(app).post("/api/auth/register").send({
      email: "buyer@example.com",
      name: "Buyer",
      password: "correct-horse"
    });

    await repository.createUser({
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
      passwordHash: await passwordHasher.hash("correct-horse")
    });

    const adminResponse = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "correct-horse" })
      .expect(200);

    await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${String(customerResponse.body.accessToken)}`)
      .expect(403);

    const response = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${String(adminResponse.body.accessToken)}`)
      .expect(200);

    expect(response.body.users).toHaveLength(2);
  });

  it("returns validation errors for malformed input", async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", name: "", password: "short" })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid request body"
    });
  });
});
