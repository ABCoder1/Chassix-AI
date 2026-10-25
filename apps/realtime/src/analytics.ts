/**
 * Analytics over the run-event log (the `run_event` rows mirrored into SpaceTimeDB, ADR-D8).
 *
 * `summarizeRunEvents` turns the raw append-only event stream into the useful metrics a run
 * dashboard wants: per-branch state + duration + attempts, run wall-clock, event counts by state,
 * terminal tallies, the derived outcome, the slowest branch, and a count of any out-of-order /
 * duplicate events (which should be zero for a healthy monotonic log). Pure and store-agnostic: it
 * takes the event rows (from a SpaceTimeDB subscription or the Postgres log) and computes — no I/O.
 */

/** The fields we read from a run-event row (both `RunEventRow` and `BranchStatusEvent` satisfy this). */
export interface RunEventLike {
  readonly runId: string;
  readonly branchId: string;
  readonly attemptId: string;
  readonly sequence: number;
  readonly state: string;
  readonly reason: string;
  readonly timestamp: string;
}

const TERMINAL_STATES: ReadonlySet<string> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

export interface BranchSummary {
  readonly branchId: string;
  readonly currentState: string;
  readonly isTerminal: boolean;
  readonly firstAt: string | null;
  readonly lastAt: string | null;
  /** Milliseconds from the branch's first event to its last, or null if not computable. */
  readonly durationMs: number | null;
  /** Distinct attempt ids seen for this branch (retries). */
  readonly attempts: number;
  /** Number of status events recorded for this branch. */
  readonly transitions: number;
  /** Reason on the latest event, if any. */
  readonly reason: string | null;
}

export type RunOutcome = "empty" | "running" | "completed" | "partial" | "failed";

export interface RunEventSummary {
  readonly runId: string;
  readonly totalEvents: number;
  readonly branchCount: number;
  readonly startedAt: string | null;
  readonly lastEventAt: string | null;
  readonly wallClockMs: number | null;
  /** Event counts per state (how many events landed in each state). */
  readonly byState: Readonly<Record<string, number>>;
  /** Terminal branch tallies (from each branch's current state). */
  readonly terminal: {
    readonly succeeded: number;
    readonly failed: number;
    readonly cancelled: number;
    readonly skipped: number;
  };
  readonly outcome: RunOutcome;
  readonly succeededBranches: readonly string[];
  readonly failedBranches: readonly string[];
  readonly slowestBranch: { readonly branchId: string; readonly durationMs: number } | null;
  readonly branches: readonly BranchSummary[];
  /** Events whose sequence did not strictly increase — out-of-order/duplicate anomalies (expect 0). */
  readonly anomalousEvents: number;
}

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Summarize a run's event stream into dashboard metrics. Order-independent (sorts by sequence). */
export function summarizeRunEvents(events: readonly RunEventLike[]): RunEventSummary {
  const runId = events[0]?.runId ?? "";
  if (events.length === 0) {
    return {
      runId,
      totalEvents: 0,
      branchCount: 0,
      startedAt: null,
      lastEventAt: null,
      wallClockMs: null,
      byState: {},
      terminal: { succeeded: 0, failed: 0, cancelled: 0, skipped: 0 },
      outcome: "empty",
      succeededBranches: [],
      failedBranches: [],
      slowestBranch: null,
      branches: [],
      anomalousEvents: 0,
    };
  }

  const sorted = [...events].sort(
    (a, b) => a.sequence - b.sequence || ms(a.timestamp) - ms(b.timestamp),
  );

  const byState: Record<string, number> = {};
  let maxSeq = -Infinity;
  let anomalousEvents = 0;
  for (const e of sorted) {
    byState[e.state] = (byState[e.state] ?? 0) + 1;
    if (e.sequence <= maxSeq) anomalousEvents++;
    else maxSeq = e.sequence;
  }

  const groups = new Map<string, RunEventLike[]>();
  for (const e of sorted) {
    const list = groups.get(e.branchId);
    if (list) list.push(e);
    else groups.set(e.branchId, [e]);
  }

  const branches: BranchSummary[] = [];
  for (const [branchId, evs] of groups) {
    const last = evs[evs.length - 1]!;
    const firstAt = evs[0]!.timestamp;
    const lastAt = last.timestamp;
    const durationMs = Math.max(0, ms(lastAt) - ms(firstAt));
    branches.push({
      branchId,
      currentState: last.state,
      isTerminal: TERMINAL_STATES.has(last.state),
      firstAt,
      lastAt,
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
      attempts: new Set(evs.map((e) => e.attemptId)).size,
      transitions: evs.length,
      reason: last.reason || null,
    });
  }

  const succeededBranches = branches
    .filter((b) => b.currentState === "succeeded")
    .map((b) => b.branchId);
  const failedBranches = branches.filter((b) => b.currentState === "failed").map((b) => b.branchId);
  const terminal = {
    succeeded: succeededBranches.length,
    failed: failedBranches.length,
    cancelled: branches.filter((b) => b.currentState === "cancelled").length,
    skipped: branches.filter((b) => b.currentState === "skipped").length,
  };

  const allTerminal = branches.every((b) => b.isTerminal);
  const outcome: RunOutcome = !allTerminal
    ? "running"
    : terminal.succeeded === branches.length
      ? "completed"
      : terminal.succeeded > 0
        ? "partial"
        : "failed";

  // Wall-clock spans the earliest to latest event TIMESTAMP (independent of sequence ordering).
  const byTime = [...sorted].sort((a, b) => ms(a.timestamp) - ms(b.timestamp));
  const startedAt = byTime[0]?.timestamp ?? null;
  const lastEventAt = byTime[byTime.length - 1]?.timestamp ?? null;

  const slowestBranch = branches
    .filter((b): b is BranchSummary & { durationMs: number } => b.durationMs !== null)
    .reduce<{
      branchId: string;
      durationMs: number;
    } | null>(
      (best, b) =>
        !best || b.durationMs > best.durationMs
          ? { branchId: b.branchId, durationMs: b.durationMs }
          : best,
      null,
    );

  return {
    runId,
    totalEvents: sorted.length,
    branchCount: branches.length,
    startedAt,
    lastEventAt,
    wallClockMs: startedAt && lastEventAt ? Math.max(0, ms(lastEventAt) - ms(startedAt)) : null,
    byState,
    terminal,
    outcome,
    succeededBranches,
    failedBranches,
    slowestBranch,
    branches,
    anomalousEvents,
  };
}
