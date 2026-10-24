/**
 * The durable run orchestrator (Steps 3.2–3.6). A single DB-backed state machine that is the
 * ONE source of job truth (ADR-D3, PRD §7). It owns run/branch/attempt state, drives branch
 * transitions ONLY through the shared `canBranchTransition` guard, appends every change to an
 * append-only event log with a monotonic per-run sequence, and fans each event to live
 * subscribers via an injected `EventTransport`. The workflow engine, the database, the live
 * transport, and the artifact validator are all injected ports, so this class is pure logic
 * exercised entirely in-memory by the tests.
 *
 * Guarantees:
 *  - Idempotent launch (3.3): the client idempotency key is persisted BEFORE acknowledgement;
 *    a retried/double launch returns the same run id and submits to the executor exactly once.
 *  - Immutable manifest (3.2): each branch carries a write-once frozen `RunManifest`.
 *  - Stale/duplicate rejection (3.4): `isNewerEvent` + `canBranchTransition` keep a branch
 *    from ever moving backward on out-of-order or replayed delivery.
 *  - Artifact-validation gate (3.5): executor "succeeded" ⇒ `ValidatingOutputs`, and only a
 *    passing validation advances to `Succeeded`; a failing one records `Failed` with a reason.
 *  - Reconnect replay (3.4): `replayFrom(cursor)` is gap-free/ordered; `snapshot` is authoritative.
 *  - Reconciliation (3.3): a fresh orchestrator over the same store polls the executor for
 *    non-terminal branches and converges to the correct state.
 *  - Cancel (3.6): an explicit, AUDITED terminal `Cancelled` (never "failed"); a detached
 *    client never cancels; a cancelled/failed branch can be retried as a new attempt.
 */
import { randomUUID } from "node:crypto";
import {
  BranchState,
  ConnectivityStatus,
  canBranchTransition,
  isBranchTerminal,
  isNewerEvent,
  executorStatusToBranchState,
} from "@chassix/shared";
import type {
  ExecutorAdapter,
  ExecutorPoll,
  EventTransport,
  BranchStatusEvent,
  RunManifest,
  RunId,
  BranchId,
  AttemptId,
  WorkspaceId,
} from "@chassix/shared";
import {
  AttemptStatus,
  asRunId,
  asBranchId,
  asAttemptId,
  asArtifactId,
  type RunRepository,
  type EventLogRepository,
  type OutputValidator,
  type RunRecord,
  type BranchRecord,
  type AttemptRecord,
  type ArtifactRecord,
} from "./types.js";
import { freezeManifest } from "./manifest.js";

export class OrchestratorError extends Error {
  override readonly name = "OrchestratorError";
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface OrchestratorDeps {
  readonly repo: RunRepository;
  readonly eventLog: EventLogRepository;
  readonly executor: ExecutorAdapter;
  readonly transport: EventTransport;
  readonly validator: OutputValidator;
}

/** A branch to launch; its manifest fields are snapshotted and frozen at launch. */
export interface LaunchBranchSpec {
  readonly branchId?: string;
  readonly name: string;
  readonly inputs: RunManifest["inputs"];
  readonly parameters: Record<string, unknown>;
  readonly toolVersions: Record<string, string>;
  readonly referenceVersions: Record<string, string>;
  readonly command: string;
}

export interface LaunchRequest {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly planId: string;
  readonly idempotencyKey: string;
  readonly runId?: string;
  readonly branches: readonly LaunchBranchSpec[];
  readonly createdAt?: string;
}

export interface LaunchResult {
  readonly runId: RunId;
  /** True when an existing run was returned for the same idempotency key (no new submission). */
  readonly deduplicated: boolean;
  readonly branchIds: BranchId[];
}

export type TransitionResult =
  | { readonly applied: true; readonly event: BranchStatusEvent }
  | { readonly applied: false; readonly reason: string };

export interface RunSnapshot {
  readonly run: RunRecord;
  readonly branches: BranchRecord[];
  readonly lastSequence: number;
}

const branchStateToAttemptStatus = (state: BranchState): AttemptStatus | null => {
  switch (state) {
    case BranchState.Queued:
      return AttemptStatus.Queued;
    case BranchState.Running:
    case BranchState.ValidatingOutputs:
      return AttemptStatus.Running;
    case BranchState.Succeeded:
      return AttemptStatus.Succeeded;
    case BranchState.Failed:
      return AttemptStatus.Failed;
    case BranchState.Cancelled:
      return AttemptStatus.Cancelled;
    default:
      return null;
  }
};

/**
 * Idempotent projection of an event list into current per-branch state. Applying the same
 * events twice yields an identical result, so duplicate delivery is harmless (Step 3.4 DoD).
 */
export const projectSnapshot = (
  events: readonly BranchStatusEvent[],
): Map<string, { state: BranchState; sequence: number; reason: string }> => {
  const out = new Map<string, { state: BranchState; sequence: number; reason: string }>();
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const prev = out.get(e.branchId);
    if (!prev || e.sequence > prev.sequence) {
      out.set(e.branchId, { state: e.state, sequence: e.sequence, reason: e.reason });
    }
  }
  return out;
};

