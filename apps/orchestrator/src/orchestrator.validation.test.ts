import { describe, it, expect } from "vitest";
import { BranchState } from "@chassix/shared";
import { makeHarness, launchRequest } from "./testing/harness.js";

describe("artifact-validation gate (Step 3.5)", () => {
  const driveToSucceededPoll = async () => {
    const h = makeHarness();
    const { runId, branchIds } = await h.orch.launch(launchRequest());
    const branchId = branchIds[0]!;
    await h.orch.applyExecutorStatus(branchId, { status: "running", progress: null, reason: "" });
    return { ...h, runId, branchId };
  };

  it("executor 'succeeded' + passing validation → Succeeded", async () => {
    const { orch, runId, branchId } = await driveToSucceededPoll();
    await orch.reportArtifacts(branchId, [
      { kind: "qc_report", checksum: "sha256:ok", available: true },
    ]);
    const result = await orch.applyExecutorStatus(branchId, {
      status: "succeeded",
      progress: null,
      reason: "exit 0",
    });
    expect(result.applied).toBe(true);
    expect((await orch.snapshot(runId)).branches[0]!.state).toBe(BranchState.Succeeded);
  });

  it("exit-0-but-invalid-artifact → Failed with a reason (never silent success)", async () => {
    const { orch, runId, branchId } = await driveToSucceededPoll();
    // Artifact present but UNAVAILABLE — exit code 0 is not enough.
    await orch.reportArtifacts(branchId, [
      { kind: "qc_report", checksum: "sha256:ok", available: false },
    ]);
    await orch.applyExecutorStatus(branchId, {
      status: "succeeded",
      progress: null,
      reason: "exit 0",
    });

    const branch = (await orch.snapshot(runId)).branches[0]!;
    expect(branch.state).toBe(BranchState.Failed);
    expect(branch.reason).toMatch(/artifact validation failed/);
  });

  it("missing required artifact → Failed (not Succeeded)", async () => {
    const { orch, runId, branchId } = await driveToSucceededPoll();
    // No artifacts reported at all.
    await orch.applyExecutorStatus(branchId, { status: "succeeded", progress: null, reason: "" });
    const branch = (await orch.snapshot(runId)).branches[0]!;
    expect(branch.state).toBe(BranchState.Failed);
    expect(branch.reason).toMatch(/qc_report \(absent\)/);
  });

  it("the branch passes through ValidatingOutputs before any terminal success", async () => {
    const { orch, transport, runId, branchId } = await driveToSucceededPoll();
    await orch.reportArtifacts(branchId, [{ kind: "qc_report", checksum: "sha256:ok" }]);
    await orch.applyExecutorStatus(branchId, { status: "succeeded", progress: null, reason: "" });
    const states = transport.published.filter((e) => e.runId === runId).map((e) => e.state);
    expect(states).toContain(BranchState.ValidatingOutputs);
    // ValidatingOutputs is emitted before Succeeded.
    expect(states.indexOf(BranchState.ValidatingOutputs)).toBeLessThan(
      states.indexOf(BranchState.Succeeded),
    );
  });
});
