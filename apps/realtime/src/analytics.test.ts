import { describe, it, expect } from "vitest";
import { summarizeRunEvents, type RunEventLike } from "./analytics.js";

const t = (sec: number) =>
  new Date(Date.parse("2026-10-25T00:00:00.000Z") + sec * 1000).toISOString();

function ev(
  branchId: string,
  attemptId: string,
  sequence: number,
  state: string,
  sec: number,
  reason = "",
): RunEventLike {
  return { runId: "run-1", branchId, attemptId, sequence, state, reason, timestamp: t(sec) };
}

describe("summarizeRunEvents", () => {
  it("computes per-branch + run metrics and derives a partial outcome", () => {
    const events: RunEventLike[] = [
      ev("A", "a1", 1, "queued", 0),
      ev("B", "b1", 2, "queued", 0),
      ev("A", "a1", 3, "running", 1),
      ev("B", "b1", 4, "running", 1),
      ev("A", "a1", 5, "succeeded", 5),
      ev("B", "b1", 6, "failed", 2, "tool crashed"),
    ];
    const s = summarizeRunEvents(events);

    expect(s.runId).toBe("run-1");
    expect(s.totalEvents).toBe(6);
    expect(s.branchCount).toBe(2);
    expect(s.succeededBranches).toEqual(["A"]);
    expect(s.failedBranches).toEqual(["B"]);
    expect(s.terminal).toEqual({ succeeded: 1, failed: 1, cancelled: 0, skipped: 0 });
    expect(s.outcome).toBe("partial");
    expect(s.byState).toMatchObject({ queued: 2, running: 2, succeeded: 1, failed: 1 });
    expect(s.wallClockMs).toBe(5000);
    expect(s.slowestBranch).toEqual({ branchId: "A", durationMs: 5000 });
    expect(s.anomalousEvents).toBe(0);
    const b = s.branches.find((x) => x.branchId === "B")!;
    expect(b.currentState).toBe("failed");
    expect(b.isTerminal).toBe(true);
    expect(b.reason).toBe("tool crashed");
    expect(b.durationMs).toBe(2000);
  });

  it("flags out-of-order / duplicate events as anomalies", () => {
    const events: RunEventLike[] = [
      ev("A", "a1", 1, "queued", 0),
      ev("A", "a1", 1, "queued", 0), // duplicate sequence
    ];
    expect(summarizeRunEvents(events).anomalousEvents).toBe(1);
  });

  it("reports an empty summary for no events", () => {
    const s = summarizeRunEvents([]);
    expect(s.outcome).toBe("empty");
    expect(s.totalEvents).toBe(0);
    expect(s.branches).toHaveLength(0);
  });

  it("is 'running' while any branch is non-terminal", () => {
    const s = summarizeRunEvents([ev("A", "a1", 1, "running", 0)]);
    expect(s.outcome).toBe("running");
  });
});
