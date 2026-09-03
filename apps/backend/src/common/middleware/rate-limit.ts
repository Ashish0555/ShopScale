import type { Request, RequestHandler } from "express";
import createHttpError from "http-errors";
import type { CacheStore } from "../../infrastructure/redis/cache-store.js";
import { metrics } from "../../infrastructure/metrics/metrics.js";

export type RateLimitOptions = {
  cache: CacheStore;
  prefix: string;
  limit: number;
  windowSeconds: number;
  identity: (req: Request) => string;
};

export function createRateLimitMiddleware(options: RateLimitOptions): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      try {
        const identity = options.identity(req);
        const window = Math.floor(Date.now() / 1000 / options.windowSeconds);
        const key = `${options.prefix}:${identity}:${window}`;
        const count = await options.cache.incr(key);

        if (count === 1) {
          await options.cache.expire(key, options.windowSeconds);
        }

        if (count > options.limit) {
          metrics.increment("http.rate_limited");
          next(createHttpError(429, "Too many requests", {
            headers: {
              "Retry-After": String(options.windowSeconds)
            }
          }));
          return;
        }

        next();
      } catch (error: unknown) {
        next(error);
      }
    })();
  };
}
