import express, { type RequestHandler } from "express";
import request from "supertest";
import { createAdminRouter } from "../src/modules/admin/admin.routes.js";
import type { AdminRepository } from "../src/modules/admin/admin.repository.js";
import type { AuditRepository } from "../src/modules/audit/audit.repository.js";
import type { OrderService } from "../src/modules/orders/order.service.js";
import type { Order } from "../src/modules/orders/order.types.js";

const order: Order = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  state: "PLACED",
  totalCents: 1200,
  currency: "USD",
  items: [],
  reservations: [],
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

function createTestApp(role: "ADMIN" | "CUSTOMER") {
  const authenticate: RequestHandler = (_req, res, next) => {
    res.locals.authUser = { id: "33333333-3333-4333-8333-333333333333", email: "admin@example.com", role };
    next();
  };
  const listOrders = async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  const listInventory = async () => [];
  const auditWriteCalls: unknown[] = [];
  const auditWrite = async (input: unknown) => { auditWriteCalls.push(input); return {} as never; };
  const transitionCalls: unknown[][] = [];
  const transitionOrder = async (...input: unknown[]) => { transitionCalls.push(input); return { ...order, state: "CONFIRMED" } as Order; };
  const adminRepository = { listOrders, listInventory } as unknown as AdminRepository;
  const auditRepository = { write: auditWrite, list: async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }) } as unknown as AuditRepository;
  const orderService = { transitionOrder } as unknown as OrderService;
  const app = express();
  app.use(express.json());
  app.use(createAdminRouter({ authenticate, adminRepository, orderService, auditRepository }));
  return { app, auditWriteCalls, transitionCalls };
}

describe("admin routes", () => {
  it("requires admin role and audits status changes", async () => {
    const customerApp = createTestApp("CUSTOMER");
    await request(customerApp.app).patch(`/admin/orders/${order.id}/status`).send({ state: "CONFIRMED" }).expect(403);

    const adminApp = createTestApp("ADMIN");
    await request(adminApp.app).patch(`/admin/orders/${order.id}/status`).send({ state: "CONFIRMED" }).expect(200);
    expect(adminApp.transitionCalls).toEqual([[order.id, "CONFIRMED"]]);
    expect(adminApp.auditWriteCalls[0]).toMatchObject({ action: "ORDER_STATUS_CHANGED", entityId: order.id });
  });
});
