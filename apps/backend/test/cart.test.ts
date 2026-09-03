import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AuthRepository, PublicUser, RefreshTokenRecord, StoredUser, UserRole } from "../src/modules/auth/auth.types.js";
import { ScryptPasswordHasher } from "../src/modules/auth/password.service.js";
import { JwtTokenService } from "../src/modules/auth/token.service.js";
import type { Cart, CartItem, CartRepository, InventoryRepository } from "../src/modules/cart/cart.types.js";
import type {
  PaginatedResult,
  Product,
  ProductRepository
} from "../src/modules/products/product.types.js";

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

class InMemoryProductRepository implements ProductRepository {
  readonly products = new Map<string, Product>();

  addProduct(product: Partial<Product> & Pick<Product, "name" | "sku" | "priceCents">): Product {
    const now = new Date();
    const created: Product = {
      id: product.id ?? randomUUID(),
      sku: product.sku,
      slug: product.slug ?? product.name.toLowerCase().replaceAll(" ", "-"),
      name: product.name,
      description: product.description ?? null,
      priceCents: product.priceCents,
      currency: product.currency ?? "USD",
      isActive: product.isActive ?? true,
      categoryId: product.categoryId ?? null,
      category: product.category ?? null,
      createdAt: now,
      updatedAt: now
    };

    this.products.set(created.id, created);
    return created;
  }

  async findProductById(id: string): Promise<Product | null> {
    return this.products.get(id) ?? null;
  }

  async listCategories(): Promise<PaginatedResult<never>> {
    return emptyPage();
  }

  async createCategory(): Promise<never> {
    throw new Error("Not implemented in cart tests");
  }

  async findCategoryById(): Promise<null> {
    return null;
  }

  async updateCategory(): Promise<null> {
    return null;
  }

  async deleteCategory(): Promise<boolean> {
    return false;
  }

  async listProducts(): Promise<PaginatedResult<Product>> {
    return emptyPage();
  }

  async createProduct(): Promise<never> {
    throw new Error("Not implemented in cart tests");
  }

  async updateProduct(): Promise<null> {
    return null;
  }

  async deleteProduct(): Promise<boolean> {
    return false;
  }
}

class InMemoryInventoryRepository implements InventoryRepository {
  private readonly stock = new Map<string, number>();

  setAvailableQuantity(productId: string, quantity: number): void {
    this.stock.set(productId, quantity);
  }

  async getAvailableQuantity(productId: string): Promise<number> {
    return this.stock.get(productId) ?? 0;
  }
}

class InMemoryCartRepository implements CartRepository {
  private readonly cartsByUserId = new Map<string, Cart>();

  async getOrCreateCart(userId: string): Promise<Cart> {
    const cart = this.cartsByUserId.get(userId) ?? createEmptyCart(userId);
    this.cartsByUserId.set(userId, cart);
    return copyCart(cart);
  }

  async findCartByUserId(userId: string): Promise<Cart | null> {
    const cart = this.cartsByUserId.get(userId);
    return cart ? copyCart(cart) : null;
  }

  async upsertItem(input: { userId: string; product: Product; quantity: number }): Promise<Cart> {
    const cart = this.cartsByUserId.get(input.userId) ?? createEmptyCart(input.userId);
    const existing = cart.items.find((item) => item.productId === input.product.id);
    const now = new Date();

    if (existing) {
      existing.quantity = input.quantity;
      existing.updatedAt = now;
    } else {
      cart.items.push({
        id: randomUUID(),
        productId: input.product.id,
        product: input.product,
        quantity: input.quantity,
        createdAt: now,
        updatedAt: now
      });
    }

    cart.updatedAt = now;
    this.cartsByUserId.set(input.userId, cart);
    return copyCart(cart);
  }

  async updateItemQuantity(input: { userId: string; itemId: string; quantity: number }): Promise<Cart | null> {
    const cart = this.cartsByUserId.get(input.userId);
    const item = cart?.items.find((candidate) => candidate.id === input.itemId);

    if (!cart || !item) {
      return null;
    }

    item.quantity = input.quantity;
    item.updatedAt = new Date();
    cart.updatedAt = item.updatedAt;
    return copyCart(cart);
  }

  async removeItem(input: { userId: string; itemId: string }): Promise<Cart | null> {
    const cart = this.cartsByUserId.get(input.userId);

    if (!cart || !cart.items.some((item) => item.id === input.itemId)) {
      return null;
    }

    cart.items = cart.items.filter((item) => item.id !== input.itemId);
    cart.updatedAt = new Date();
    return copyCart(cart);
  }

  async clearCart(userId: string): Promise<Cart> {
    const cart = this.cartsByUserId.get(userId) ?? createEmptyCart(userId);
    cart.items = [];
    cart.updatedAt = new Date();
    this.cartsByUserId.set(userId, cart);
    return copyCart(cart);
  }
}

