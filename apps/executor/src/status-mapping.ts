import { executorStatusToBranchState, ExecutorStatus } from "@chassix/shared";
import type { BranchState, ExecutorPoll } from "@chassix/shared";

/**
 * Normalized executor-status → branch-state mapping (PRD §6, Step 3.1 DoD).
 *
 * The authoritative map lives in `@chassix/shared` (`executorStatusToBranchState`); these
 * helpers are the adapter-side entry point so every caller gets the SAME normalized mapping
 * instead of branching on raw status strings. Documented table (source of truth: shared):
 *
 *   ExecutorStatus   BranchState            Meaning
 *   --------------   --------------------   ----------------------------------------------
 *   queued           Queued                 Accepted by engine, not yet running.
 *   running          Running                Executing on the remote engine.
 *   succeeded        ValidatingOutputs      Engine exited 0 — NOT yet "Succeeded": the
 *                                           orchestrator records Succeeded only AFTER
 *                                           artifact validation (Step 3.5).
 *   failed           Failed                 Engine reported failure.
 *   cancelled        Cancelled              Explicit cancellation (audited, never "failed").
 *   unknown          null                   Lost/indeterminate heartbeat → NO state change.
 *                                           Surfaced as "Connection uncertain" (an overlay),
 *                                           never an automatic scientific failure (PRD §6).
 *
 * A `null` result is meaningful: the caller MUST leave the branch state untouched and instead
 * flag connectivity (see `ConnectivityStatus.ConnectionUncertain` in `@chassix/shared`).
 */
export const statusToBranchState = (status: ExecutorStatus): BranchState | null =>
  executorStatusToBranchState[status];

/** Convenience over a full poll result: maps `poll.status` to a `BranchState | null`. */
export const pollToBranchState = (poll: ExecutorPoll): BranchState | null =>
  statusToBranchState(poll.status);

/** True when the poll carries no branch-state change (lost heartbeat / connection uncertain). */
export const isConnectionUncertain = (poll: ExecutorPoll): boolean =>
  poll.status === ExecutorStatus.Unknown;

// Re-export the shared map so callers can read the full table without reaching past the adapter.
export { executorStatusToBranchState };