export class RunOrchestrator {
  private readonly repo: RunRepository;
  private readonly eventLog: EventLogRepository;
  private readonly executor: ExecutorAdapter;
  private readonly transport: EventTransport;
  private readonly validator: OutputValidator;

  constructor(deps: OrchestratorDeps) {
    this.repo = deps.repo;
    this.eventLog = deps.eventLog;
    this.executor = deps.executor;
    this.transport = deps.transport;
    this.validator = deps.validator;
  }

  // --- Step 3.3: launch + idempotency ---------------------------------------
  async launch(request: LaunchRequest): Promise<LaunchResult> {
    const workspaceId = request.workspaceId as WorkspaceId;

    // Idempotency: a run already exists for this key ⇒ return it, submit NOTHING (BF-06).
    const existing = await this.repo.getRunByIdempotencyKey(workspaceId, request.idempotencyKey);
    if (existing) {
      const branches = await this.repo.listBranches(existing.id);
      return { runId: existing.id, deduplicated: true, branchIds: branches.map((b) => b.id) };
    }

    const now = request.createdAt ?? new Date().toISOString();
    const runId = asRunId(request.runId ?? randomUUID());

    const run: RunRecord = {
      id: runId,
      workspaceId,
      projectId: request.projectId,
      planId: request.planId,
      idempotencyKey: request.idempotencyKey,
      version: 1,
      createdAt: now,
      startedAt: now,
      finishedAt: null,
    };

    // Persist the run (with its idempotency key) BEFORE any submission or acknowledgement.
    // createRun is atomic on the key: if a concurrent launch won the race, adopt its run.
    const created = await this.repo.createRun(run);
    if (!created.created) {
      const branches = await this.repo.listBranches(created.run.id);
      return { runId: created.run.id, deduplicated: true, branchIds: branches.map((b) => b.id) };
    }

    const branchIds: BranchId[] = [];
    // Phase 1: persist every branch + attempt + frozen manifest BEFORE talking to the engine.
    const prepared: BranchRecord[] = [];
    for (const spec of request.branches) {
      const branchId = asBranchId(spec.branchId ?? randomUUID());
      const attemptId = asAttemptId(randomUUID());
      const manifest = freezeManifest({
        runId,
        branchId,
        branch: spec.name,
        inputs: spec.inputs,
        parameters: spec.parameters,
        toolVersions: spec.toolVersions,
        referenceVersions: spec.referenceVersions,
        command: spec.command,
        createdAt: now,
      });
      const branch: BranchRecord = {
        id: branchId,
        runId,
        workspaceId,
        name: spec.name,
        state: BranchState.Ready, // plan passed review gates before launch (PRD §6)
        connectivity: ConnectivityStatus.Connected,
        sequence: 0,
        reason: null,
        currentAttemptId: attemptId,
        executorRef: null,
        manifest,
      };
      const attempt: AttemptRecord = {
        id: attemptId,
        runId,
        branchId,
        workspaceId,
        attemptNumber: 1,
        status: AttemptStatus.Queued,
        reason: null,
        executorRef: null,
        startedAt: null,
        finishedAt: null,
      };
      await this.repo.saveBranch(branch);
      await this.repo.saveAttempt(attempt);
      prepared.push(branch);
      branchIds.push(branchId);
    }

    await this.repo.recordAudit({
      id: randomUUID(),
      workspaceId,
      runId,
      actorUserId: null,
      action: "run.launch",
      targetType: "run",
      targetId: runId,
      payload: { idempotencyKey: request.idempotencyKey, branchCount: request.branches.length },
      createdAt: now,
    });

    // Phase 2: queue + submit. State is already durable, so a crash here reconciles cleanly.
    for (const branch of prepared) {
      const queued = await this.driveTransition(branch, BranchState.Queued, "queued for execution");
      // Submit exactly once per branch. The run key is already persisted, so this never doubles.
      const submission = await this.executor.submit(branch.manifest);
      const current = await this.getBranchOrThrow(branch.id);
      await this.repo.saveBranch({ ...current, executorRef: submission.executorRef });
      const attempt = (await this.repo.listAttempts(branch.id)).find(
        (a) => a.id === current.currentAttemptId,
      );
      if (attempt) {
        await this.repo.saveAttempt({ ...attempt, executorRef: submission.executorRef });
      }
      void queued;
    }

    return { runId, deduplicated: false, branchIds };
  }