function createHarness() {
  const authRepository = new InMemoryAuthRepository();
  const productRepository = new InMemoryProductRepository();
  const inventoryRepository = new InMemoryInventoryRepository();
  const cartRepository = new InMemoryCartRepository();
  const passwordHasher = new ScryptPasswordHasher();
  const tokenService = new JwtTokenService({
    accessSecret: "test-access-secret-that-is-long-enough",
    refreshSecret: "test-refresh-secret-that-is-long-enough"
  });
  const app = createApp({
    readinessCheck: async () => true,
    authRepository,
    passwordHasher,
    tokenService,
    productRepository,
    inventoryRepository,
    cartRepository
  });

  return { app, authRepository, productRepository, inventoryRepository, passwordHasher };
}

async function customerToken(harness: ReturnType<typeof createHarness>, email = "buyer@example.com"): Promise<string> {
  await harness.authRepository.createUser({
    email,
    name: "Buyer",
    role: "CUSTOMER",
    passwordHash: await harness.passwordHasher.hash("correct-horse")
  });

  const response = await request(harness.app)
    .post("/api/auth/login")
    .send({ email, password: "correct-horse" })
    .expect(200);

  return String(response.body.accessToken);
}

function createEmptyCart(userId: string): Cart {
  const now = new Date();

  return {
    id: randomUUID(),
    userId,
    items: [],
    createdAt: now,
    updatedAt: now
  };
}

function copyCart(cart: Cart): Cart {
  return {
    ...cart,
    items: cart.items.map(copyCartItem)
  };
}

function copyCartItem(item: CartItem): CartItem {
  return {
    ...item,
    product: {
      ...item.product
    }
  };
}

function emptyPage<T>(): PaginatedResult<T> {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0
  };
}

describe("cart routes", () => {
  it("requires authentication and returns an empty cart", async () => {
    const harness = createHarness();
    const token = await customerToken(harness);

    await request(harness.app).get("/api/cart").expect(401);

    const response = await request(harness.app).get("/api/cart").set("Authorization", `Bearer ${token}`).expect(200);

    expect(response.body.cart.items).toEqual([]);
  });

  it("adds and updates cart items when stock is available", async () => {
    const harness = createHarness();
    const token = await customerToken(harness);
    const product = harness.productRepository.addProduct({
      sku: "BAG-001",
      name: "Travel Backpack",
      priceCents: 8900
    });
    harness.inventoryRepository.setAvailableQuantity(product.id, 5);

    const addResponse = await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 })
      .expect(200);

    expect(addResponse.body.cart.items[0]).toMatchObject({
      productId: product.id,
      quantity: 2,
      product: {
        name: "Travel Backpack"
      }
    });

    const itemId = String(addResponse.body.cart.items[0].id);
    const updateResponse = await request(harness.app)
      .patch(`/api/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ quantity: 4 })
      .expect(200);

    expect(updateResponse.body.cart.items[0]).toMatchObject({
      id: itemId,
      quantity: 4
    });
  });

  it("removes individual items and clears the cart", async () => {
    const harness = createHarness();
    const token = await customerToken(harness);
    const product = harness.productRepository.addProduct({
      sku: "BOTTLE-001",
      name: "Steel Bottle",
      priceCents: 2400
    });
    harness.inventoryRepository.setAvailableQuantity(product.id, 3);
    const addResponse = await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });
    const itemId = String(addResponse.body.cart.items[0].id);

    const removeResponse = await request(harness.app)
      .delete(`/api/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(removeResponse.body.cart.items).toEqual([]);

    await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: product.id, quantity: 1 });
    const clearResponse = await request(harness.app).delete("/api/cart").set("Authorization", `Bearer ${token}`).expect(200);

    expect(clearResponse.body.cart.items).toEqual([]);
  });

  it("rejects missing products, inactive products, invalid quantities, and insufficient stock", async () => {
    const harness = createHarness();
    const token = await customerToken(harness);
    const inactiveProduct = harness.productRepository.addProduct({
      sku: "OLD-001",
      name: "Inactive Product",
      priceCents: 1000,
      isActive: false
    });
    const stockedProduct = harness.productRepository.addProduct({
      sku: "CAP-001",
      name: "Cotton Cap",
      priceCents: 2400
    });
    harness.inventoryRepository.setAvailableQuantity(stockedProduct.id, 1);

    await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: randomUUID(), quantity: 1 })
      .expect(404);
    await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: inactiveProduct.id, quantity: 1 })
      .expect(400);
    await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: stockedProduct.id, quantity: 0 })
      .expect(400);
    await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: stockedProduct.id, quantity: 2 })
      .expect(409);
  });

  it("does not allow one user to mutate another user's cart item", async () => {
    const harness = createHarness();
    const ownerToken = await customerToken(harness, "owner@example.com");
    const otherToken = await customerToken(harness, "other@example.com");
    const product = harness.productRepository.addProduct({
      sku: "TEE-001",
      name: "Basic Tee",
      priceCents: 3200
    });
    harness.inventoryRepository.setAvailableQuantity(product.id, 2);
    const addResponse = await request(harness.app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId: product.id, quantity: 1 });
    const itemId = String(addResponse.body.cart.items[0].id);

    await request(harness.app)
      .patch(`/api/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ quantity: 2 })
      .expect(404);
    await request(harness.app).delete(`/api/cart/items/${itemId}`).set("Authorization", `Bearer ${otherToken}`).expect(404);
  });
});
