import { describe, it, expect } from "vitest";
import { BranchStatusEventSchema, isNewerEvent } from "./events.js";
import { BranchState } from "./state.js";

const base = {
  runId: "run_1",
  branchId: "branch_1",
  attemptId: "attempt_1",
  eventId: "evt_1",
  sequence: 5,
  timestamp: "2026-10-24T00:00:00.000Z",
  state: BranchState.Running,
  reason: "started",
};

describe("BranchStatusEvent", () => {
  it("accepts a well-formed event", () => {
    expect(BranchStatusEventSchema.parse(base)).toMatchObject({ sequence: 5 });
  });

  it("rejects a negative or non-integer sequence", () => {
    expect(() => BranchStatusEventSchema.parse({ ...base, sequence: -1 })).toThrow();
    expect(() => BranchStatusEventSchema.parse({ ...base, sequence: 1.5 })).toThrow();
  });

  it("rejects an unknown branch state", () => {
    expect(() => BranchStatusEventSchema.parse({ ...base, state: "frozen" })).toThrow();
  });
});

describe("isNewerEvent (dedupe / out-of-order guard)", () => {
  it("accepts a strictly higher sequence", () => {
    expect(isNewerEvent(5, 6)).toBe(true);
  });
  it("rejects duplicate and stale sequences", () => {
    expect(isNewerEvent(5, 5)).toBe(false);
    expect(isNewerEvent(5, 4)).toBe(false);
  });
});
