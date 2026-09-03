import { randomUUID } from "node:crypto";
import createHttpError from "http-errors";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { AuthRepository, PublicUser, RefreshTokenRecord, StoredUser, UserRole } from "../src/modules/auth/auth.types.js";
import { ScryptPasswordHasher } from "../src/modules/auth/password.service.js";
import { JwtTokenService } from "../src/modules/auth/token.service.js";
import { ProductService } from "../src/modules/products/product.service.js";
import { InMemoryCacheStore } from "../src/infrastructure/redis/cache-store.js";
import type {
  Category,
  CategoryListQuery,
  CreateCategoryInput,
  CreateProductInput,
  PaginatedResult,
  Product,
  ProductListQuery,
  ProductRepository,
  UpdateCategoryInput,
  UpdateProductInput
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

class InMemoryProductRepository implements ProductRepository {
  private readonly categories = new Map<string, Category>();
  private readonly products = new Map<string, Product>();

  async listCategories(query: CategoryListQuery): Promise<PaginatedResult<Category>> {
    const items = [...this.categories.values()]
      .filter((category) => query.isActive === undefined || category.isActive === query.isActive)
      .filter((category) => matchesSearch([category.name, category.description], query.search))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return paginate(items, query.page, query.pageSize);
  }

  async findCategoryById(id: string): Promise<Category | null> {
    return this.categories.get(id) ?? null;
  }

  async createCategory(
    input: Required<Omit<CreateCategoryInput, "description">> & { description: string | null }
  ): Promise<Category> {
    if ([...this.categories.values()].some((category) => category.slug === input.slug)) {
      throw createHttpError(409, "A category with this slug already exists");
    }

    const now = new Date();
    const category: Category = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      description: input.description,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now
    };

    this.categories.set(category.id, category);
    return category;
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category | null> {
    const category = this.categories.get(id);

    if (!category) {
      return null;
    }

    if (
      input.slug &&
      [...this.categories.values()].some((candidate) => candidate.id !== id && candidate.slug === input.slug)
    ) {
      throw createHttpError(409, "A category with this slug already exists");
    }

    const updated = {
      ...category,
      ...input,
      description: input.description === undefined ? category.description : input.description,
      updatedAt: new Date()
    };

    this.categories.set(id, updated);
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const deleted = this.categories.delete(id);

    if (deleted) {
      for (const [productId, product] of this.products.entries()) {
        if (product.categoryId === id) {
          this.products.set(productId, {
            ...product,
            categoryId: null,
            category: null,
            updatedAt: new Date()
          });
        }
      }
    }

    return deleted;
  }

  async listProducts(query: ProductListQuery): Promise<PaginatedResult<Product>> {
    const items = [...this.products.values()]
      .filter((product) => query.categoryId === undefined || product.categoryId === query.categoryId)
      .filter((product) => query.isActive === undefined || product.isActive === query.isActive)
      .filter((product) => matchesSearch([product.name, product.description, product.sku], query.search))
      .sort((a, b) => compareProducts(a, b, query));

    return paginate(items, query.page, query.pageSize);
  }

  async findProductById(id: string): Promise<Product | null> {
    return this.products.get(id) ?? null;
  }

  async createProduct(
    input: Required<Omit<CreateProductInput, "description" | "categoryId">> & {
      description: string | null;
      categoryId: string | null;
    }
  ): Promise<Product> {
    if ([...this.products.values()].some((product) => product.sku === input.sku || product.slug === input.slug)) {
      throw createHttpError(409, "A product with this SKU or slug already exists");
    }

    const now = new Date();
    const category = input.categoryId ? this.categories.get(input.categoryId) ?? null : null;
    const product: Product = {
      id: randomUUID(),
      sku: input.sku,
      slug: input.slug,
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      currency: input.currency,
      isActive: input.isActive,
      categoryId: input.categoryId,
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      createdAt: now,
      updatedAt: now
    };

    this.products.set(product.id, product);
    return product;
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product | null> {
    const product = this.products.get(id);

    if (!product) {
      return null;
    }

    if (
      (input.sku || input.slug) &&
      [...this.products.values()].some(
        (candidate) =>
          candidate.id !== id &&
          ((input.sku !== undefined && candidate.sku === input.sku) ||
            (input.slug !== undefined && candidate.slug === input.slug))
      )
    ) {
      throw createHttpError(409, "A product with this SKU or slug already exists");
    }

    const category = input.categoryId ? this.categories.get(input.categoryId) ?? null : null;
    const updated: Product = {
      ...product,
      ...input,
      description: input.description === undefined ? product.description : input.description,
      categoryId: input.categoryId === undefined ? product.categoryId : input.categoryId,
      category:
        input.categoryId === undefined
          ? product.category
          : category
            ? { id: category.id, name: category.name, slug: category.slug }
            : null,
      updatedAt: new Date()
    };

    this.products.set(id, updated);
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.products.delete(id);
  }
}

function createTestApp() {
  const authRepository = new InMemoryAuthRepository();
  const productRepository = new InMemoryProductRepository();
  const passwordHasher = new ScryptPasswordHasher();
  const tokenService = new JwtTokenService({
    accessSecret: "test-access-secret-that-is-long-enough",
    refreshSecret: "test-refresh-secret-that-is-long-enough"
  });

  return {
    app: createApp({
      readinessCheck: async () => true,
      authRepository,
      passwordHasher,
      tokenService,
      productRepository,
      productService: new ProductService(productRepository)
    }),
    authRepository,
    passwordHasher
  };
}

async function createUserToken(input: {
  app: ReturnType<typeof createApp>;
  authRepository: InMemoryAuthRepository;
  passwordHasher: ScryptPasswordHasher;
  role: UserRole;
  email: string;
}): Promise<string> {
  await input.authRepository.createUser({
    email: input.email,
    name: input.role === "ADMIN" ? "Admin" : "Customer",
    role: input.role,
    passwordHash: await input.passwordHasher.hash("correct-horse")
  });

  const response = await request(input.app)
    .post("/api/auth/login")
    .send({ email: input.email, password: "correct-horse" })
    .expect(200);

  return String(response.body.accessToken);
}

function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize)
  };
}

