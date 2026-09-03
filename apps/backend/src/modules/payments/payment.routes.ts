import { Router, type RequestHandler } from "express";
import createHttpError from "http-errors";
import { z, ZodError } from "zod";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { getAuthenticatedUser } from "../auth/auth.middleware.js";
import { createPaymentSchema, paymentIdParamSchema } from "./payment.schemas.js";
import type { PaymentService } from "./payment.service.js";

export type PaymentRouteDependencies = {
  authenticate: RequestHandler;
  paymentService: PaymentService;
  createPaymentRateLimiter?: RequestHandler;
};

export function createPaymentRouter(dependencies: PaymentRouteDependencies): Router {
  const router = Router();

  router.post(
    "/payments",
    dependencies.authenticate,
    ...(dependencies.createPaymentRateLimiter ? [dependencies.createPaymentRateLimiter] : []),
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const body = parseInput(createPaymentSchema, req.body);
      const result = await dependencies.paymentService.createPayment({
        userId: user.id,
        idempotencyKey: req.header("idempotency-key"),
        method: req.method,
        path: req.route.path,
        body
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }

      res.status(result.status).json(result.body);
    })
  );

  router.get(
    "/payments/:id",
    dependencies.authenticate,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const { id } = parseInput(paymentIdParamSchema, req.params);
      const payment = await dependencies.paymentService.getPayment(id, user.id);

      res.status(200).json({ payment });
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
