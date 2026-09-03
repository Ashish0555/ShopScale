import type { Product } from "../products/product.types.js";

export type CartItem = {
  id: string;
  productId: string;
  quantity: number;
  product: Product;
  createdAt: Date;
  updatedAt: Date;
};

export type Cart = {
  id: string;
  userId: string;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
};

export type CartRepository = {
  getOrCreateCart(userId: string): Promise<Cart>;
  findCartByUserId(userId: string): Promise<Cart | null>;
  upsertItem(input: { userId: string; product: Product; quantity: number }): Promise<Cart>;
  updateItemQuantity(input: { userId: string; itemId: string; quantity: number }): Promise<Cart | null>;
  removeItem(input: { userId: string; itemId: string }): Promise<Cart | null>;
  clearCart(userId: string): Promise<Cart>;
};

export type InventoryRepository = {
  getAvailableQuantity(productId: string): Promise<number>;
};