function matchesSearch(values: Array<string | null>, search: string | undefined): boolean {
  if (!search) {
    return true;
  }

  const normalizedSearch = search.toLowerCase();

  return values.some((value) => value?.toLowerCase().includes(normalizedSearch));
}

function compareProducts(a: Product, b: Product, query: ProductListQuery): number {
  const direction = query.sortDirection === "asc" ? 1 : -1;

  switch (query.sortBy) {
    case "name":
      return a.name.localeCompare(b.name) * direction;
    case "priceCents":
      return (a.priceCents - b.priceCents) * direction;
    case "createdAt":
      return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
  }
}

describe("product and category routes", () => {
  it("caches product reads and invalidates updated products", async () => {
    const repository = new InMemoryProductRepository();
    const cache = new InMemoryCacheStore();
    const service = new ProductService(repository, { store: cache, ttlSeconds: 60 });
    const product = await service.createProduct({ sku: "CACHE-1", name: "Cached product", priceCents: 1200 });

    await service.getProduct(product.id);
    expect(await cache.get(`product:${product.id}`)).not.toBeNull();

    await service.updateProduct(product.id, { name: "Updated cached product" });
    expect(await cache.get(`product:${product.id}`)).toBeNull();
  });

  it("allows only admins to create categories and products", async () => {
    const { app, authRepository, passwordHasher } = createTestApp();
    const customerToken = await createUserToken({
      app,
      authRepository,
      passwordHasher,
      role: "CUSTOMER",
      email: "buyer@example.com"
    });
    const adminToken = await createUserToken({
      app,
      authRepository,
      passwordHasher,
      role: "ADMIN",
      email: "admin@example.com"
    });

    await request(app).post("/api/categories").send({ name: "Bags" }).expect(401);
    await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ name: "Bags" })
      .expect(403);

    const categoryResponse = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Bags", description: "Carry goods" })
      .expect(201);

    expect(categoryResponse.body.category).toMatchObject({
      name: "Bags",
      slug: "bags",
      isActive: true
    });

    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        sku: "BAG-001",
        name: "Travel Backpack",
        priceCents: 8900,
        categoryId: String(categoryResponse.body.category.id)
      })
      .expect(403);

    const productResponse = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "BAG-001",
        name: "Travel Backpack",
        description: "Durable travel bag",
        priceCents: 8900,
        categoryId: String(categoryResponse.body.category.id)
      })
      .expect(201);

    expect(productResponse.body.product).toMatchObject({
      sku: "BAG-001",
      slug: "travel-backpack",
      priceCents: 8900,
      category: {
        name: "Bags"
      }
    });
  });

  it("supports public category and product reads", async () => {
    const { app, authRepository, passwordHasher } = createTestApp();
    const adminToken = await createUserToken({
      app,
      authRepository,
      passwordHasher,
      role: "ADMIN",
      email: "admin@example.com"
    });
    const categoryResponse = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Accessories" })
      .expect(201);
    const productResponse = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "CAP-001",
        name: "Cotton Cap",
        priceCents: 2400,
        categoryId: String(categoryResponse.body.category.id)
      })
      .expect(201);

    await request(app).get(`/api/categories/${String(categoryResponse.body.category.id)}`).expect(200);
    const response = await request(app).get(`/api/products/${String(productResponse.body.product.id)}`).expect(200);

    expect(response.body.product).toMatchObject({
      name: "Cotton Cap",
      category: {
        slug: "accessories"
      }
    });
  });

  it("supports pagination, filtering, sorting, and search", async () => {
    const { app, authRepository, passwordHasher } = createTestApp();
    const adminToken = await createUserToken({
      app,
      authRepository,
      passwordHasher,
      role: "ADMIN",
      email: "admin@example.com"
    });
    const categoryResponse = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Drinkware" });

    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "BOTTLE-001",
        name: "Steel Bottle",
        description: "Insulated water bottle",
        priceCents: 2400,
        categoryId: String(categoryResponse.body.category.id)
      });
    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "MUG-001",
        name: "Ceramic Mug",
        description: "Desk coffee mug",
        priceCents: 1800,
        categoryId: String(categoryResponse.body.category.id),
        isActive: false
      });

    const response = await request(app)
      .get("/api/products")
      .query({
        search: "mug",
        isActive: false,
        sortBy: "priceCents",
        sortDirection: "asc",
        page: 1,
        pageSize: 1
      })
      .expect(200);

    expect(response.body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1
    });
    expect(response.body.items[0]).toMatchObject({
      sku: "MUG-001",
      name: "Ceramic Mug"
    });
  });

  it("updates and deletes products as admin", async () => {
    const { app, authRepository, passwordHasher } = createTestApp();
    const adminToken = await createUserToken({
      app,
      authRepository,
      passwordHasher,
      role: "ADMIN",
      email: "admin@example.com"
    });
    const productResponse = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "TEE-001",
        name: "Basic Tee",
        priceCents: 3200
      });

    const productId = String(productResponse.body.product.id);

    const updateResponse = await request(app)
      .patch(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Heavyweight Tee", priceCents: 4200 })
      .expect(200);

    expect(updateResponse.body.product).toMatchObject({
      name: "Heavyweight Tee",
      slug: "heavyweight-tee",
      priceCents: 4200
    });

    await request(app).delete(`/api/products/${productId}`).set("Authorization", `Bearer ${adminToken}`).expect(204);
    await request(app).get(`/api/products/${productId}`).expect(404);
  });

  it("rejects products for missing categories and invalid input", async () => {
    const { app, authRepository, passwordHasher } = createTestApp();
    const adminToken = await createUserToken({
      app,
      authRepository,
      passwordHasher,
      role: "ADMIN",
      email: "admin@example.com"
    });

    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "BAD-001",
        name: "Missing Category Product",
        priceCents: 1000,
        categoryId: randomUUID()
      })
      .expect(400);

    const response = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: "spaces are invalid",
        name: "",
        priceCents: -1
      })
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Invalid request"
    });
  });
});