  // --- Step 3.4/3.5: ingest executor status + artifact gate ------------------
  /** Drive a branch from a normalized executor poll. Handles the Validating-outputs gate. */
  async applyExecutorStatus(branchId: BranchId, poll: ExecutorPoll): Promise<TransitionResult> {
    const branch = await this.getBranchOrThrow(branchId);
    const target = executorStatusToBranchState[poll.status];

    // `unknown` = lost heartbeat ⇒ "Connection uncertain" overlay, NOT a state change (PRD §6).
    if (target === null) {
      await this.repo.saveBranch({
        ...branch,
        connectivity: ConnectivityStatus.ConnectionUncertain,
      });
      return { applied: false, reason: "connection-uncertain" };
    }

    if (target === BranchState.ValidatingOutputs) {
      // Raw executor "succeeded": validate outputs BEFORE recording success (Step 3.5).
      // Reconciliation may observe success while we still think the branch is Queued (it ran
      // and finished during an outage): catch up through Running so no legal step is skipped.
      let branchNow = branch;
      if (branchNow.state === BranchState.Queued) {
        const toRunning = await this.driveTransition(
          branchNow,
          BranchState.Running,
          "reconciled: branch was running",
        );
        if (!toRunning.applied) return toRunning;
        branchNow = await this.getBranchOrThrow(branchId);
      }
      const enter = await this.driveTransition(
        branchNow,
        BranchState.ValidatingOutputs,
        poll.reason || "executor reported success; validating outputs",
      );
      if (!enter.applied) return enter;
      return this.runValidationGate(branchId);
    }

    return this.driveTransition(branch, target, poll.reason);
  }

  /** Record artifacts for a branch's current attempt (hash-verified inputs to the gate). */
  async reportArtifacts(
    branchId: BranchId,
    artifacts: ReadonlyArray<{
      kind: string;
      checksum?: string | null;
      storageUri?: string | null;
      sizeBytes?: number | null;
      available?: boolean;
    }>,
  ): Promise<void> {
    const branch = await this.getBranchOrThrow(branchId);
    const records: ArtifactRecord[] = artifacts.map((a) => ({
      id: asArtifactId(randomUUID()),
      runId: branch.runId,
      branchId: branch.id,
      attemptId: branch.currentAttemptId,
      workspaceId: branch.workspaceId,
      kind: a.kind,
      checksum: a.checksum ?? null,
      storageUri: a.storageUri ?? null,
      sizeBytes: a.sizeBytes ?? null,
      available: a.available ?? true,
    }));
    await this.repo.addArtifacts(records);
  }

  /** Run the artifact-validation gate: ValidatingOutputs → Succeeded | Failed (Step 3.5). */
  async runValidationGate(branchId: BranchId): Promise<TransitionResult> {
    const branch = await this.getBranchOrThrow(branchId);
    if (branch.state !== BranchState.ValidatingOutputs) {
      return { applied: false, reason: "branch-not-validating-outputs" };
    }
    const artifacts = await this.repo.listArtifacts(branch.currentAttemptId);
    const result = await this.validator.validate({ branch: branch.name, artifacts });
    if (result.valid) {
      return this.driveTransition(branch, BranchState.Succeeded, "artifacts validated");
    }
    // Exit-0-but-invalid-artifact ⇒ Failed with a reason (retry remains possible).
    return this.driveTransition(branch, BranchState.Failed, result.reason);
  }

