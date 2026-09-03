import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().min(1).default("/api"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().default("shopscale-backend"),
  KAFKA_GROUP_ID: z.string().default("shopscale-backend"),
  KAFKA_TOPIC_DOMAIN_EVENTS: z.string().default("shopscale.domain.events"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PRODUCT_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_ORDER_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_PAYMENT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60)
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = parsedEnv.error.flatten().fieldErrors;
  throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
}

export const env = {
  ...parsedEnv.data,
  corsOrigins: parsedEnv.data.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
  kafkaBrokers: parsedEnv.data.KAFKA_BROKERS.split(",").map((broker) => broker.trim())
};

export type AppEnv = typeof env;
