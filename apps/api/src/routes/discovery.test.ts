import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { createInMemoryRepositories } from "../repositories/memory.js";

const SECRET = "test-secret-chassix-discovery-abc123-abc";

let apps: FastifyInstance[] = [];
const track = (a: FastifyInstance): FastifyInstance => (apps.push(a), a);
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

const buildApp = (): FastifyInstance =>
  track(buildServer({ repos: createInMemoryRepositories(), sessionSecret: SECRET }));

describe("POST /discovery (Step 2.3 RAG: survey → hosts + datasets)", () => {
  it("surveys the literature and returns ranked candidate hosts with citations + datasets", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/discovery",
      payload: { query: "thermotolerant microbial host for industrial enzyme" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.isEmpty).toBe(false);
    expect(Array.isArray(body.hosts)).toBe(true);
    expect(body.hosts.length).toBeGreaterThan(0);
    const top = body.hosts[0];
    expect(typeof top.host).toBe("string");
    expect(top.isSuitabilityEstimate).toBe(true); // advisory, not a success probability
    expect(top.citations.length).toBeGreaterThan(0);
    expect(typeof top.citations[0].passage).toBe("string");
    // Fixture retriever ⇒ illustrative.
    expect(body.illustrative).toBe(true);
    // Candidate datasets are offered for selection.
    expect(Array.isArray(body.datasets.records)).toBe(true);
  });

  it("returns an explicit empty discovery for a query with no evidence (no fabrication)", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/discovery",
      payload: { query: "zzzq nonexistent organism xyzzy" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isEmpty).toBe(true);
    expect(res.json().hosts).toHaveLength(0);
  });

  it("rejects a request with neither query nor prompt (400)", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/discovery", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION");
  });
});