  /**
   * Ingest an EXTERNALLY-sequenced status event (e.g. an engine webhook). Rejected if it is
   * stale/duplicate (`isNewerEvent`) or an illegal/backward transition (`canBranchTransition`).
   */
  async ingestStatusEvent(incoming: {
    branchId: BranchId;
    state: BranchState;
    sequence: number;
    reason?: string;
  }): Promise<TransitionResult> {
    const branch = await this.getBranchOrThrow(incoming.branchId);
    if (!isNewerEvent(branch.sequence, incoming.sequence)) {
      return { applied: false, reason: "stale-or-duplicate" };
    }
    if (!canBranchTransition(branch.state, incoming.state)) {
      return { applied: false, reason: "illegal-transition" };
    }
    const event = await this.commit(
      branch,
      incoming.state,
      incoming.reason ?? null,
      incoming.sequence,
    );
    return { applied: true, event };
  }

  // --- Step 3.6: cancel + retry ---------------------------------------------
  /** Explicit cancel of a branch (or every non-terminal branch of a run). Audited terminal. */
  async cancel(
    runId: RunId,
    opts: { branchId?: BranchId; actorUserId?: string } = {},
  ): Promise<{ cancelledBranchIds: BranchId[] }> {
    const targets = opts.branchId
      ? [await this.getBranchOrThrow(opts.branchId)]
      : (await this.repo.listBranches(runId)).filter((b) => !isBranchTerminal(b.state));

    const cancelledBranchIds: BranchId[] = [];
    for (const branch of targets) {
      if (isBranchTerminal(branch.state)) continue;
      // A branch mid-validation cannot be force-cancelled backward; it is left to finish.
      if (!canBranchTransition(branch.state, BranchState.Cancelled)) continue;

      if (branch.executorRef) await this.executor.cancel(branch.executorRef);
      const actor = opts.actorUserId ?? "system";
      const result = await this.driveTransition(
        branch,
        BranchState.Cancelled,
        `cancelled by ${actor}`,
      );
      if (result.applied) {
        await this.repo.recordAudit({
          id: randomUUID(),
          workspaceId: branch.workspaceId,
          runId,
          actorUserId: opts.actorUserId ?? null,
          action: "branch.cancel",
          targetType: "branch",
          targetId: branch.id,
          payload: { previousState: branch.state },
          createdAt: new Date().toISOString(),
        });
        cancelledBranchIds.push(branch.id);
      }
    }
    return { cancelledBranchIds };
  }

  /** Retry a terminal (failed/cancelled) branch as a NEW attempt, retaining prior attempts. */
  async retryBranch(
    runId: RunId,
    branchId: BranchId,
    opts: { actorUserId?: string } = {},
  ): Promise<AttemptId> {
    const branch = await this.getBranchOrThrow(branchId);
    if (branch.state !== BranchState.Failed && branch.state !== BranchState.Cancelled) {
      throw new OrchestratorError(
        "retry-not-allowed",
        `only a failed or cancelled branch can be retried (was '${branch.state}')`,
      );
    }
    const attempts = await this.repo.listAttempts(branchId);
    const nextNumber = attempts.reduce((m, a) => Math.max(m, a.attemptNumber), 0) + 1;
    const attemptId = asAttemptId(randomUUID());
    const now = new Date().toISOString();

    await this.repo.saveAttempt({
      id: attemptId,
      runId,
      branchId,
      workspaceId: branch.workspaceId,
      attemptNumber: nextNumber,
      status: AttemptStatus.Queued,
      reason: null,
      executorRef: null,
      startedAt: null,
      finishedAt: null,
    });

    // New-attempt re-entry: a terminal branch (terminal → [] in the transition map) re-enters
    // the lifecycle at Queued under the NEW attempt id. This is deliberately NOT a
    // canBranchTransition — it's a new attempt, not a backward move of the old one.
    const sequence = (await this.eventLog.lastSequence(runId)) + 1;
    const reentered: BranchRecord = {
      ...branch,
      currentAttemptId: attemptId,
      state: BranchState.Queued,
      sequence,
      reason: `retry (attempt ${nextNumber})`,
      executorRef: null,
      connectivity: ConnectivityStatus.Connected,
    };
    await this.commit(reentered, BranchState.Queued, reentered.reason, sequence);

    const submission = await this.executor.submit(branch.manifest);
    const afterSubmit = await this.getBranchOrThrow(branchId);
    await this.repo.saveBranch({ ...afterSubmit, executorRef: submission.executorRef });
    await this.repo.saveAttempt({
      id: attemptId,
      runId,
      branchId,
      workspaceId: branch.workspaceId,
      attemptNumber: nextNumber,
      status: AttemptStatus.Queued,
      reason: null,
      executorRef: submission.executorRef,
      startedAt: null,
      finishedAt: null,
    });
    await this.repo.recordAudit({
      id: randomUUID(),
      workspaceId: branch.workspaceId,
      runId,
      actorUserId: opts.actorUserId ?? null,
      action: "branch.retry",
      targetType: "branch",
      targetId: branchId,
      payload: { attemptNumber: nextNumber, attemptId },
      createdAt: now,
    });
    return attemptId;
  }

