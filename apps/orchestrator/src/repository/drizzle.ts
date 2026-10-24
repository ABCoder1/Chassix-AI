/**
 * Drizzle-backed `RunRepository` over `@chassix/db` (ADR-D3 "one source of job truth").
 *
 * Workspace-bound: every query goes through `WorkspaceScope`, so cross-workspace access is
 * impossible at the query layer (Step 1.2 DoD). It uses only the Drizzle client exported by
 * `@chassix/db` — no direct `drizzle-orm` import (not a dependency of this app).
 *
 * SCHEMA GAP (reported as a follow-up): the current `@chassix/db` schema has no column for the
 * orchestrator's per-branch `manifest` / `executorRef` / `currentAttemptId`, no `attempts`
 * `executor_ref`, and no `run_events` table. Until a migration adds them, this adapter:
 *   - inserts the core identity/state of each run/branch/attempt/artifact into the typed tables
 *     (so the relational model is populated and queryable), and
 *   - journals the FULL typed record append-only into the one available JSONB column,
 *     `audit_events.payload` (latest row wins), from which reads are rehydrated.
 * Appends never `UPDATE`, so no single-row `WHERE id = ?` predicate (which would need
 * `drizzle-orm` operators) is required. When the migration lands, the journal collapses into
 * ordinary typed columns + a real `run_events` table.
 *
 * Note: insert values are built as named `const`s before being passed (the same pattern the
 * `@chassix/api` repositories use) to avoid TypeScript's fresh-object-literal excess-property
 * check against the Drizzle insert model.
 */
import { runs, branches, attempts, artifacts, auditEvents, WorkspaceScope } from "@chassix/db";
import type { DbClient } from "@chassix/db";
import type {
  RunRepository,
  RunRecord,
  BranchRecord,
  AttemptRecord,
  ArtifactRecord,
  AuditRecord,
} from "../types.js";
import type { RunId, BranchId, AttemptId, WorkspaceId } from "@chassix/shared";

/** Reserved journal actions (not real audit events — see module doc). */
const J = {
  run: "__journal_run__",
  branch: "__journal_branch__",
  attempt: "__journal_attempt__",
  artifact: "__journal_artifact__",
} as const;

export class DrizzleRunRepository implements RunRepository {
  private readonly scope: WorkspaceScope;

  constructor(
    client: DbClient,
    private readonly workspaceId: WorkspaceId,
  ) {
    this.scope = new WorkspaceScope(client.db, workspaceId);
  }

  /** Append a full-record JSON snapshot into the journal (latest row wins on read). */
  private async journal(action: string, targetId: string, record: unknown): Promise<void> {
    const values = {
      actorUserId: null,
      action,
      targetType: action,
      targetId,
      correlationId: null,
      payload: record as Record<string, unknown>,
    };
    await this.scope.insert(auditEvents, values);
  }

  /** Read the latest journalled record for an entity, filtered by a predicate. */
  private async readJournal<T>(action: string, match: (r: T) => boolean): Promise<T[]> {
    const rows = await this.scope.select(auditEvents);
    const latest = new Map<string, { at: number; value: T }>();
    for (const row of rows) {
      if (row.action !== action) continue;
      const value = row.payload as T;
      if (!value || !match(value)) continue;
      const key = row.targetId ?? "";
      const at = row.createdAt instanceof Date ? row.createdAt.getTime() : 0;
      const prev = latest.get(key);
      if (!prev || at >= prev.at) latest.set(key, { at, value });
    }
    return [...latest.values()].map((e) => e.value);
  }

  async getRunByIdempotencyKey(workspaceId: WorkspaceId, key: string): Promise<RunRecord | null> {
    if (workspaceId !== this.workspaceId) return null;
    const found = await this.readJournal<RunRecord>(J.run, (r) => r.idempotencyKey === key);
    return found[0] ?? null;
  }

