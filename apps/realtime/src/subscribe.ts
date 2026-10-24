import { type BranchState } from "@chassix/shared";
import type { RunEventConnection, RunEventRow } from "./types.js";

/** Escape a single-quoted SQL string literal for a subscription query. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Subscribe a client to live run events for one run. SpaceTimeDB subscriptions are single-table,
 * so this subscribes to `run_event` filtered by `run_id` and forwards each inserted row (the log
 * is append-only, so inserts are the only mutation). Returns an unsubscribe-ish `disconnect`.
 *
 * For authoritative gap-free replay after a reconnect, fetch the Postgres snapshot/replay endpoint
 * (the orchestrator's `replayFrom(cursor)`); SpaceTimeDB provides the low-latency live tail.
 */
export function subscribeToRunEvents(
  conn: RunEventConnection,
  runId: string,
  onEvent: (row: RunEventRow) => void,
): () => void {
  conn.db.runEvent.onInsert((_ctx, row) => {
    if (row.runId === runId) onEvent(row);
  });
  conn
    .subscriptionBuilder()
    .subscribe(`SELECT * FROM run_event WHERE run_id = ${sqlLiteral(runId)}`);
  return () => conn.disconnect();
}

/** Narrow a stored row's `state` string to a BranchState at the display boundary, if needed. */
export function rowState(row: RunEventRow): BranchState {
  return row.state as BranchState;
}
