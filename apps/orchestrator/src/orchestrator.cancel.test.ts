import { describe, it, expect } from "vitest";
import { BranchState, isBranchTerminal } from "@chassix/shared";
import { makeHarness, launchRequest } from "./testing/harness.js";

const launchRunning = async () => {
  const h = makeHarness();
  const { runId, branchIds } = await h.orch.launch(launchRequest());
  await h.orch.applyExecutorStatus(branchIds[0]!, {
    status: "running",
    progress: null,
    reason: "",
  });
  return { ...h, runId, branchId: branchIds[0]! };
};

describe("cancel + retry (Step 3.6)", () => {
  it("cancel reaches the executor and records an AUDITED terminal Cancelled (never 'failed')", async () => {
    const { orch, repo, executor, runId, branchId } = await launchRunning();
    const branchRef = (await repo.getBranch(branchId))!.executorRef!;

    const res = await orch.cancel(runId, { branchId, actorUserId: "user_1" });
    expect(res.cancelledBranchIds).toContain(branchId);
    expect(executor.cancels).toContain(branchRef);

    const branch = (await orch.snapshot(runId)).branches[0]!;
    expect(branch.state).toBe(BranchState.Cancelled);
    expect(isBranchTerminal(branch.state)).toBe(true);
    expect(branch.state).not.toBe(BranchState.Failed);

    const audits = await repo.listAudits(runId);
    expect(audits.some((a) => a.action === "branch.cancel" && a.targetId === branchId)).toBe(true);
  });

  it("a detached client (closed tab) does NOT cancel the job", async () => {
    const { orch, executor, runId } = await launchRunning();
    const before = (await orch.snapshot(runId)).branches[0]!.state;

    await orch.clientDisconnected(runId);

    const after = (await orch.snapshot(runId)).branches[0]!.state;
    expect(after).toBe(before);
    expect(after).toBe(BranchState.Running);
    expect(executor.cancels).toHaveLength(0); // no cancel reached the executor
  });

  it("a cancelled branch can be retried as a NEW attempt", async () => {
    const { orch, repo, executor, runId, branchId } = await launchRunning();
    await orch.cancel(runId, { branchId, actorUserId: "user_1" });
    expect((await repo.getBranch(branchId))!.state).toBe(BranchState.Cancelled);

    const newAttemptId = await orch.retryBranch(runId, branchId, { actorUserId: "user_1" });

    const attempts = await repo.listAttempts(branchId);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]!.attemptNumber).toBe(2);
    expect(newAttemptId).toBe(attempts[1]!.id);

    const branch = (await repo.getBranch(branchId))!;
    expect(branch.state).toBe(BranchState.Queued); // re-entered the lifecycle
    expect(branch.currentAttemptId).toBe(newAttemptId);
    // A second submission happened for the retry (original + retry = 2).
    expect(executor.submissions).toHaveLength(2);

    const audits = await repo.listAudits(runId);
    expect(audits.some((a) => a.action === "branch.retry")).toBe(true);
  });
});