  async createRun(run: RunRecord): Promise<{ created: boolean; run: RunRecord }> {
    const existing = await this.getRunByIdempotencyKey(run.workspaceId, run.idempotencyKey);
    if (existing) return { created: false, run: existing };
    // Typed identity row (idempotency uniqueness is also enforced by the DB unique index).
    const values = {
      projectId: run.projectId,
      planId: run.planId,
      version: run.version,
      idempotencyKey: run.idempotencyKey,
      startedAt: run.startedAt ? new Date(run.startedAt) : null,
      finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
    };
    await this.scope.insert(runs, values).onConflictDoNothing();
    await this.journal(J.run, run.id, run);
    return { created: true, run };
  }

  async getRun(runId: RunId): Promise<RunRecord | null> {
    const found = await this.readJournal<RunRecord>(J.run, (r) => r.id === runId);
    return found[0] ?? null;
  }

  async saveRun(run: RunRecord): Promise<void> {
    await this.journal(J.run, run.id, run);
  }

  async saveBranch(branch: BranchRecord): Promise<void> {
    const exists = (await this.readJournal<BranchRecord>(J.branch, (b) => b.id === branch.id))[0];
    if (!exists) {
      const values = {
        runId: branch.runId,
        name: branch.name,
        state: branch.state,
        connectivity: branch.connectivity,
        sequence: branch.sequence,
        reason: branch.reason,
      };
      await this.scope.insert(branches, values).onConflictDoNothing();
    }
    await this.journal(J.branch, branch.id, branch);
  }

  async getBranch(branchId: BranchId): Promise<BranchRecord | null> {
    const found = await this.readJournal<BranchRecord>(J.branch, (b) => b.id === branchId);
    return found[0] ?? null;
  }

  async listBranches(runId: RunId): Promise<BranchRecord[]> {
    return this.readJournal<BranchRecord>(J.branch, (b) => b.runId === runId);
  }

  async saveAttempt(attempt: AttemptRecord): Promise<void> {
    const exists = (
      await this.readJournal<AttemptRecord>(J.attempt, (a) => a.id === attempt.id)
    )[0];
    if (!exists) {
      const values = {
        runId: attempt.runId,
        branchId: attempt.branchId,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        reason: attempt.reason,
        startedAt: attempt.startedAt ? new Date(attempt.startedAt) : null,
        finishedAt: attempt.finishedAt ? new Date(attempt.finishedAt) : null,
      };
      await this.scope.insert(attempts, values).onConflictDoNothing();
    }
    await this.journal(J.attempt, attempt.id, attempt);
  }

  async listAttempts(branchId: BranchId): Promise<AttemptRecord[]> {
    const list = await this.readJournal<AttemptRecord>(J.attempt, (a) => a.branchId === branchId);
    return list.sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  async addArtifacts(records: readonly ArtifactRecord[]): Promise<void> {
    for (const a of records) {
      const values = {
        runId: a.runId,
        branchId: a.branchId,
        attemptId: a.attemptId,
        kind: a.kind,
        checksum: a.checksum,
        storageUri: a.storageUri,
        sizeBytes: a.sizeBytes,
        available: a.available,
      };
      await this.scope.insert(artifacts, values).onConflictDoNothing();
      await this.journal(J.artifact, a.id, a);
    }
  }

  async listArtifacts(attemptId: AttemptId): Promise<ArtifactRecord[]> {
    return this.readJournal<ArtifactRecord>(J.artifact, (a) => a.attemptId === attemptId);
  }

  async recordAudit(entry: AuditRecord): Promise<void> {
    // A REAL audit event (distinct from the journal). runId travels in correlationId.
    const values = {
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      correlationId: entry.runId,
      payload: entry.payload,
    };
    await this.scope.insert(auditEvents, values);
  }

  async listAudits(runId: RunId): Promise<AuditRecord[]> {
    const rows = await this.scope.select(auditEvents);
    return rows
      .filter((r) => r.correlationId === runId && !r.action.startsWith("__journal_"))
      .map((r) => ({
        id: r.id,
        workspaceId: this.workspaceId,
        runId,
        actorUserId: r.actorUserId ?? null,
        action: r.action,
        targetType: r.targetType ?? null,
        targetId: r.targetId ?? null,
        payload: (r.payload as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }));
  }
}
