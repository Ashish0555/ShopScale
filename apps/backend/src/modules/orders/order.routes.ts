import { Router, type RequestHandler } from "express";
import createHttpError from "http-errors";
import { z, ZodError } from "zod";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { getAuthenticatedUser } from "../auth/auth.middleware.js";
import { orderIdParamSchema, orderListQuerySchema } from "./order.schemas.js";
import type { OrderService } from "./order.service.js";

export type OrderRouteDependencies = {
  authenticate: RequestHandler;
  orderService: OrderService;
  createOrderRateLimiter?: RequestHandler;
};

export function createOrderRouter(dependencies: OrderRouteDependencies): Router {
  const router = Router();

  router.post(
    "/orders",
    dependencies.authenticate,
    ...(dependencies.createOrderRateLimiter ? [dependencies.createOrderRateLimiter] : []),
    asyncHandler(async (_req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const order = await dependencies.orderService.createOrder(user.id);

      res.status(201).json({ order });
    })
  );

  router.get(
    "/orders",
    dependencies.authenticate,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const query = parseInput(orderListQuerySchema, req.query);
      const orders = await dependencies.orderService.listOrders(user.id, query);

      res.status(200).json(orders);
    })
  );

  router.get(
    "/orders/:id",
    dependencies.authenticate,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const { id } = parseInput(orderIdParamSchema, req.params);
      const order = await dependencies.orderService.getOrder(id, user.id);

      res.status(200).json({ order });
    })
  );

  router.post(
    "/orders/:id/cancel",
    dependencies.authenticate,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const { id } = parseInput(orderIdParamSchema, req.params);
      const order = await dependencies.orderService.cancelOrder(id, user.id);

      res.status(200).json({ order });
    })
  );

  return router;
}

function parseInput<TSchema extends z.ZodTypeAny>(schema: TSchema, input: unknown): z.output<TSchema> {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      throw createHttpError(400, "Invalid request", {
        details: error.flatten().fieldErrors
      });
    }

    throw error;
  }
}
