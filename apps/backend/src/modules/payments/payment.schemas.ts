import { z } from "zod";

export const paymentIdParamSchema = z.object({
  id: z.string().uuid()
});

export const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  simulateFailure: z.boolean().optional()
});
