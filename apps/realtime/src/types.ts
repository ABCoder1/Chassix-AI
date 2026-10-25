import type { BranchStatusEvent } from "@chassix/shared";

/**
 * SpaceTimeDB live run-event layer (ADR-D8). The authoritative append-only event log lives in
 * Postgres; this fans the same `BranchStatusEvent`s out to SpaceTimeDB so browser clients get
 * real-time updates via its subscription model (the hackathon sponsor integration).
 *
 * The compiled code here is intentionally **binding-agnostic**: it talks to the minimal
 * `RunEventConnection` surface below, which the typed `DbConnection` produced by
 * `spacetime generate` satisfies. The concrete connection wiring (which needs those generated
 * bindings) lives in `examples/` + `docs/spacetimedb-setup.md`, so this package compiles and is
 * tested without a running host.
 */

/** A row of the SpaceTimeDB `run_event` table (mirrors `module/run_events.ts`). */
export interface RunEventRow {
  runId: string;
  branchId: string;
  attemptId: string;
  eventId: string;
  sequence: number;
  state: string;
  reason: string;
  timestamp: string;
}

/** Publishes an event to the live layer. In-memory in tests; reducer-backed in production. */
export interface RunEventPublisher {
  publish(event: BranchStatusEvent): Promise<void>;
}

/**
 * The subset of a generated SpaceTimeDB `DbConnection` we use. The full typed connection comes
 * from `spacetime generate --lang typescript` (see the setup doc); it structurally satisfies this.
 */
export interface RunEventConnection {
  reducers: {
    /** Server reducer `publish_run_event(payload: string)` — see `module/run_events.ts`. */
    publishRunEvent(payloadJson: string): void;
  };
  db: {
    runEvent: {
      onInsert(cb: (ctx: unknown, row: RunEventRow) => void): void;
    };
  };
  subscriptionBuilder(): { subscribe(query: string | string[]): unknown };
  disconnect(): void;
}
