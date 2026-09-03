import request from "supertest";
import { createApp } from "../src/app.js";

describe("health routes", () => {
  it("returns liveness state", async () => {
    const app = createApp({ readinessCheck: async () => true });

    const response = await request(app).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  it("returns readiness state when dependencies are available", async () => {
    const app = createApp({ readinessCheck: async () => true });

    const response = await request(app).get("/ready").expect(200);

    expect(response.body).toMatchObject({
      status: "ready",
      checks: {
        database: "ok"
      }
    });
  });

  it("returns a consistent error response for missing routes", async () => {
    const app = createApp({ readinessCheck: async () => true });

    const response = await request(app).get("/missing").expect(404);

    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND"
    });
    expect(response.body.error.requestId).toBeDefined();
  });
});
