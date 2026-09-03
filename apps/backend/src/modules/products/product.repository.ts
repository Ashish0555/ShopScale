import { Prisma, type PrismaClient } from "@prisma/client";
import createHttpError from "http-errors";
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
} from "./product.types.js";

type CategoryModel = Prisma.CategoryGetPayload<Record<string, never>>;
type ProductModel = Prisma.ProductGetPayload<{ include: { category: true } }>;

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listCategories(query: CategoryListQuery): Promise<PaginatedResult<Category>> {
    const where: Prisma.CategoryWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.category.count({ where })
    ]);

    return paginate(items.map(mapCategory), total, query.page, query.pageSize);
  }

  async findCategoryById(id: string): Promise<Category | null> {
    const category = await this.prisma.category.findUnique({
      where: { id }
    });

    return category ? mapCategory(category) : null;
  }

  async createCategory(
    input: Required<Omit<CreateCategoryInput, "description">> & { description: string | null }
  ): Promise<Category> {
    try {
      const category = await this.prisma.category.create({
        data: input
      });

      return mapCategory(category);
    } catch (error: unknown) {
      throwUniqueConflict(error, "A category with this slug already exists");
    }
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category | null> {
    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: input
      });

      return mapCategory(category);
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return null;
      }

      throwUniqueConflict(error, "A category with this slug already exists");
    }
  }

  async deleteCategory(id: string): Promise<boolean> {
    try {
      await this.prisma.category.delete({
        where: { id }
      });

      return true;
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  async listProducts(query: ProductListQuery): Promise<PaginatedResult<Product>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: {
          category: true
        },
        orderBy: productOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.product.count({ where })
    ]);

    return paginate(items.map(mapProduct), total, query.page, query.pageSize);
  }

  async findProductById(id: string): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true
      }
    });

    return product ? mapProduct(product) : null;
  }

  async createProduct(
    input: Required<Omit<CreateProductInput, "description" | "categoryId">> & {
      description: string | null;
      categoryId: string | null;
    }
  ): Promise<Product> {
    try {
      const product = await this.prisma.product.create({
        data: input,
        include: {
          category: true
        }
      });

      return mapProduct(product);
    } catch (error: unknown) {
      throwUniqueConflict(error, "A product with this SKU or slug already exists");
    }
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product | null> {
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: input,
        include: {
          category: true
        }
      });

      return mapProduct(product);
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return null;
      }

      throwUniqueConflict(error, "A product with this SKU or slug already exists");
    }
  }

  async deleteProduct(id: string): Promise<boolean> {
    try {
      await this.prisma.product.delete({
        where: { id }
      });

      return true;
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }
}

function productOrderBy(query: ProductListQuery): Prisma.ProductOrderByWithRelationInput {
  switch (query.sortBy) {
    case "name":
      return { name: query.sortDirection };
    case "priceCents":
      return { priceCents: query.sortDirection };
    case "createdAt":
      return { createdAt: query.sortDirection };
  }
}

function paginate<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize)
  };
}

function mapCategory(category: CategoryModel): Category {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  };
}

function mapProduct(product: ProductModel): Product {
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    currency: product.currency,
    isActive: product.isActive,
    categoryId: product.categoryId,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug
        }
      : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function throwUniqueConflict(error: unknown, message: string): never {
  if (isUniqueConstraintError(error)) {
    throw createHttpError(409, message);
  }

  throw error;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
