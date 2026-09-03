import { Router, type RequestHandler } from "express";
import createHttpError from "http-errors";
import { z, ZodError } from "zod";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { authorize, getAuthenticatedUser } from "../auth/auth.middleware.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { AdminRepository } from "./admin.repository.js";
import type { OrderService } from "../orders/order.service.js";

export type AdminRouteDependencies = {
  authenticate: RequestHandler;
  adminRepository: AdminRepository;
  orderService: OrderService;
  auditRepository: AuditRepository;
};

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});
const orderIdSchema = z.object({ id: z.string().uuid() });
const statusSchema = z.object({ state: z.enum(["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED"]) });

export function createAdminRouter(dependencies: AdminRouteDependencies): Router {
  const router = Router();
  const adminOnly = [dependencies.authenticate, authorize("ADMIN")];

  router.get("/admin/orders", ...adminOnly, asyncHandler(async (req, res) => {
    res.status(200).json(await dependencies.adminRepository.listOrders(parse(paginationSchema, req.query)));
  }));

  router.patch("/admin/orders/:id/status", ...adminOnly, asyncHandler(async (req, res) => {
    const user = getAuthenticatedUser(res.locals as Record<string, unknown>);
    const { id } = parse(orderIdSchema, req.params);
    const { state } = parse(statusSchema, req.body);
    const order = await dependencies.orderService.transitionOrder(id, state);
    await dependencies.auditRepository.write({
      actorUserId: user.id,
      action: "ORDER_STATUS_CHANGED",
      entityType: "order",
      entityId: order.id,
      metadata: { state }
    });
    res.status(200).json({ order });
  }));

  router.get("/admin/inventory", ...adminOnly, asyncHandler(async (_req, res) => {
    res.status(200).json({ items: await dependencies.adminRepository.listInventory() });
  }));

  router.get("/admin/audit", ...adminOnly, asyncHandler(async (req, res) => {
    res.status(200).json(await dependencies.auditRepository.list(parse(paginationSchema, req.query)));
  }));

  return router;
}

function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, input: unknown): z.output<TSchema> {
  try {
    return schema.parse(input);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      throw createHttpError(400, "Invalid request", { details: error.flatten().fieldErrors });
    }
    throw error;
  }
}
