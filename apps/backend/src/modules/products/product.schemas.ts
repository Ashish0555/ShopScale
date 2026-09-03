import { z } from "zod";
import type { CategoryListQuery, ProductListQuery } from "./product.types.js";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single hyphens");

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1)
  .max(64)
  .regex(/^[A-Z0-9_-]+$/, "Use uppercase letters, numbers, underscores, or hyphens");

const optionalTextSchema = z.string().trim().max(2000).optional().nullable();
const uuidSchema = z.string().uuid();

const booleanQuerySchema: z.ZodEffects<z.ZodOptional<z.ZodBoolean>, boolean | undefined, unknown> = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}, z.boolean().optional());

export const idParamSchema = z.object({
  id: uuidSchema
});

export const categoryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    isActive: booleanQuerySchema
  })
  .transform(
    (query): CategoryListQuery => ({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      isActive: query.isActive
    })
  );

export const productListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    categoryId: uuidSchema.optional(),
    isActive: booleanQuerySchema,
    sortBy: z.enum(["createdAt", "name", "priceCents"]).default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc")
  })
  .transform(
    (query): ProductListQuery => ({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      categoryId: query.categoryId,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection
    })
  );

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema.optional(),
  description: optionalTextSchema,
  isActive: z.boolean().optional()
});

export const updateCategorySchema = createCategorySchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided"
});

export const createProductSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1).max(160),
  slug: slugSchema.optional(),
  description: optionalTextSchema,
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().trim().toUpperCase().length(3).default("USD"),
  categoryId: uuidSchema.optional().nullable(),
  isActive: z.boolean().optional()
});

export const updateProductSchema = createProductSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided"
});
