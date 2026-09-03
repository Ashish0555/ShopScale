import { Router, type RequestHandler } from "express";
import createHttpError from "http-errors";
import { z, ZodError } from "zod";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { authorize } from "../auth/auth.middleware.js";
import {
  categoryListQuerySchema,
  createCategorySchema,
  createProductSchema,
  idParamSchema,
  productListQuerySchema,
  updateCategorySchema,
  updateProductSchema
} from "./product.schemas.js";
import type { ProductService } from "./product.service.js";

export type ProductRouteDependencies = {
  authenticate: RequestHandler;
  productService: ProductService;
};

export function createProductRouter(dependencies: ProductRouteDependencies): Router {
  const router = Router();
  const adminOnly = [dependencies.authenticate, authorize("ADMIN")];

  router.get(
    "/categories",
    asyncHandler(async (req, res) => {
      const query = parseInput(categoryListQuerySchema, req.query);
      const result = await dependencies.productService.listCategories(query);

      res.status(200).json(result);
    })
  );

  router.get(
    "/categories/:id",
    asyncHandler(async (req, res) => {
      const { id } = parseInput(idParamSchema, req.params);
      const category = await dependencies.productService.getCategory(id);

      res.status(200).json({ category });
    })
  );

  router.post(
    "/categories",
    ...adminOnly,
    asyncHandler(async (req, res) => {
      const input = parseInput(createCategorySchema, req.body);
      const category = await dependencies.productService.createCategory(input);

      res.status(201).json({ category });
    })
  );

  router.patch(
    "/categories/:id",
    ...adminOnly,
    asyncHandler(async (req, res) => {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateCategorySchema, req.body);
      const category = await dependencies.productService.updateCategory(id, input);

      res.status(200).json({ category });
    })
  );

  router.delete(
    "/categories/:id",
    ...adminOnly,
    asyncHandler(async (req, res) => {
      const { id } = parseInput(idParamSchema, req.params);
      await dependencies.productService.deleteCategory(id);

      res.status(204).send();
    })
  );

  router.get(
    "/products",
    asyncHandler(async (req, res) => {
      const query = parseInput(productListQuerySchema, req.query);
      const result = await dependencies.productService.listProducts(query);

      res.status(200).json(result);
    })
  );

  router.get(
    "/products/:id",
    asyncHandler(async (req, res) => {
      const { id } = parseInput(idParamSchema, req.params);
      const product = await dependencies.productService.getProduct(id);

      res.status(200).json({ product });
    })
  );

  router.post(
    "/products",
    ...adminOnly,
    asyncHandler(async (req, res) => {
      const input = parseInput(createProductSchema, req.body);
      const product = await dependencies.productService.createProduct(input);

      res.status(201).json({ product });
    })
  );

  router.patch(
    "/products/:id",
    ...adminOnly,
    asyncHandler(async (req, res) => {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateProductSchema, req.body);
      const product = await dependencies.productService.updateProduct(id, input);

      res.status(200).json({ product });
    })
  );

  router.delete(
    "/products/:id",
    ...adminOnly,
    asyncHandler(async (req, res) => {
      const { id } = parseInput(idParamSchema, req.params);
      await dependencies.productService.deleteProduct(id);

      res.status(204).send();
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
