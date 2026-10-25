import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { GoalVersionDraftSchema } from "@chassix/shared";
import { FakePlanner } from "@chassix/planner";
import { buildServer } from "../server.js";
import { createInMemoryRepositories } from "../repositories/memory.js";

const SECRET = "test-secret-chassix-goals-abc123-abc123";

let apps: FastifyInstance[] = [];
const track = (a: FastifyInstance): FastifyInstance => (apps.push(a), a);
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

const buildApp = (): FastifyInstance =>
  track(
    buildServer({
      repos: createInMemoryRepositories(),
      sessionSecret: SECRET,
      planner: new FakePlanner(),
    }),
  );

describe("POST /goals/interpret (Step 1.6)", () => {
  it("returns a schema-valid draft for a prompt (no auth required — it is the landing step)", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/goals/interpret",
      payload: { prompt: "A more thermotolerant microbial host for an industrial enzyme." },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.originalPrompt).toContain("thermotolerant");
    expect(() => GoalVersionDraftSchema.parse(body.draft)).not.toThrow();
    // Injected (fake) planner ⇒ illustrative.
    expect(body.illustrative).toBe(true);
    expect(body.provider).toBe("fake");
  });

  it("rejects an empty prompt with 400", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/goals/interpret",
      payload: { prompt: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION");
  });

  it("rejects an over-long prompt with 400", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/goals/interpret",
      payload: { prompt: "x".repeat(4001) },
    });
    expect(res.statusCode).toBe(400);
  });
});
