/**
 * In-memory implementations of the orchestrator ports. Used by EVERY test (no live DB) and
 * by a single-process dev server. State is held in plain Maps; a fresh orchestrator built
 * over the SAME store instance sees all persisted state — that is how "survives process
 * restart" is simulated (Step 3.3 reconciliation test).
 *
 * All mutations deep-clone on the way in and out so callers cannot accidentally mutate stored
 * records by reference — the store behaves like a real persistence boundary.
 */
import type {
  RunRepository,
  EventLogRepository,
  RunRecord,
  BranchRecord,
  AttemptRecord,
  ArtifactRecord,
  AuditRecord,
} from "../types.js";
import type { RunId, BranchId, AttemptId, WorkspaceId, BranchStatusEvent } from "@chassix/shared";

const clone = <T>(v: T): T => structuredClone(v);

/** Durable store shared across orchestrator instances to simulate a restart over one DB. */
export class InMemoryStore {
  readonly runs = new Map<string, RunRecord>();
  readonly branches = new Map<string, BranchRecord>();
  readonly attempts = new Map<string, AttemptRecord>();
  readonly artifacts = new Map<string, ArtifactRecord>();
  readonly audits: AuditRecord[] = [];
  readonly events = new Map<string, BranchStatusEvent[]>();
}

export class InMemoryRunRepository implements RunRepository {
  constructor(private readonly store: InMemoryStore = new InMemoryStore()) {}

  get backingStore(): InMemoryStore {
    return this.store;
  }

  async getRunByIdempotencyKey(workspaceId: WorkspaceId, key: string): Promise<RunRecord | null> {
    for (const run of this.store.runs.values()) {
      if (run.workspaceId === workspaceId && run.idempotencyKey === key) return clone(run);
    }
    return null;
  }

  async createRun(run: RunRecord): Promise<{ created: boolean; run: RunRecord }> {
    // Atomic check-and-set on (workspace, idempotency key): a concurrent/double launch with
    // the same key never inserts twice (synchronous = no interleaving in the test runtime).
    const existing = await this.getRunByIdempotencyKey(run.workspaceId, run.idempotencyKey);
    if (existing) return { created: false, run: existing };
    this.store.runs.set(run.id, clone(run));
    return { created: true, run: clone(run) };
  }

  async getRun(runId: RunId): Promise<RunRecord | null> {
    const run = this.store.runs.get(runId);
    return run ? clone(run) : null;
  }

  async saveRun(run: RunRecord): Promise<void> {
    this.store.runs.set(run.id, clone(run));
  }

  async saveBranch(branch: BranchRecord): Promise<void> {
    this.store.branches.set(branch.id, clone(branch));
  }

  async getBranch(branchId: BranchId): Promise<BranchRecord | null> {
    const b = this.store.branches.get(branchId);
    return b ? clone(b) : null;
  }

  async listBranches(runId: RunId): Promise<BranchRecord[]> {
    return [...this.store.branches.values()].filter((b) => b.runId === runId).map(clone);
  }

  async saveAttempt(attempt: AttemptRecord): Promise<void> {
    this.store.attempts.set(attempt.id, clone(attempt));
  }

  async listAttempts(branchId: BranchId): Promise<AttemptRecord[]> {
    return [...this.store.attempts.values()]
      .filter((a) => a.branchId === branchId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map(clone);
  }

  async addArtifacts(artifacts: readonly ArtifactRecord[]): Promise<void> {
    for (const a of artifacts) this.store.artifacts.set(a.id, clone(a));
  }

  async listArtifacts(attemptId: AttemptId): Promise<ArtifactRecord[]> {
    return [...this.store.artifacts.values()].filter((a) => a.attemptId === attemptId).map(clone);
  }

  async recordAudit(entry: AuditRecord): Promise<void> {
    this.store.audits.push(clone(entry));
  }

  async listAudits(runId: RunId): Promise<AuditRecord[]> {
    return this.store.audits.filter((e) => e.runId === runId).map(clone);
  }
}

/** Append-only per-run event log (ADR-D8). Rejects nothing itself — ordering/stale guards
 * are enforced by the orchestrator before it appends; this is the durable sink. */
export class InMemoryEventLogRepository implements EventLogRepository {
  constructor(private readonly store: InMemoryStore = new InMemoryStore()) {}

  async append(event: BranchStatusEvent): Promise<void> {
    const list = this.store.events.get(event.runId) ?? [];
    list.push(clone(event));
    list.sort((a, b) => a.sequence - b.sequence);
    this.store.events.set(event.runId, list);
  }

  async listForRun(runId: RunId): Promise<BranchStatusEvent[]> {
    return (this.store.events.get(runId) ?? []).map(clone);
  }

  async lastSequence(runId: RunId): Promise<number> {
    const list = this.store.events.get(runId);
    if (!list || list.length === 0) return 0;
    return list.reduce((max, e) => (e.sequence > max ? e.sequence : max), 0);
  }
}
