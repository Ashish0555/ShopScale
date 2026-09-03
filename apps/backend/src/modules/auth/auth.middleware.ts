import type { RequestHandler } from "express";
import createHttpError from "http-errors";
import type { AuthRepository, AuthenticatedUser, UserRole } from "./auth.types.js";
import type { JwtTokenService } from "./token.service.js";

export type AuthMiddlewareDependencies = {
  repository: AuthRepository;
  tokenService: JwtTokenService;
};

export function getAuthenticatedUser(resLocals: Record<string, unknown>): AuthenticatedUser {
  const user = resLocals.authUser;

  if (!isAuthenticatedUser(user)) {
    throw createHttpError(401, "Authentication is required");
  }

  return user;
}

export function createAuthenticationMiddleware(dependencies: AuthMiddlewareDependencies): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      try {
        const authorization = req.header("authorization");

        if (!authorization?.startsWith("Bearer ")) {
          throw createHttpError(401, "Bearer access token is required");
        }

        const token = authorization.slice("Bearer ".length).trim();
        const tokenUser = dependencies.tokenService.verifyAccessToken(token);
        const storedUser = await dependencies.repository.findUserById(tokenUser.id);

        if (!storedUser || !storedUser.isActive) {
          throw createHttpError(401, "Invalid access token");
        }

        res.locals.authUser = {
          id: storedUser.id,
          email: storedUser.email,
          role: storedUser.role
        } satisfies AuthenticatedUser;
        next();
      } catch {
        next(createHttpError(401, "Invalid access token"));
      }
    })();
  };
}

export function authorize(...allowedRoles: UserRole[]): RequestHandler {
  return (_req, res, next) => {
    const user = getAuthenticatedUser(res.locals as Record<string, unknown>);

    if (!allowedRoles.includes(user.role)) {
      next(createHttpError(403, "Insufficient permissions"));
      return;
    }

    next();
  };
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuthenticatedUser>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    (candidate.role === "CUSTOMER" || candidate.role === "ADMIN")
  );
}
