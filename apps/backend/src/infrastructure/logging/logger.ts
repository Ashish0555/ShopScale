import pino from "pino";
import { env } from "../../common/config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET"
    ],
    censor: "[redacted]"
  },
  base: {
    service: "shopscale-backend",
    environment: env.NODE_ENV
  }
});
