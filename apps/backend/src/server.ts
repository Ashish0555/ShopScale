import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./common/config/env.js";
import { prisma } from "./infrastructure/database/prisma.js";
import { logger } from "./infrastructure/logging/logger.js";
import { DomainEventConsumer } from "./infrastructure/events/event-consumer.js";
import { PrismaProcessedEventStore } from "./infrastructure/events/processed-event-store.js";
import { KafkaRuntime } from "./infrastructure/kafka/kafka-runtime.js";
import { publishUnpublishedOutboxEvents } from "./infrastructure/kafka/outbox.js";
import { attachOrderRealtime } from "./infrastructure/websocket/order-realtime.js";
import type { Order } from "./modules/orders/order.types.js";

const app = createApp();
const server = createServer(app);
const realtime = attachOrderRealtime({
  httpServer: server,
  tokenService: app.locals.tokenService,
  authRepository: app.locals.authRepository,
  orderService: app.locals.orderService
});
app.locals.orderService.setOrderUpdatedHandler((order: Order) => realtime.realtime.emitOrderUpdated(order));
let kafkaRuntime: KafkaRuntime | null = null;
let outboxTimer: NodeJS.Timeout | null = null;

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "ShopScale backend listening");
  void startMessaging();
});

async function startMessaging(): Promise<void> {
  try {
    kafkaRuntime = new KafkaRuntime();
    const consumer = new DomainEventConsumer(new PrismaProcessedEventStore(prisma), [async (event) => {
      logger.info({ eventId: event.id, type: event.type, aggregateId: event.aggregateId }, "Domain event consumed");
    }]);
    const publisher = await kafkaRuntime.start(consumer);
    await publishUnpublishedOutboxEvents(prisma, publisher);
    outboxTimer = setInterval(() => {
      void publishUnpublishedOutboxEvents(prisma, publisher).catch((error: unknown) => {
        logger.error({ err: error }, "Outbox publication failed");
      });
    }, 5000);
    outboxTimer.unref();
  } catch (error: unknown) {
    logger.error({ err: error }, "Kafka startup failed; HTTP server remains available");
    await kafkaRuntime?.stop().catch((stopError: unknown) => {
      logger.error({ err: stopError }, "Kafka cleanup after startup failure failed");
    });
    kafkaRuntime = null;
  }
}

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down backend");

  try {
    await closeHttpServer();
    if (outboxTimer) {
      clearInterval(outboxTimer);
    }
    await kafkaRuntime?.stop();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error: unknown) {
    logger.error({ err: error }, "Error while shutting down backend");
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
