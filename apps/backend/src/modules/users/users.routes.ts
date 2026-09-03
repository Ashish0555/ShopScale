import { Router, type RequestHandler } from "express";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { authorize, getAuthenticatedUser } from "../auth/auth.middleware.js";
import type { AuthRepository } from "../auth/auth.types.js";

export type UsersRouteDependencies = {
  authenticate: RequestHandler;
  repository: AuthRepository;
};

export function createUsersRouter(dependencies: UsersRouteDependencies): Router {
  const router = Router();

  router.get(
    "/users/me",
    dependencies.authenticate,
    asyncHandler(async (_req, res) => {
      const currentUser = getAuthenticatedUser(res.locals as Record<string, unknown>);
      const user = await dependencies.repository.findUserById(currentUser.id);

      res.status(200).json({
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              createdAt: user.createdAt
            }
          : null
      });
    })
  );

  router.get(
    "/users",
    dependencies.authenticate,
    authorize("ADMIN"),
    asyncHandler(async (_req, res) => {
      const users = await dependencies.repository.listUsers();

      res.status(200).json({ users });
    })
  );

  return router;
}
