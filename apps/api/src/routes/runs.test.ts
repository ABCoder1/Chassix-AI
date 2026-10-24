import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { ApiErrorSchema, BranchState } from "@chassix/shared";
import type {
  ExecutorAdapter,
  ExecutorPoll,
  ExecutorSubmission,
  RunManifest,
} from "@chassix/shared";
import { FakeExecutor } from "@chassix/executor";
import { buildServer } from "../server.js";
import { createInMemoryRepositories } from "../repositories/memory.js";
import { createRunOrchestrator, type RunOrchestratorBundle } from "../runs/service.js";
import { seedWorkspaceWithRoles } from "../testing/harness.js";

const TEST_SECRET = "test-secret-chassix-runs-abc123-abc123";

/** Counts submissions so a repeated idempotency key can be proven NOT to double-submit. */
class CountingExecutor implements ExecutorAdapter {
  readonly id = "counting";
  submitCount = 0;
  constructor(private readonly inner: ExecutorAdapter = new FakeExecutor()) {}
  async submit(m: RunManifest): Promise<ExecutorSubmission> {
    this.submitCount++;
    return this.inner.submit(m);
  }
  poll(ref: string): Promise<ExecutorPoll> {
    return this.inner.poll(ref);
  }
  cancel(ref: string): Promise<void> {
    return this.inner.cancel(ref);
  }
}

const buildApp = (bundle?: RunOrchestratorBundle): FastifyInstance =>
  buildServer({
    repos: createInMemoryRepositories(),
    sessionSecret: TEST_SECRET,
    ...(bundle ? { orchestrator: bundle } : {}),
  });

const launchBody = (idempotencyKey: string) => ({
  idempotencyKey,
  projectId: "proj-1",
  planId: "plan-1",
  branches: [
    {
      name: "assembly",
      inputs: [{ datasetVersionId: "dsv-1", checksum: "sha256:abc" }],
      parameters: { k: 1 },
      toolVersions: { spades: "3.15" },
      referenceVersions: {},
      command: "spades.py",
    },
  ],
});

let apps: FastifyInstance[] = [];
const track = (a: FastifyInstance): FastifyInstance => (apps.push(a), a);
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

describe("POST launch — idempotency + RBAC (Step 3.3)", () => {
  it("launches a run; a repeated idempotency key returns the SAME run with no second submission", async () => {
    const executor = new CountingExecutor();
    const bundle = createRunOrchestrator({ executor });
    const app = track(buildApp(bundle));
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);

    const first = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-1"),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().deduplicated).toBe(false);
    const runId = first.json().runId;
    expect(runId).toBeTruthy();
    expect(executor.submitCount).toBe(1);

    const second = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-1"),
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().deduplicated).toBe(true);
    expect(second.json().runId).toBe(runId);
    // Idempotent: no second submission to the engine.
    expect(executor.submitCount).toBe(1);
  });

  it("rejects an unauthenticated launch with a 401 ApiError", async () => {
    const app = track(buildApp());
    const { workspaceId } = await seedWorkspaceWithRoles(app);
    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      payload: launchBody("idem-unauth"),
    });
    expect(res.statusCode).toBe(401);
    expect(ApiErrorSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json().code).toBe("UNAUTHENTICATED");
  });

  it("forbids a role not permitted to launch (scientist) with a 403 ApiError", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.scientist },
      payload: launchBody("idem-forbidden"),
    });
    expect(res.statusCode).toBe(403);
    expect(ApiErrorSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json().code).toBe("FORBIDDEN");
  });

  it("validates the launch body (missing plan/branches → 400 ApiError)", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: { idempotencyKey: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION");
  });
});

describe("GET snapshot — authoritative state (Step 3.4)", () => {
  it("returns the run, branches and lastSequence after launch", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const launched = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-snap"),
    });
    const runId = launched.json().runId;

    const snap = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/${runId}`,
      headers: { cookie: cookies.scientist },
    });
    expect(snap.statusCode).toBe(200);
    const body = snap.json();
    expect(body.run.id).toBe(runId);
    expect(body.branches).toHaveLength(1);
    expect(body.branches[0].state).toBe(BranchState.Queued);
    expect(body.lastSequence).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown run id", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/does-not-exist`,
      headers: { cookie: cookies.scientist },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("RUN_NOT_FOUND");
  });
});

describe("POST cancel — audited terminal, RBAC-guarded (Step 3.6)", () => {
  it("transitions the branch to Cancelled (not Failed) and records it", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const launched = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-cancel"),
    });
    const runId = launched.json().runId;

    const cancel = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs/${runId}/cancel`,
      headers: { cookie: cookies.computational_biologist },
      payload: {},
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().cancelledBranchIds).toHaveLength(1);

    const snap = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/${runId}`,
      headers: { cookie: cookies.computational_biologist },
    });
    expect(snap.json().branches[0].state).toBe(BranchState.Cancelled);
    expect(snap.json().branches[0].state).not.toBe(BranchState.Failed);
  });

  it("forbids cancel for a role without run.retry_cancel (scientist → 403)", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const launched = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-cancel-rbac"),
    });
    const runId = launched.json().runId;
    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs/${runId}/cancel`,
      headers: { cookie: cookies.scientist },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
  });
});

describe("GET logs — per-attempt projection (Step 3.6)", () => {
  it("returns attempt records with their status events", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const launched = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-logs"),
    });
    const runId = launched.json().runId;
    const branchId = (
      await app.inject({
        method: "GET",
        url: `/workspaces/${workspaceId}/runs/${runId}`,
        headers: { cookie: cookies.scientist },
      })
    ).json().branches[0].id;

    const logs = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/${runId}/branches/${branchId}/logs`,
      headers: { cookie: cookies.scientist },
    });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().attempts).toHaveLength(1);
    expect(logs.json().attempts[0].attemptNumber).toBe(1);
    expect(logs.json().attempts[0].events.length).toBeGreaterThan(0);
  });
});

describe("GET events (SSE) — headers, replay, disconnect ≠ cancel (Step 3.4)", () => {
  it("streams text/event-stream, replays from the cursor, and a disconnect does not cancel the run", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const launched = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-sse"),
    });
    const runId = launched.json().runId;

    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const controller = new AbortController();
    const res = await fetch(`${address}/workspaces/${workspaceId}/runs/${runId}/events`, {
      headers: { cookie: cookies.scientist, "last-event-id": "0" },
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    // Replay carries the launch's Queued event with id: = sequence.
    expect(chunk).toContain("id: 1");
    expect(chunk).toContain("branch-status");

    controller.abort();
    await new Promise((r) => setTimeout(r, 50)); // let the server's close handler run

    // Client disconnect must NOT cancel the run.
    const snap = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/${runId}`,
      headers: { cookie: cookies.scientist },
    });
    expect(snap.json().branches[0].state).toBe(BranchState.Queued);
  });

  it("returns the right content-type via a replay that honours a non-zero cursor", async () => {
    const app = track(buildApp());
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const launched = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/runs`,
      headers: { cookie: cookies.computational_biologist },
      payload: launchBody("idem-sse2"),
    });
    const runId = launched.json().runId;

    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const controller = new AbortController();
    const res = await fetch(`${address}/workspaces/${workspaceId}/runs/${runId}/events?cursor=99`, {
      headers: { cookie: cookies.scientist },
      signal: controller.signal,
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    controller.abort();
  });
});
