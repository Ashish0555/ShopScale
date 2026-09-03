import { z } from "zod";

export const itemIdParamSchema = z.object({
  itemId: z.string().uuid()
});

export const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100)
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(100)
});
