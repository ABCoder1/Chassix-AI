import { describe, it, expect } from "vitest";
import { BranchState } from "@chassix/shared";
import { RunOrchestrator } from "./orchestrator.js";
import { InMemoryRunRepository, InMemoryEventLogRepository } from "./repository/in-memory.js";
import { InMemoryEventTransport } from "./transport/in-memory.js";
import { FixtureOutputValidator } from "./validation.js";
import { makeHarness, launchRequest, DEFAULT_SCHEMA } from "./testing/harness.js";

describe("reconciliation after restart (Step 3.3/3.4)", () => {
  it("a fresh orchestrator over the same store reconciles non-terminal branches via executor poll", async () => {
    // Orchestrator A launches, then the process "crashes".
    const { store, executor, orch: orchA } = makeHarness();
    const { runId, branchIds } = await orchA.launch(launchRequest());
    const branchId = branchIds[0]!;
    const branch = await orchA.snapshot(runId).then((s) => s.branches[0]!);
    const ref = branch.executorRef!;
    expect(branch.state).toBe(BranchState.Queued);

    // Meanwhile the remote job progressed and finished with valid outputs.
    executor.setPoll(ref, "succeeded", "exit 0");

    // Restart: a NEW orchestrator over the SAME persisted store + same executor.
    const repoB = new InMemoryRunRepository(store);
    const eventLogB = new InMemoryEventLogRepository(store);
    const orchB = new RunOrchestrator({
      repo: repoB,
      eventLog: eventLogB,
      executor,
      transport: new InMemoryEventTransport(),
      validator: new FixtureOutputValidator(DEFAULT_SCHEMA),
    });

    // Outputs are present and valid (hash-verified) when reconciliation runs the gate.
    await orchB.reportArtifacts(branchId, [{ kind: "qc_report", checksum: "sha256:ok" }]);
    const snap = await orchB.reconcile(runId);

    expect(snap.branches[0]!.state).toBe(BranchState.Succeeded);
    // No duplicate submission occurred across the restart (still exactly one).
    expect(executor.submissions).toHaveLength(1);
  });

  it("a lost heartbeat ('unknown') marks Connection uncertain, not a failure", async () => {
    const { orch, runId, branchIds } = await (async () => {
      const h = makeHarness();
      const r = await h.orch.launch(launchRequest());
      await h.orch.applyExecutorStatus(r.branchIds[0]!, {
        status: "running",
        progress: null,
        reason: "",
      });
      return { orch: h.orch, runId: r.runId, branchIds: r.branchIds };
    })();

    const res = await orch.applyExecutorStatus(branchIds[0]!, {
      status: "unknown",
      progress: null,
      reason: "heartbeat lost",
    });
    expect(res.applied).toBe(false);
    const branch = (await orch.snapshot(runId)).branches[0]!;
    expect(branch.state).toBe(BranchState.Running); // NOT Failed
    expect(branch.connectivity).toBe("connection_uncertain");
  });
});
