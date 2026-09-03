import createHttpError from "http-errors";
import type { ProductRepository } from "../products/product.types.js";
import type { Cart, CartRepository, InventoryRepository } from "./cart.types.js";

export type CartServiceDependencies = {
  cartRepository: CartRepository;
  productRepository: ProductRepository;
  inventoryRepository: InventoryRepository;
};

export class CartService {
  constructor(private readonly dependencies: CartServiceDependencies) {}

  getCart(userId: string): Promise<Cart> {
    return this.dependencies.cartRepository.getOrCreateCart(userId);
  }

  async addItem(input: { userId: string; productId: string; quantity: number }): Promise<Cart> {
    const product = await this.dependencies.productRepository.findProductById(input.productId);

    if (!product) {
      throw createHttpError(404, "Product not found");
    }

    if (!product.isActive) {
      throw createHttpError(400, "Product is not active");
    }

    await this.assertStockAvailable(input.productId, input.quantity);

    return this.dependencies.cartRepository.upsertItem({
      userId: input.userId,
      product,
      quantity: input.quantity
    });
  }

  async updateItemQuantity(input: { userId: string; itemId: string; quantity: number }): Promise<Cart> {
    const cart = await this.dependencies.cartRepository.findCartByUserId(input.userId);
    const item = cart?.items.find((candidate) => candidate.id === input.itemId);

    if (!cart || !item) {
      throw createHttpError(404, "Cart item not found");
    }

    if (!item.product.isActive) {
      throw createHttpError(400, "Product is not active");
    }

    await this.assertStockAvailable(item.productId, input.quantity);

    const updated = await this.dependencies.cartRepository.updateItemQuantity(input);

    if (!updated) {
      throw createHttpError(404, "Cart item not found");
    }

    return updated;
  }

  async removeItem(input: { userId: string; itemId: string }): Promise<Cart> {
    const cart = await this.dependencies.cartRepository.removeItem(input);

    if (!cart) {
      throw createHttpError(404, "Cart item not found");
    }

    return cart;
  }

  clearCart(userId: string): Promise<Cart> {
    return this.dependencies.cartRepository.clearCart(userId);
  }

  private async assertStockAvailable(productId: string, quantity: number): Promise<void> {
    const availableQuantity = await this.dependencies.inventoryRepository.getAvailableQuantity(productId);

    if (availableQuantity < quantity) {
      throw createHttpError(409, "Insufficient stock");
    }
  }
}
