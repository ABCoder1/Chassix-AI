/**
 * Durable-orchestrator domain types and repository PORTS (Steps 3.2–3.6).
 *
 * The orchestrator is the single DB-backed source of job truth (ADR-D3, PRD §7). These
 * types describe the records it persists (run / branch / attempt / artifact / audit) and
 * the append-only status-event log, plus the ports it depends on so neither the live
 * database, the workflow engine, nor the live event transport is baked in:
 *
 *   - `RunRepository`      — run/branch/attempt/artifact/audit persistence.
 *   - `EventLogRepository` — append-only, per-run monotonic status-event log (ADR-D8).
 *   - `ExecutorAdapter`    — the only seam to the workflow engine (shared).
 *   - `EventTransport`     — fans events to live subscribers (shared).
 *   - `OutputValidator`    — artifact-validation gate (Step 3.5, see `validation.ts`).
 *
 * All ports are async so the in-memory impls (used by every test) and the Drizzle-backed
 * impl share one interface. No `zod`/`drizzle-orm` imports here: those are not dependencies
 * of this app — only `@chassix/shared`, `@chassix/db`, and node built-ins are.
 */
import { asId } from "@chassix/shared";
import type {
  Brand,
  WorkspaceId,
  RunId,
  BranchId,
  AttemptId,
  ArtifactId,
  BranchState,
  ConnectivityStatus,
  RunManifest,
  BranchStatusEvent,
} from "@chassix/shared";

export type ProjectId = Brand<string, "ProjectId">;
export type PlanId = Brand<string, "PlanId">;

export const asRunId = (v: string): RunId => asId<"RunId">(v);
export const asBranchId = (v: string): BranchId => asId<"BranchId">(v);
export const asAttemptId = (v: string): AttemptId => asId<"AttemptId">(v);
export const asArtifactId = (v: string): ArtifactId => asId<"ArtifactId">(v);
export const asWorkspaceId = (v: string): WorkspaceId => asId<"WorkspaceId">(v);

/** One run — an immutable launch of a reviewed plan (PRD §D). */
export interface RunRecord {
  readonly id: RunId;
  readonly workspaceId: WorkspaceId;
  readonly projectId: string;
  readonly planId: string;
  /** Client-generated idempotency key, PERSISTED before the launch is acknowledged (BF-06). */
  readonly idempotencyKey: string;
  readonly version: number;
  readonly createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** One branch within a run; its state machine is PRD §6 (`BranchState`). */
export interface BranchRecord {
  readonly id: BranchId;
  readonly runId: RunId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  state: BranchState;
  connectivity: ConnectivityStatus;
  /** Last applied monotonic per-run sequence — the stale/duplicate guard (BF-06/BF-13). */
  sequence: number;
  reason: string | null;
  currentAttemptId: AttemptId;
  /** Opaque engine handle from the executor; null until submitted. */
  executorRef: string | null;
  /** Write-once frozen manifest for this branch (Step 3.2). */
  readonly manifest: RunManifest;
}

export const AttemptStatus = {
  Queued: "queued",
  Running: "running",
  Succeeded: "succeeded",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
export type AttemptStatus = (typeof AttemptStatus)[keyof typeof AttemptStatus];

/** One execution of a branch. Attempt id is unique per (branch, retry) (BF-06). */
export interface AttemptRecord {
  readonly id: AttemptId;
  readonly runId: RunId;
  readonly branchId: BranchId;
  readonly workspaceId: WorkspaceId;
  readonly attemptNumber: number;
  status: AttemptStatus;
  reason: string | null;
  executorRef: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

/** A produced output; the artifact-validation gate (Step 3.5) checks these before Succeeded. */
export interface ArtifactRecord {
  readonly id: ArtifactId;
  readonly runId: RunId;
  readonly branchId: BranchId;
  readonly attemptId: AttemptId;
  readonly workspaceId: WorkspaceId;
  readonly kind: string;
  readonly checksum: string | null;
  readonly storageUri: string | null;
  readonly sizeBytes: number | null;
  readonly available: boolean;
}

/** Audited action (cancel/retry/launch). Cancellation is an AUDITED terminal state (§8). */
export interface AuditRecord {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly runId: RunId;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly payload: Record<string, unknown> | null;
  readonly createdAt: string;
}

/**
 * Run/branch/attempt/artifact/audit persistence port. `createRun` is atomic on the
 * idempotency key so a double launch can never create two runs (BF-06).
 */
export interface RunRepository {
  getRunByIdempotencyKey(workspaceId: WorkspaceId, key: string): Promise<RunRecord | null>;
  /** Insert the run iff its idempotency key is unused. `created=false` ⇒ key already taken. */
  createRun(run: RunRecord): Promise<{ created: boolean; run: RunRecord }>;
  getRun(runId: RunId): Promise<RunRecord | null>;
  saveRun(run: RunRecord): Promise<void>;

  saveBranch(branch: BranchRecord): Promise<void>;
  getBranch(branchId: BranchId): Promise<BranchRecord | null>;
  listBranches(runId: RunId): Promise<BranchRecord[]>;

  saveAttempt(attempt: AttemptRecord): Promise<void>;
  listAttempts(branchId: BranchId): Promise<AttemptRecord[]>;

  addArtifacts(artifacts: readonly ArtifactRecord[]): Promise<void>;
  listArtifacts(attemptId: AttemptId): Promise<ArtifactRecord[]>;

  recordAudit(entry: AuditRecord): Promise<void>;
  listAudits(runId: RunId): Promise<AuditRecord[]>;
}

/**
 * Append-only, per-run status-event log (ADR-D8). The authoritative sequence cursor for
 * reconnect replay (Step 3.4). NOTE: `@chassix/db` has no `run_events` table yet, so the
 * only implementation today is in-memory (see report / follow-up).
 */
export interface EventLogRepository {
  append(event: BranchStatusEvent): Promise<void>;
  /** Events for a run, ordered by ascending `sequence` (gap-free, monotonic). */
  listForRun(runId: RunId): Promise<BranchStatusEvent[]>;
  /** Highest applied sequence for a run, or 0 when the run has no events yet. */
  lastSequence(runId: RunId): Promise<number>;
}

/** Result of a validation of a branch's outputs against its output schema (Step 3.5). */
export type ValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Artifact-validation gate port. Executor exit-0 is NOT success: outputs must validate
 * against the branch output schema before `Succeeded` is recorded (Step 3.5, PRD §F).
 */
export interface OutputValidator {
  validate(input: {
    readonly branch: string;
    readonly artifacts: readonly ArtifactRecord[];
  }): Promise<ValidationResult>;
}
