import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "../../common/config/env.js";
import type { JwtTokenService } from "../../modules/auth/token.service.js";
import type { AuthRepository } from "../../modules/auth/auth.types.js";
import type { OrderService } from "../../modules/orders/order.service.js";
import type { Order } from "../../modules/orders/order.types.js";
import { logger } from "../logging/logger.js";

export type OrderRealtime = {
  emitOrderUpdated(order: Order): void;
};

export function attachOrderRealtime(input: {
  httpServer: HttpServer;
  tokenService: JwtTokenService;
  authRepository: AuthRepository;
  orderService: OrderService;
}): { io: Server; realtime: OrderRealtime } {
  const io = new Server(input.httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true
    }
  });

  io.use((socket, next) => {
    void (async () => {
      try {
        const token = String(socket.handshake.auth.token ?? socket.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, "") ?? "");

        if (!token) {
          next(new Error("Authentication is required"));
          return;
        }

        const tokenUser = input.tokenService.verifyAccessToken(token);
        const storedUser = await input.authRepository.findUserById(tokenUser.id);

        if (!storedUser || !storedUser.isActive) {
          next(new Error("Invalid access token"));
          return;
        }

        socket.data.user = {
          id: storedUser.id,
          email: storedUser.email,
          role: storedUser.role
        };
        next();
      } catch {
        next(new Error("Invalid access token"));
      }
    })();
  });

  io.on("connection", (socket) => {
    const userId = String(socket.data.user.id);
    void socket.join(`user:${userId}`);

    void socket.on("order:subscribe", (orderId: unknown, callback?: (result: unknown) => void) => {
      void (async () => {
        try {
          if (typeof orderId !== "string") {
            callback?.({ ok: false, error: "Order id is required" });
            return;
          }

          const order = await input.orderService.getOrder(orderId, userId);
          await socket.join(`order:${order.id}`);
          callback?.({ ok: true, order });
        } catch {
          callback?.({ ok: false, error: "Order not found" });
        }
      })();
    });
  });

  return {
    io,
    realtime: {
      emitOrderUpdated(order: Order) {
        io.to(`order:${order.id}`).emit("order:updated", { order });
        io.to(`user:${order.userId}`).emit("order:updated", { order });
        logger.debug({ orderId: order.id, state: order.state }, "Emitted order update");
      }
    }
  };
}
