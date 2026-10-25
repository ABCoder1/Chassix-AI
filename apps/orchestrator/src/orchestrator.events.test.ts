import { describe, it, expect } from "vitest";
import { BranchState } from "@chassix/shared";
import { projectSnapshot } from "./orchestrator.js";
import { makeHarness, launchRequest } from "./testing/harness.js";

describe("event log, stale/duplicate rejection, replay + snapshot (Step 3.4)", () => {
  it("rejects a stale/duplicate event and cannot move a branch backward", async () => {
    const { orch } = makeHarness();
    const { runId, branchIds } = await orch.launch(launchRequest());
    const branchId = branchIds[0]!;

    // Advance to Running.
    const toRunning = await orch.applyExecutorStatus(branchId, {
      status: "running",
      progress: null,
      reason: "running",
    });
    expect(toRunning.applied).toBe(true);
    const current = (await orch.snapshot(runId)).branches[0]!;
    expect(current.state).toBe(BranchState.Running);

    // A duplicate/old-sequence event is rejected (isNewerEvent).
    const stale = await orch.ingestStatusEvent({
      branchId,
      state: BranchState.Running,
      sequence: current.sequence, // not newer
    });
    expect(stale.applied).toBe(false);
    expect(stale.applied === false && stale.reason).toBe("stale-or-duplicate");

    // Even a newer-sequence event that asks for a BACKWARD state is rejected (canBranchTransition).
    const backward = await orch.ingestStatusEvent({
      branchId,
      state: BranchState.Queued,
      sequence: current.sequence + 5,
    });
    expect(backward.applied).toBe(false);
    expect(backward.applied === false && backward.reason).toBe("illegal-transition");

    // State is unchanged — never moved backward.
    expect((await orch.snapshot(runId)).branches[0]!.state).toBe(BranchState.Running);
  });

  it("replayFrom(cursor) is gap-free, ordered, and snapshot is authoritative", async () => {
    const { orch } = makeHarness();
    const { runId, branchIds } = await orch.launch(launchRequest());
    const branchId = branchIds[0]!;
    await orch.applyExecutorStatus(branchId, { status: "running", progress: null, reason: "" });
    await orch.reportArtifacts(branchId, [{ kind: "qc_report", checksum: "sha256:z" }]);
    await orch.applyExecutorStatus(branchId, { status: "succeeded", progress: null, reason: "" });

    const all = await orch.replayFrom(runId, 0);
    const sequences = all.map((e) => e.sequence);
    // strictly increasing + contiguous from 1 (gap-free)
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(sequences[0]).toBe(1);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]! - sequences[i - 1]!).toBe(1);
    }

    // Replay from a mid cursor returns only the tail.
    const tail = await orch.replayFrom(runId, sequences[1]!);
    expect(tail.every((e) => e.sequence > sequences[1]!)).toBe(true);

    // Snapshot is authoritative: terminal Succeeded after the validation gate.
    const snap = await orch.snapshot(runId);
    expect(snap.branches[0]!.state).toBe(BranchState.Succeeded);
    expect(snap.lastSequence).toBe(sequences[sequences.length - 1]);
  });

  it("duplicate delivery is idempotent: projecting events twice yields the same state", async () => {
    const { orch, transport } = makeHarness();
    const { runId, branchIds } = await orch.launch(launchRequest());
    await orch.applyExecutorStatus(branchIds[0]!, {
      status: "running",
      progress: null,
      reason: "",
    });

    const events = await orch.replayFrom(runId, 0);
    const once = projectSnapshot(events);
    // Simulate at-least-once delivery: every event delivered twice.
    const twice = projectSnapshot([...events, ...events, ...transport.published]);
    expect(twice.get(branchIds[0]!)).toEqual(once.get(branchIds[0]!));
  });
});
