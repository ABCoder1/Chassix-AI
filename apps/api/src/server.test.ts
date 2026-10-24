import { describe, it, expect, afterAll } from "vitest";
import { ApiErrorSchema } from "@bioforge/shared";
import { buildServer } from "./server.js";

const app = buildServer();

afterAll(async () => {
  await app.close();
});

describe("API server", () => {
  it("responds ok on /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("returns a shared ApiError envelope with a correlation id for unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.code).toBe("NOT_FOUND");
    expect(body.correlationId).toBeTruthy();
  });
});
