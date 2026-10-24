/**
 * Pure serialization helpers for the run-events SSE stream and the per-attempt logs
 * projection (Step 3.4). Kept side-effect free so reconnect replay and log shaping are
 * unit-tested without a socket (the route is a thin shell over these).
 *
 * SSE framing (PRD §7, ADR-D8): every event is emitted with an `id:` equal to its monotonic
 * per-run `sequence`, so a reconnecting client replays gap-free from `Last-Event-ID`.
 */
import type { BranchStatusEvent } from "@chassix/shared";
import type { AttemptRecord } from "@chassix/orchestrator";

/** Named SSE event type for branch status frames. */
export const SSE_EVENT_NAME = "branch-status";

/** Serialize one status event as an SSE frame whose `id:` is its sequence cursor. */
export const serializeSseEvent = (event: BranchStatusEvent): string =>
  `id: ${event.sequence}\n` + `event: ${SSE_EVENT_NAME}\n` + `data: ${JSON.stringify(event)}\n\n`;

/** Serialize an ordered replay batch (already filtered from a cursor) into one SSE payload. */
export const serializeReplay = (events: readonly BranchStatusEvent[]): string =>
  [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .map(serializeSseEvent)
    .join("");

/** An SSE heartbeat comment — keeps the connection alive through proxies without being an event. */
export const SSE_HEARTBEAT = `: heartbeat\n\n`;

/**
 * Parse a reconnect cursor from the `Last-Event-ID` header or a `?cursor=` query value.
 * Anything missing/invalid means "from the beginning" (0) — never a negative or NaN cursor.
 */
export const parseCursor = (
  lastEventId: string | string[] | undefined,
  cursorQuery: unknown,
): number => {
  const raw = Array.isArray(lastEventId) ? lastEventId[0] : lastEventId;
  const candidate = raw ?? (typeof cursorQuery === "string" ? cursorQuery : undefined);
  if (candidate === undefined) return 0;
  const parsed = Number.parseInt(candidate, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** One attempt's log view: attempt metadata plus the status events recorded against it. */
export interface AttemptLog {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly status: string;
  readonly reason: string | null;
  readonly executorRef: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly events: readonly BranchStatusEvent[];
}

/**
 * Per-attempt logs projection for a branch (Step 3.6 surface): join each attempt record with
 * its status events (by `attemptId`), ordered by attempt number then sequence. Pure over the
 * records the orchestrator persists — no fabricated content.
 */
export const projectBranchLogs = (
  attempts: readonly AttemptRecord[],
  events: readonly BranchStatusEvent[],
  branchId: string,
): AttemptLog[] => {
  const branchEvents = events
    .filter((e) => e.branchId === branchId)
    .sort((a, b) => a.sequence - b.sequence);
  return [...attempts]
    .filter((a) => a.branchId === branchId)
    .sort((a, b) => a.attemptNumber - b.attemptNumber)
    .map((a) => ({
      attemptId: a.id,
      attemptNumber: a.attemptNumber,
      status: a.status,
      reason: a.reason,
      executorRef: a.executorRef,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      events: branchEvents.filter((e) => e.attemptId === a.id),
    }));
};