  // --- Step 3.3/3.4: reconciliation + reconnect -----------------------------
  /**
   * Reconcile local state after a (simulated) restart: poll the executor for every
   * non-terminal branch and apply the result. State was persisted before ack, so a new
   * orchestrator over the same store recovers without duplicate submissions.
   */
  async reconcile(runId: RunId): Promise<RunSnapshot> {
    const branches = (await this.repo.listBranches(runId)).filter(
      (b) => !isBranchTerminal(b.state) && b.executorRef,
    );
    for (const branch of branches) {
      const poll = await this.executor.poll(branch.executorRef as string);
      await this.applyExecutorStatus(branch.id, poll);
    }
    return this.snapshot(runId);
  }

  /** A client disconnecting (closed tab) NEVER cancels a remote job (PRD §E, Step 3.3 DoD). */
  async clientDisconnected(runId: RunId): Promise<RunSnapshot> {
    // Intentionally a no-op on job state: closing a client is not a cancel.
    return this.snapshot(runId);
  }

  /** Authoritative current state of a run (the refresh/snapshot endpoint, Step 3.4). */
  async snapshot(runId: RunId): Promise<RunSnapshot> {
    const run = await this.repo.getRun(runId);
    if (!run) throw new OrchestratorError("run-not-found", `run '${runId}' not found`);
    const branches = await this.repo.listBranches(runId);
    const lastSequence = await this.eventLog.lastSequence(runId);
    return { run, branches, lastSequence };
  }

  /** Gap-free, ordered replay of events after a cursor (reconnect, Step 3.4). */
  async replayFrom(runId: RunId, afterSequence: number): Promise<BranchStatusEvent[]> {
    const events = await this.eventLog.listForRun(runId);
    return events.filter((e) => e.sequence > afterSequence);
  }

  // --- internals ------------------------------------------------------------
  private async getBranchOrThrow(branchId: BranchId): Promise<BranchRecord> {
    const branch = await this.repo.getBranch(branchId);
    if (!branch) throw new OrchestratorError("branch-not-found", `branch '${branchId}' not found`);
    return branch;
  }

  /** Guarded transition: rejects any illegal/backward move via `canBranchTransition`. */
  private async driveTransition(
    branch: BranchRecord,
    toState: BranchState,
    reason: string | null,
  ): Promise<TransitionResult> {
    if (!canBranchTransition(branch.state, toState)) {
      return { applied: false, reason: "illegal-transition" };
    }
    const sequence = (await this.eventLog.lastSequence(branch.runId)) + 1;
    const event = await this.commit(branch, toState, reason, sequence);
    return { applied: true, event };
  }

  /** Append the event, persist the branch+attempt, publish. The single mutation choke point. */
  private async commit(
    branch: BranchRecord,
    toState: BranchState,
    reason: string | null,
    sequence: number,
  ): Promise<BranchStatusEvent> {
    const now = new Date().toISOString();
    const event: BranchStatusEvent = {
      runId: branch.runId,
      branchId: branch.id,
      attemptId: branch.currentAttemptId,
      eventId: randomUUID(),
      sequence,
      timestamp: now,
      state: toState,
      reason: reason ?? "",
    };
    // Append to the authoritative log FIRST (persistence before acknowledgement).
    await this.eventLog.append(event);
    await this.repo.saveBranch({
      ...branch,
      state: toState,
      sequence,
      reason,
      connectivity: ConnectivityStatus.Connected,
    });

    const attempt = (await this.repo.listAttempts(branch.id)).find(
      (a) => a.id === branch.currentAttemptId,
    );
    if (attempt) {
      const mappedStatus = branchStateToAttemptStatus(toState);
      await this.repo.saveAttempt({
        ...attempt,
        status: mappedStatus ?? attempt.status,
        reason: reason ?? attempt.reason,
        startedAt: toState === BranchState.Running && !attempt.startedAt ? now : attempt.startedAt,
        finishedAt: isBranchTerminal(toState) ? now : attempt.finishedAt,
      });
    }

    await this.transport.publish(event);
    return event;
  }
}
