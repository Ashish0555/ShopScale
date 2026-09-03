export type ProductSortBy = "createdAt" | "name" | "priceCents";
export type SortDirection = "asc" | "desc";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductCategory = {
  id: string;
  name: string;
  slug: string;
};

export type Product = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
  categoryId: string | null;
  category: ProductCategory | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CategoryListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
};

export type ProductListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  sortBy: ProductSortBy;
  sortDirection: SortDirection;
};

export type CreateCategoryInput = {
  name: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
};

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export type CreateProductInput = {
  sku: string;
  name: string;
  slug?: string;
  description?: string | null;
  priceCents: number;
  currency?: string;
  categoryId?: string | null;
  isActive?: boolean;
};

export type UpdateProductInput = Partial<CreateProductInput>;

export type ProductRepository = {
  listCategories(query: CategoryListQuery): Promise<PaginatedResult<Category>>;
  findCategoryById(id: string): Promise<Category | null>;
  createCategory(input: Required<Omit<CreateCategoryInput, "description">> & {
    description: string | null;
  }): Promise<Category>;
  updateCategory(id: string, input: UpdateCategoryInput): Promise<Category | null>;
  deleteCategory(id: string): Promise<boolean>;
  listProducts(query: ProductListQuery): Promise<PaginatedResult<Product>>;
  findProductById(id: string): Promise<Product | null>;
  createProduct(input: Required<Omit<CreateProductInput, "description" | "categoryId">> & {
    description: string | null;
    categoryId: string | null;
  }): Promise<Product>;
  updateProduct(id: string, input: UpdateProductInput): Promise<Product | null>;
  deleteProduct(id: string): Promise<boolean>;
};
