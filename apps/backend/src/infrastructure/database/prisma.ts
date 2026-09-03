import { PrismaClient } from "@prisma/client";
import { logger } from "../logging/logger.js";

export const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" }
  ]
});

prisma.$on("error", (event) => {
  logger.error({ target: event.target, message: event.message }, "Prisma error");
});

prisma.$on("warn", (event) => {
  logger.warn({ target: event.target, message: event.message }, "Prisma warning");
});
