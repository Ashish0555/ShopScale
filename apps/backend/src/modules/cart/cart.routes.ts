import { Router, type RequestHandler } from "express";
import createHttpError from "http-errors";
import { z, ZodError } from "zod";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { getAuthenticatedUser } from "../auth/auth.middleware.js";
import { addCartItemSchema, itemIdParamSchema, updateCartItemSchema } from "./cart.schemas.js";
import type { CartService } from "./cart.service.js";

export type CartRouteDependencies = {
  authenticate: RequestHandler;
  cartService: CartService;
};

export function createCartRouter(dependencies: CartRouteDependencies): Router {
  const router = Router();

  router.get(
    "/cart",
    dependencies.authenticate,
    asyncHandler(async (_req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const cart = await dependencies.cartService.getCart(user.id);

      res.status(200).json({ cart });
    })
  );

  router.post(
    "/cart/items",
    dependencies.authenticate,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const input = parseInput(addCartItemSchema, req.body);
      const cart = await dependencies.cartService.addItem({
        userId: user.id,
        productId: input.productId,
        quantity: input.quantity
      });

      res.status(200).json({ cart });
    })
  );

  router.patch(
    "/cart/items/:itemId",
    dependencies.authenticate,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const { itemId } = parseInput(itemIdParamSchema, req.params);
      const input = parseInput(updateCartItemSchema, req.body);
      const cart = await dependencies.cartService.updateItemQuantity({
        userId: user.id,
        itemId,
        quantity: input.quantity
      });

      res.status(200).json({ cart });
    })
  );

  router.delete(
    "/cart/items/:itemId",
    dependencies.authenticate,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const { itemId } = parseInput(itemIdParamSchema, req.params);
      const cart = await dependencies.cartService.removeItem({ userId: user.id, itemId });

      res.status(200).json({ cart });
    })
  );

  router.delete(
    "/cart",
    dependencies.authenticate,
    asyncHandler(async (_req, res) => {
      const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const cart = await dependencies.cartService.clearCart(user.id);

      res.status(200).json({ cart });
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
