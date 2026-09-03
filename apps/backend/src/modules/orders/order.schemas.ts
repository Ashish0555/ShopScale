import { z } from "zod";

export const orderIdParamSchema = z.object({
  id: z.string().uuid()
});

export const orderListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  })
  .transform((query) => ({
    page: query.page,
    pageSize: query.pageSize
  }));
