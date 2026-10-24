import { BranchState } from "@chassix/shared";
import type { BranchStatusEvent } from "@chassix/shared";
import type { BranchRuntime, RunRuntime } from "./runEvents";

/**
 * ILLUSTRATIVE run-monitor seed state + a scripted event timeline (Step 3.5 UI).
 *
 * The seed runtimes describe the branches of the frozen plan at launch; the
 * scripted timeline advances them through the lifecycle so the route animates
 * without a backend. Everything here is illustrative lifecycle chrome — no
 * fabricated scientific results. Branch ids match `planData.ts`.
 */

export const ILLUSTRATIVE_RUN_ID = "run-ILLUSTRATIVE-0001";

export const ILLUSTRATIVE_RUN_LABEL =
  "Illustrative run — statuses, stages, timings and environments are fixtures animated from a scripted event stream, not a live remote execution.";

interface SeedBranch {
  branchId: string;
  label: string;
  environment: string;
  state: BranchState;
}

const SEED: readonly SeedBranch[] = [
  {
    branchId: "branch-genome-bl01",
    label: "Genome assessment × B. licheniformis",
    environment: "remote-cpu-small (illustrative)",
    state: BranchState.Queued,
  },
  {
    branchId: "branch-expr-bl01",
    label: "Expression analysis × B. licheniformis",
    environment: "remote-cpu-medium (illustrative)",
    state: BranchState.Queued,
  },
  {
    branchId: "branch-pathway-km07",
    label: "Pathway mapping × K. marxianus",
    environment: "remote-cpu-small (illustrative)",
    state: BranchState.Running,
  },
];

/** Build a fresh run runtime (new startedAt), so elapsed time is relative to mount. */
export function createIllustrativeRun(now: number = Date.now()): RunRuntime {
  const branches: Record<string, BranchRuntime> = {};
  const order: string[] = [];
  for (const s of SEED) {
    order.push(s.branchId);
    branches[s.branchId] = {
      branchId: s.branchId,
      label: s.label,
      environment: s.environment,
      state: s.state,
      lastSequence: 0,
      stage: s.state === BranchState.Running ? "Running analysis" : "Queued for remote execution",
      reason: "Launched from frozen manifest (illustrative).",
      startedAt: now,
      updatedAt: now,
    };
  }
  return { order, branches };
}

function ev(
  branchId: string,
  sequence: number,
  state: BranchState,
  reason: string,
): BranchStatusEvent {
  return {
    runId: ILLUSTRATIVE_RUN_ID,
    branchId,
    attemptId: `${branchId}-attempt-1`,
    eventId: `${branchId}-${sequence}`,
    sequence,
    timestamp: new Date().toISOString(),
    state,
    reason,
  };
}

/**
 * A scripted timeline for the default illustrative source: each branch advances
 * Queued → Running → Validating outputs → Succeeded on wall-clock delays.
 */
export const ILLUSTRATIVE_TIMELINE: ReadonlyArray<{ at: number; event: BranchStatusEvent }> = [
  {
    at: 1200,
    event: ev("branch-genome-bl01", 1, BranchState.Running, "Remote execution started."),
  },
  {
    at: 2600,
    event: ev(
      "branch-pathway-km07",
      2,
      BranchState.ValidatingOutputs,
      "Validating output artifacts.",
    ),
  },
  {
    at: 3200,
    event: ev(
      "branch-genome-bl01",
      3,
      BranchState.ValidatingOutputs,
      "Validating output artifacts.",
    ),
  },
  { at: 3600, event: ev("branch-expr-bl01", 4, BranchState.Running, "Remote execution started.") },
  {
    at: 4200,
    event: ev("branch-pathway-km07", 5, BranchState.Succeeded, "Outputs validated against schema."),
  },
  {
    at: 4800,
    event: ev("branch-genome-bl01", 6, BranchState.Succeeded, "Outputs validated against schema."),
  },
  {
    at: 6000,
    event: ev("branch-expr-bl01", 7, BranchState.ValidatingOutputs, "Validating output artifacts."),
  },
  {
    at: 6800,
    event: ev("branch-expr-bl01", 8, BranchState.Succeeded, "Outputs validated against schema."),
  },
];
