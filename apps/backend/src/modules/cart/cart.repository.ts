import { Prisma, type PrismaClient } from "@prisma/client";
import type { Cart, CartRepository } from "./cart.types.js";
import type { Product } from "../products/product.types.js";

type CartModel = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        product: {
          include: {
            category: true;
          };
        };
      };
    };
  };
}>;

export class PrismaCartRepository implements CartRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateCart(userId: string): Promise<Cart> {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: cartInclude
    });

    return mapCart(cart);
  }

  async findCartByUserId(userId: string): Promise<Cart | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: cartInclude
    });

    return cart ? mapCart(cart) : null;
  }

  async upsertItem(input: { userId: string; product: Product; quantity: number }): Promise<Cart> {
    return this.prisma.$transaction(async (transaction) => {
      const cart = await transaction.cart.upsert({
        where: { userId: input.userId },
        update: {},
        create: { userId: input.userId }
      });

      await transaction.cartItem.upsert({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: input.product.id
          }
        },
        update: {
          quantity: input.quantity
        },
        create: {
          cartId: cart.id,
          productId: input.product.id,
          quantity: input.quantity
        }
      });

      return mapCart(
        await transaction.cart.findUniqueOrThrow({
          where: { id: cart.id },
          include: cartInclude
        })
      );
    });
  }

  async updateItemQuantity(input: { userId: string; itemId: string; quantity: number }): Promise<Cart | null> {
    const cart = await this.findCartByUserId(input.userId);
    const item = cart?.items.find((candidate) => candidate.id === input.itemId);

    if (!cart || !item) {
      return null;
    }

    await this.prisma.cartItem.update({
      where: { id: input.itemId },
      data: { quantity: input.quantity }
    });

    return this.getOrCreateCart(input.userId);
  }

  async removeItem(input: { userId: string; itemId: string }): Promise<Cart | null> {
    const cart = await this.findCartByUserId(input.userId);
    const item = cart?.items.find((candidate) => candidate.id === input.itemId);

    if (!cart || !item) {
      return null;
    }

    await this.prisma.cartItem.delete({
      where: { id: input.itemId }
    });

    return this.getOrCreateCart(input.userId);
  }

  async clearCart(userId: string): Promise<Cart> {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId }
    });

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id }
    });

    return this.getOrCreateCart(userId);
  }
}

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          category: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.CartInclude;

function mapCart(cart: CartModel): Cart {
  return {
    id: cart.id,
    userId: cart.userId,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
    items: cart.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      product: {
        id: item.product.id,
        sku: item.product.sku,
        slug: item.product.slug,
        name: item.product.name,
        description: item.product.description,
        priceCents: item.product.priceCents,
        currency: item.product.currency,
        isActive: item.product.isActive,
        categoryId: item.product.categoryId,
        category: item.product.category
          ? {
              id: item.product.category.id,
              name: item.product.category.name,
              slug: item.product.category.slug
            }
          : null,
        createdAt: item.product.createdAt,
        updatedAt: item.product.updatedAt
      }
    }))
  };
}
