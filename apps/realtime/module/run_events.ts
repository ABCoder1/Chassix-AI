/**
 * SpaceTimeDB server MODULE (reference) — the run-event live layer (ADR-D8).
 *
 * This file runs INSIDE SpaceTimeDB, not in our Node apps. It is a reference you drop into a
 * module project created with `spacetime init --lang typescript` (see docs/spacetimedb-setup.md),
 * then `spacetime publish`. It is intentionally NOT part of @chassix/realtime's tsconfig build
 * (that package compiles the client-side transport in `src/`). Reconcile the exact decorator/
 * helper shapes with the `spacetimedb/server` version your `spacetime init` scaffolds.
 *
 * Authoritative truth stays in Postgres; this table is a live projection clients subscribe to.
 */
import { schema, table, type ReducerCtx } from "spacetimedb/server";

/**
 * Append-only run-event log. `public: true` so clients may subscribe. A unique (run_id, sequence)
 * mirrors the Postgres cursor and makes the live tail idempotent.
 */
export const runEvent = table("run_event", {
  // columns
  id: "u64", // auto / primary key per your init scaffold
  runId: "string",
  branchId: "string",
  attemptId: "string",
  eventId: "string",
  sequence: "u64",
  state: "string",
  reason: "string",
  timestamp: "string",
}).public();

export const appSchema = schema({ runEvent });

/**
 * The ONLY write path (clients cannot write tables directly). Accepts the BranchStatusEvent as a
 * JSON string (matches `connectionPublisher` on the client), parses, and inserts one row.
 * Authorize with `ctx.sender` against the run's workspace membership in a real deployment.
 */
export function publishRunEvent(ctx: ReducerCtx<typeof appSchema>, payload: string): void {
  const e = JSON.parse(payload) as {
    runId: string;
    branchId: string;
    attemptId: string;
    eventId: string;
    sequence: number;
    state: string;
    reason: string;
    timestamp: string;
  };
  ctx.db.runEvent.insert({
    id: 0n,
    runId: e.runId,
    branchId: e.branchId,
    attemptId: e.attemptId,
    eventId: e.eventId,
    sequence: BigInt(e.sequence),
    state: e.state,
    reason: e.reason,
    timestamp: e.timestamp,
  });
}
