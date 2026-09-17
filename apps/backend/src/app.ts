import compression from "compression";
import cors from "cors";
import express from "express";
import { default as helmet } from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./common/config/env.js";
import { errorHandler, notFoundHandler } from "./common/middleware/error-handler.js";
import { requestIdMiddleware } from "./common/middleware/request-id.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { checkDatabaseReadiness } from "./infrastructure/database/readiness.js";
import { logger } from "./infrastructure/logging/logger.js";
import { createRateLimitMiddleware } from "./common/middleware/rate-limit.js";
import { InMemoryCacheStore, type CacheStore } from "./infrastructure/redis/cache-store.js";
import { RedisCacheStore } from "./infrastructure/redis/redis-cache-store.js";
import { createAuthenticationMiddleware } from "./modules/auth/auth.middleware.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import type { AuthRepository } from "./modules/auth/auth.types.js";
import { ScryptPasswordHasher, type PasswordHasher } from "./modules/auth/password.service.js";
import { JwtTokenService } from "./modules/auth/token.service.js";
import { PrismaCartRepository } from "./modules/cart/cart.repository.js";
import { createCartRouter } from "./modules/cart/cart.routes.js";
import { CartService } from "./modules/cart/cart.service.js";
import type { CartRepository, InventoryRepository } from "./modules/cart/cart.types.js";
import { PrismaInventoryRepository } from "./modules/cart/inventory.repository.js";
import { createHealthRouter, type HealthRouteDependencies } from "./modules/health/health.routes.js";
import { PrismaOrderRepository } from "./modules/orders/order.repository.js";
import { createOrderRouter } from "./modules/orders/order.routes.js";
import { OrderService } from "./modules/orders/order.service.js";
import type { OrderRepository } from "./modules/orders/order.types.js";
import { PrismaPaymentRepository } from "./modules/payments/payment.repository.js";
import { createPaymentRouter } from "./modules/payments/payment.routes.js";
import { PaymentService } from "./modules/payments/payment.service.js";
import type { PaymentRepository } from "./modules/payments/payment.types.js";
import { PrismaProductRepository } from "./modules/products/product.repository.js";
import { createProductRouter } from "./modules/products/product.routes.js";
import { ProductService } from "./modules/products/product.service.js";
import type { ProductRepository } from "./modules/products/product.types.js";
import { createUsersRouter } from "./modules/users/users.routes.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { PrismaAdminRepository, type AdminRepository } from "./modules/admin/admin.repository.js";
import { PrismaAuditRepository, type AuditRepository } from "./modules/audit/audit.repository.js";
import { metrics } from "./infrastructure/metrics/metrics.js";

export type AppDependencies = Partial<HealthRouteDependencies> & {
  authRepository?: AuthRepository;
  passwordHasher?: PasswordHasher;
  tokenService?: JwtTokenService;
  authService?: AuthService;
  productRepository?: ProductRepository;
  productService?: ProductService;
  cartRepository?: CartRepository;
  inventoryRepository?: InventoryRepository;
  cartService?: CartService;
  orderRepository?: OrderRepository;
  orderService?: OrderService;
  paymentRepository?: PaymentRepository;
  paymentService?: PaymentService;
  cacheStore?: CacheStore;
  adminRepository?: AdminRepository;
  auditRepository?: AuditRepository;
};

export function createApp(dependencies: AppDependencies = {}): express.Express {
  const app = express();
  const readinessCheck = dependencies.readinessCheck ?? checkDatabaseReadiness;
  const healthRouter = createHealthRouter({ readinessCheck });
  const authRepository = dependencies.authRepository ?? new PrismaAuthRepository(prisma);
  const passwordHasher = dependencies.passwordHasher ?? new ScryptPasswordHasher();
  const tokenService =
    dependencies.tokenService ??
    new JwtTokenService({
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET
    });
  const authService =
    dependencies.authService ??
    new AuthService({
      repository: authRepository,
      passwordHasher,
      tokenService
    });
  const authenticate = createAuthenticationMiddleware({
    repository: authRepository,
    tokenService
  });
  const productRepository = dependencies.productRepository ?? new PrismaProductRepository(prisma);
  const cartRepository = dependencies.cartRepository ?? new PrismaCartRepository(prisma);
  const inventoryRepository = dependencies.inventoryRepository ?? new PrismaInventoryRepository(prisma);
  const cartService =
    dependencies.cartService ??
    new CartService({
      cartRepository,
      productRepository,
      inventoryRepository
    });
  const orderRepository = dependencies.orderRepository ?? new PrismaOrderRepository(prisma);
  const orderService = dependencies.orderService ?? new OrderService(orderRepository);
  const paymentRepository = dependencies.paymentRepository ?? new PrismaPaymentRepository(prisma);
  const paymentService = dependencies.paymentService ?? new PaymentService(paymentRepository);
  const cacheStore = dependencies.cacheStore ?? (env.NODE_ENV === "test" ? new InMemoryCacheStore() : new RedisCacheStore(env.REDIS_URL));
  const rateLimit = (prefix: string, limit: number, identity?: (req: express.Request) => string) =>
    createRateLimitMiddleware({
      cache: cacheStore,
      prefix,
      limit,
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      identity: identity ?? ((req) => req.ip ?? "unknown")
    });
  const loginRateLimiter = rateLimit("rate:login", env.RATE_LIMIT_LOGIN_MAX, (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "unknown";
    return `${req.ip ?? "unknown"}:${email}`;
  });
  const createOrderRateLimiter = rateLimit("rate:orders", env.RATE_LIMIT_ORDER_MAX);
  const createPaymentRateLimiter = rateLimit("rate:payments", env.RATE_LIMIT_PAYMENT_MAX);
  const productService = dependencies.productService ?? new ProductService(productRepository, {
    store: cacheStore,
    ttlSeconds: env.PRODUCT_CACHE_TTL_SECONDS
  });
  const adminRepository = dependencies.adminRepository ?? new PrismaAdminRepository(prisma);
  const auditRepository = dependencies.auditRepository ?? new PrismaAuditRepository(prisma);

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use((_req, _res, next) => {
    metrics.increment("http.requests");
    next();
  });
  app.use(
    pinoHttp({
      logger,
      customProps: (_req, res) => ({
        requestId: res.locals.requestId
      })
    })
  );
  app.use(helmet());
  app.use(compression());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.use(healthRouter);
  app.use(env.API_PREFIX, healthRouter);
  app.use(env.API_PREFIX, createAuthRouter({ authService, loginRateLimiter }));
  app.use(env.API_PREFIX, createUsersRouter({ authenticate, repository: authRepository }));
  app.use(env.API_PREFIX, createProductRouter({ authenticate, productService }));
  app.use(env.API_PREFIX, createCartRouter({ authenticate, cartService }));
  app.use(env.API_PREFIX, createOrderRouter({ authenticate, orderService, createOrderRateLimiter }));
  app.use(env.API_PREFIX, createPaymentRouter({ authenticate, paymentService, createPaymentRateLimiter }));
  app.use(env.API_PREFIX, createAdminRouter({ authenticate, adminRepository, orderService, auditRepository }));
  app.get("/metrics", (_req, res) => {
    res.status(200).json(metrics.snapshot());
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.tokenService = tokenService;
  app.locals.authRepository = authRepository;
  app.locals.orderService = orderService;

  return app;
}
