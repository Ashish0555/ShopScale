import createHttpError from "http-errors";
import type { CacheStore } from "../../infrastructure/redis/cache-store.js";
import { slugify } from "./slug.js";
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

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly cache?: { store: CacheStore; ttlSeconds: number }
  ) {}

  listCategories(query: CategoryListQuery): Promise<PaginatedResult<Category>> {
    return this.repository.listCategories(query);
  }

  async getCategory(id: string): Promise<Category> {
    const category = await this.repository.findCategoryById(id);

    if (!category) {
      throw createHttpError(404, "Category not found");
    }

    return category;
  }

  createCategory(input: CreateCategoryInput): Promise<Category> {
    return this.repository.createCategory({
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description ?? null,
      isActive: input.isActive ?? true
    });
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const category = await this.repository.updateCategory(id, {
      ...input,
      ...(input.name && !input.slug ? { slug: slugify(input.name) } : {})
    });

    if (!category) {
      throw createHttpError(404, "Category not found");
    }

    return category;
  }

  async deleteCategory(id: string): Promise<void> {
    const deleted = await this.repository.deleteCategory(id);

    if (!deleted) {
      throw createHttpError(404, "Category not found");
    }
  }

  listProducts(query: ProductListQuery): Promise<PaginatedResult<Product>> {
    return this.repository.listProducts(query);
  }

  async getProduct(id: string): Promise<Product> {
    const cacheKey = this.productCacheKey(id);
    const cached = await this.cache?.store.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as Product;
    }

    const product = await this.repository.findProductById(id);

    if (!product) {
      throw createHttpError(404, "Product not found");
    }

    await this.cache?.store.set(cacheKey, JSON.stringify(product), this.cache.ttlSeconds);
    return product;
  }

  async createProduct(input: CreateProductInput): Promise<Product> {
    await this.assertCategoryExists(input.categoryId);

    return this.repository.createProduct({
      sku: input.sku,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description ?? null,
      priceCents: input.priceCents,
      currency: input.currency ?? "USD",
      categoryId: input.categoryId ?? null,
      isActive: input.isActive ?? true
    });
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    await this.assertCategoryExists(input.categoryId);

    const product = await this.repository.updateProduct(id, {
      ...input,
      ...(input.name && !input.slug ? { slug: slugify(input.name) } : {})
    });

    if (!product) {
      throw createHttpError(404, "Product not found");
    }

    await this.cache?.store.del(this.productCacheKey(id));
    return product;
  }

  async deleteProduct(id: string): Promise<void> {
    const deleted = await this.repository.deleteProduct(id);

    if (!deleted) {
      throw createHttpError(404, "Product not found");
    }

    await this.cache?.store.del(this.productCacheKey(id));
  }

  private async assertCategoryExists(categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) {
      return;
    }

    const category = await this.repository.findCategoryById(categoryId);

    if (!category) {
      throw createHttpError(400, "Category does not exist");
    }
  }

  private productCacheKey(id: string): string {
    return `product:${id}`;
  }
}
