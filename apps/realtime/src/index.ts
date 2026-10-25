/**
 * SpaceTimeDB server MODULE (reference) — the run-event live layer (ADR-D8).
 *
 * This file runs INSIDE SpaceTimeDB, not in our Node apps. Drop it in as the `src/index.ts` of a
 * module project created with `spacetime init --lang typescript` (see docs/spacetimedb-setup.md),
 * then `spacetime build` / `spacetime publish`. It is intentionally NOT part of @chassix/realtime's
 * tsconfig build (that package compiles the client-side transport in `src/`).
 *
 * Written against the `spacetimedb@2.13.0` server API:
 *   - `table(opts, row)` with columns from the `t` builder (NOT a `column` helper).
 *   - `schema({ accessor: table })` returns the module; it is the `default` export.
 *   - reducers are `spacetimedb.reducer(params, fn)`; the export name is the reducer name
 *     (default SnakeCase policy ⇒ `publishRunEvent` is published as `publish_run_event`).
 *   - rows are written only inside reducers via `ctx.db.<accessor>.insert(row)`.
 *
 * Authoritative truth stays in Postgres; this table is a live projection clients subscribe to.
 * The client transport (apps/realtime/src) expects the `runEvent` table (`run_event`, columns
 * snake-cased: run_id, …) and the `publishRunEvent` reducer — keep these names in sync.
 */
import { schema, table, t } from "spacetimedb/server";

/**
 * Append-only run-event log. `public: true` so clients may subscribe. `id` is an auto-increment
 * primary key; the (run_id, sequence) pair mirrors the Postgres cursor so the live tail is
 * idempotent. Column names are camelCase here and published snake_cased (run_id, branch_id, …).
 */
export const runEvent = table(
  { name: "run_event", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    runId: t.string().index(),
    branchId: t.string(),
    attemptId: t.string(),
    eventId: t.string(),
    sequence: t.u64(),
    state: t.string(),
    reason: t.string(),
    timestamp: t.string(),
  },
);

const spacetimedb = schema({ runEvent });

/**
 * The ONLY write path (clients cannot write tables directly). Accepts the BranchStatusEvent as a
 * JSON string (matches `connectionPublisher` on the client), parses, and inserts one row. The
 * export name becomes the reducer name `publish_run_event`. In a real deployment, authorize
 * `ctx.sender` against the run's workspace membership before inserting.
 */
export const publishRunEvent = spacetimedb.reducer({ payload: t.string() }, (ctx, { payload }) => {
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
    id: 0n, // ignored: filled by autoInc
    runId: e.runId,
    branchId: e.branchId,
    attemptId: e.attemptId,
    eventId: e.eventId,
    sequence: BigInt(e.sequence),
    state: e.state,
    reason: e.reason,
    timestamp: e.timestamp,
  });
});

export default spacetimedb;
