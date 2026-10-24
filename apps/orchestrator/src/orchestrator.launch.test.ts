import { describe, it, expect } from "vitest";
import { RunOrchestrator } from "./orchestrator.js";
import {
  InMemoryStore,
  InMemoryRunRepository,
  InMemoryEventLogRepository,
} from "./repository/in-memory.js";
import { InMemoryEventTransport } from "./transport/in-memory.js";
import { FixtureOutputValidator } from "./validation.js";
import { FakeExecutor } from "./testing/fake-executor.js";
import { BranchState } from "@chassix/shared";
import { makeHarness, launchRequest, DEFAULT_SCHEMA } from "./testing/harness.js";

describe("launch idempotency + persistence-before-ack (Step 3.3)", () => {
  it("a retried/double launch with the same key returns the SAME run id and submits once", async () => {
    const { orch, executor } = makeHarness();
    const req = launchRequest({ idempotencyKey: "fixed-key" });

    const first = await orch.launch(req);
    const second = await orch.launch(req);

    expect(second.runId).toBe(first.runId);
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    // Exactly one executor submission for the one branch, despite two launch calls.
    expect(executor.submissions).toHaveLength(1);
  });

  it("persists run + branch state BEFORE the executor submission is acknowledged", async () => {
    const store = new InMemoryStore();
    const repo = new InMemoryRunRepository(store);
    const eventLog = new InMemoryEventLogRepository(store);
    const transport = new InMemoryEventTransport();

    const observed: { runFound: boolean; branchQueued: boolean }[] = [];
    // The hook runs DURING submit(): the run and its queued branch must already be durable.
    const executor = new FakeExecutor(async (manifest) => {
      const run = await repo.getRun(manifest.runId as never);
      const branch = await repo.getBranch(manifest.branchId as never);
      observed.push({
        runFound: run !== null,
        branchQueued: branch?.state === BranchState.Queued,
      });
    });
    const orch = new RunOrchestrator({
      repo,
      eventLog,
      executor,
      transport,
      validator: new FixtureOutputValidator(DEFAULT_SCHEMA),
    });

    await orch.launch(launchRequest());

    expect(observed).toHaveLength(1);
    expect(observed[0]).toEqual({ runFound: true, branchQueued: true });
  });

  it("creates one run/branch/attempt with attempt number 1", async () => {
    const { orch, repo } = makeHarness();
    const { runId, branchIds } = await orch.launch(launchRequest());
    const branches = await repo.listBranches(runId);
    expect(branches).toHaveLength(1);
    const attempts = await repo.listAttempts(branchIds[0]!);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.attemptNumber).toBe(1);
  });
});
