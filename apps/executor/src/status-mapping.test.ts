import { describe, it, expect } from "vitest";
import { BranchState, ExecutorStatus } from "@chassix/shared";
import type { ExecutorPoll } from "@chassix/shared";
import { pollToBranchState, statusToBranchState, isConnectionUncertain } from "./status-mapping.js";

const poll = (status: ExecutorStatus): ExecutorPoll => ({ status, progress: null, reason: "" });

describe("status → branch-state mapping", () => {
  it("maps live states to their branch states", () => {
    expect(statusToBranchState(ExecutorStatus.Queued)).toBe(BranchState.Queued);
    expect(statusToBranchState(ExecutorStatus.Running)).toBe(BranchState.Running);
    expect(statusToBranchState(ExecutorStatus.Failed)).toBe(BranchState.Failed);
    expect(statusToBranchState(ExecutorStatus.Cancelled)).toBe(BranchState.Cancelled);
  });

  it("maps succeeded to ValidatingOutputs, not Succeeded (artifact validation is Step 3.5)", () => {
    expect(statusToBranchState(ExecutorStatus.Succeeded)).toBe(BranchState.ValidatingOutputs);
  });

  it("maps a lost/indeterminate heartbeat (Unknown) to null — no state change", () => {
    expect(statusToBranchState(ExecutorStatus.Unknown)).toBeNull();
    expect(pollToBranchState(poll(ExecutorStatus.Unknown))).toBeNull();
  });

  it("flags connection-uncertain only for Unknown", () => {
    expect(isConnectionUncertain(poll(ExecutorStatus.Unknown))).toBe(true);
    expect(isConnectionUncertain(poll(ExecutorStatus.Running))).toBe(false);
  });

  it("pollToBranchState agrees with statusToBranchState", () => {
    for (const status of Object.values(ExecutorStatus)) {
      expect(pollToBranchState(poll(status))).toBe(statusToBranchState(status));
    }
  });
});
