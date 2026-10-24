import { z } from "zod";
import { BranchState } from "./state.js";

/**
 * Every status update carries runId, branchId, attemptId, eventId, sequence/version,
 * timestamp, and reason (PRD §6). `sequence` is a monotonic per-run cursor used for
 * gap-free SSE replay (ADR-D8) and for rejecting stale/duplicate events (BF-06/BF-13).
 */
export const BranchStatusEventSchema = z.object({
  runId: z.string().min(1),
  branchId: z.string().min(1),
  attemptId: z.string().min(1),
  eventId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  state: z.nativeEnum(BranchState),
  reason: z.string(),
});
export type BranchStatusEvent = z.infer<typeof BranchStatusEventSchema>;

/**
 * True when `incoming` is newer than the last applied sequence for a run. Duplicate
 * (<=) events are rejected so state never moves backward on out-of-order delivery.
 */
export const isNewerEvent = (lastAppliedSequence: number, incomingSequence: number): boolean =>
  incomingSequence > lastAppliedSequence;
