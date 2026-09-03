import { Router, type RequestHandler } from "express";
import createHttpError from "http-errors";
import { ZodError, type ZodSchema } from "zod";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from "./auth.schemas.js";
import type { AuthService } from "./auth.service.js";

export type AuthRouteDependencies = {
  authService: AuthService;
  loginRateLimiter?: RequestHandler;
};

export function createAuthRouter(dependencies: AuthRouteDependencies): Router {
  const router = Router();

  router.post(
    "/auth/register",
    asyncHandler(async (req, res) => {
      const input = parseBody(registerSchema, req.body);
      const response = await dependencies.authService.register(input);

      res.status(201).json(response);
    })
  );

  router.post(
    "/auth/login",
    ...(dependencies.loginRateLimiter ? [dependencies.loginRateLimiter] : []),
    asyncHandler(async (req, res) => {
      const input = parseBody(loginSchema, req.body);
      const response = await dependencies.authService.login(input);

      res.status(200).json(response);
    })
  );

  router.post(
    "/auth/refresh",
    asyncHandler(async (req, res) => {
      const input = parseBody(refreshSchema, req.body);
      const response = await dependencies.authService.refresh(input);

      res.status(200).json(response);
    })
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const input = parseBody(logoutSchema, req.body);
      await dependencies.authService.logout(input);

      res.status(204).send();
    })
  );

  return router;
}

function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      throw createHttpError(400, "Invalid request body", {
        details: error.flatten().fieldErrors
      });
    }

    throw error;
  }
}
