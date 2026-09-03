import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler.js";

export type HealthRouteDependencies = {
  readinessCheck: () => Promise<boolean>;
};

export function createHealthRouter(dependencies: HealthRouteDependencies): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "shopscale-backend",
      timestamp: new Date().toISOString()
    });
  });

  router.get(
    "/ready",
    asyncHandler(async (_req, res) => {
      await dependencies.readinessCheck();

      res.status(200).json({
        status: "ready",
        checks: {
          database: "ok"
        },
        timestamp: new Date().toISOString()
      });
    })
  );

  return router;
}
