import { Redis } from "ioredis";
import { logger } from "../logging/logger.js";
import type { CacheStore } from "./cache-store.js";

export class RedisCacheStore implements CacheStore {
  private readonly redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true
    });
    this.redis.on("error", (error) => {
      logger.warn({ err: error }, "Redis connection error");
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      await this.ensureConnected();
      return await this.redis.get(key);
    } catch (error: unknown) {
      logger.warn({ err: error, key }, "Redis GET failed");
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.ensureConnected();
      await this.redis.set(key, value, "EX", ttlSeconds);
    } catch (error: unknown) {
      logger.warn({ err: error, key }, "Redis SET failed");
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.redis.del(key);
    } catch (error: unknown) {
      logger.warn({ err: error, key }, "Redis DEL failed");
    }
  }

  async incr(key: string): Promise<number> {
    await this.ensureConnected();
    return this.redis.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.ensureConnected();
    await this.redis.expire(key, ttlSeconds);
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureConnected();
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
  }
}
