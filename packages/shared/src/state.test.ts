import { describe, it, expect } from "vitest";
import {
  BranchState,
  canBranchTransition,
  isBranchTerminal,
  BRANCH_TERMINAL_STATES,
} from "./state.js";

describe("BranchState transitions (PRD §6)", () => {
  it("follows the happy path Not configured → … → Succeeded", () => {
    const path = [
      BranchState.NotConfigured,
      BranchState.Validating,
      BranchState.Ready,
      BranchState.Queued,
      BranchState.Running,
      BranchState.ValidatingOutputs,
      BranchState.Succeeded,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canBranchTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("rejects backward transitions (stale events cannot move a branch backward)", () => {
    expect(canBranchTransition(BranchState.Running, BranchState.Queued)).toBe(false);
    expect(canBranchTransition(BranchState.Succeeded, BranchState.Running)).toBe(false);
    expect(canBranchTransition(BranchState.ValidatingOutputs, BranchState.Running)).toBe(false);
  });

  it("rejects same-state (no self-loop) transitions", () => {
    expect(canBranchTransition(BranchState.Running, BranchState.Running)).toBe(false);
  });

  it("treats succeeded/failed/cancelled/skipped as terminal with no outgoing edges", () => {
    for (const terminal of BRANCH_TERMINAL_STATES) {
      expect(isBranchTerminal(terminal)).toBe(true);
      expect(canBranchTransition(terminal, BranchState.Running)).toBe(false);
    }
  });

  it("allows cancellation from any non-terminal running-ward state", () => {
    expect(canBranchTransition(BranchState.Running, BranchState.Cancelled)).toBe(true);
    expect(canBranchTransition(BranchState.Queued, BranchState.Cancelled)).toBe(true);
  });
});
