import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { createInMemoryRepositories } from "../repositories/memory.js";
import { seedWorkspaceWithRoles } from "../testing/harness.js";

const SECRET = "test-secret-chassix-metrics-abc123-abc";

let apps: FastifyInstance[] = [];
const track = (a: FastifyInstance): FastifyInstance => (apps.push(a), a);
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

const launch = (idempotencyKey: string) => ({
  idempotencyKey,
  projectId: "proj-1",
  planId: "plan-1",
  branches: [
    {
      name: "flux",
      inputs: [{ datasetVersionId: "dsv-1", checksum: "sha256:abc" }],
      parameters: {},
      toolVersions: { cobrapy: "0.29.0" },
      referenceVersions: {},
      command: "fba.py",
    },
  ],
});

describe("GET run metrics (run_event analytics)", () => {
  it("summarizes the run's event log", async () => {
    const app = track(buildServer({ repos: createInMemoryRepositories(), sessionSecret: SECRET }));
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const launched = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launch("idem-metrics"),
    });
    const runId = launched.json().runId;

    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/${runId}/metrics`,
      headers: { cookie: cookies.scientist },
    });
    expect(res.statusCode).toBe(200);
    const m = res.json();
    expect(m.runId).toBe(runId);
    expect(m.totalEvents).toBeGreaterThan(0);
    expect(m.branchCount).toBeGreaterThanOrEqual(1);
    expect(m.anomalousEvents).toBe(0); // the log is monotonic
    expect(typeof m.outcome).toBe("string");
  });

  it("returns 404 for an unknown run", async () => {
    const app = track(buildServer({ repos: createInMemoryRepositories(), sessionSecret: SECRET }));
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/nope/metrics`,
      headers: { cookie: cookies.scientist },
    });
    expect(res.statusCode).toBe(404);
  });
});
