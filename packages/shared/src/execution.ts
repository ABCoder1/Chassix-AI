import { z } from "zod";
import { BranchState } from "./state.js";

/**
 * Execution contracts (Phase 3). The seam between the orchestrator (owns run/branch/attempt
 * state) and the executor (talks to the workflow engine). Kept here so neither service imports
 * the other's internals. No node-only imports (shared is also bundled for the web client):
 * manifest hashing lives on the node side (executor/orchestrator), this only carries the hash.
 */

/** Normalized executor status, mapped onto the PRD §6 BranchState by the orchestrator. */
export const ExecutorStatus = {
  Queued: "queued",
  Running: "running",
  Succeeded: "succeeded",
  Failed: "failed",
  Cancelled: "cancelled",
  /** Lost heartbeat / indeterminate — NOT an automatic failure (PRD §6). */
  Unknown: "unknown",
} as const;
export type ExecutorStatus = (typeof ExecutorStatus)[keyof typeof ExecutorStatus];

/** Normalized executor status → branch state. `unknown` maps to no state change (null). */
export const executorStatusToBranchState: Readonly<Record<ExecutorStatus, BranchState | null>> = {
  [ExecutorStatus.Queued]: BranchState.Queued,
  [ExecutorStatus.Running]: BranchState.Running,
  // Succeeded is recorded by the orchestrator only AFTER artifact validation (Step 3.5),
  // so a raw executor "succeeded" advances to ValidatingOutputs, not Succeeded.
  [ExecutorStatus.Succeeded]: BranchState.ValidatingOutputs,
  [ExecutorStatus.Failed]: BranchState.Failed,
  [ExecutorStatus.Cancelled]: BranchState.Cancelled,
  [ExecutorStatus.Unknown]: null,
};

/**
 * Immutable, write-once workflow manifest (BF-05 / Step 3.2). Snapshots everything needed to
 * reproduce a run; `manifestHash` is computed over the canonical form by the node-side writer.
 */
export const RunManifestSchema = z.object({
  runId: z.string().min(1),
  branchId: z.string().min(1),
  branch: z.string().min(1),
  inputs: z.array(z.object({ datasetVersionId: z.string().min(1), checksum: z.string().min(1) })),
  parameters: z.record(z.unknown()),
  toolVersions: z.record(z.string()),
  referenceVersions: z.record(z.string()),
  command: z.string(),
  createdAt: z.string().datetime(),
  manifestHash: z.string().min(1),
});
export type RunManifest = z.infer<typeof RunManifestSchema>;

export interface ExecutorSubmission {
  /** Opaque handle the executor returns; the only thing the engine is addressed by. */
  executorRef: string;
}

export interface ExecutorPoll {
  status: ExecutorStatus;
  /** 0..1 only when the engine reports meaningful progress; otherwise null (use stage names). */
  progress: number | null;
  reason: string;
}

/**
 * The only code path that talks to a workflow engine (Step 3.1). Credentials stay server-side;
 * the orchestrator calls submit → poll → cancel and never addresses the engine directly.
 */
export interface ExecutorAdapter {
  readonly id: string;
  submit(manifest: RunManifest): Promise<ExecutorSubmission>;
  poll(executorRef: string): Promise<ExecutorPoll>;
  cancel(executorRef: string): Promise<void>;
}

/**
 * Transport for publishing run-status events to live subscribers (Step 3.4). The authoritative
 * append-only log lives in Postgres; a transport fans the same events out for real-time client
 * sync. The pilot uses an in-memory transport in tests and a SpaceTimeDB-backed transport for
 * live subscriptions (sponsor integration); SSE remains an alternative behind this same seam.
 */
export interface EventTransport {
  publish(event: import("./events.js").BranchStatusEvent): Promise<void>;
}
