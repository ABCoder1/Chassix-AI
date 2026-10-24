import { ExecutorStatus } from "@chassix/shared";
import type {
  ExecutorAdapter,
  ExecutorPoll,
  ExecutorSubmission,
  RunManifest,
} from "@chassix/shared";
import { CannotCancelError, UnknownExecutorRefError } from "./errors.js";

/**
 * Deterministic, in-memory executor. No network, no credentials, no clock dependence — the
 * executor Phase 3 is built on until a live engine lands (ADR-D4/D10). Every job follows a
 * scripted status sequence that `poll` walks one step at a time; the same ref polled repeatedly
 * is monotonic (it never moves backward and clamps at the final step).
 *
 * NOTE: this fabricates STATUS transitions only (which is the engine contract), never scientific
 * results — artifacts/outputs are out of scope here and validated separately (Step 3.5). That
 * keeps it within the "no fabricated results" cross-cutting rule.
 */

/** Named lifecycle scripts a job can follow. Injected per-ref for tests via {@link FakeExecutor.program}. */
export const FakeScenario = {
  /** queued → running → succeeded (default). */
  HappyPath: "happy_path",
  /** queued → running → failed. */
  ForcedFailure: "forced_failure",
  /** queued → running → cancelled (reaches cancelled via the script itself). */
  ForcedCancellation: "forced_cancellation",
  /** queued → running → unknown, then STUCK at unknown (lost heartbeat; not a failure). */
  HeartbeatLoss: "heartbeat_loss",
} as const;
export type FakeScenario = (typeof FakeScenario)[keyof typeof FakeScenario];

const SCRIPTS: Readonly<Record<FakeScenario, readonly ExecutorStatus[]>> = {
  [FakeScenario.HappyPath]: [
    ExecutorStatus.Queued,
    ExecutorStatus.Running,
    ExecutorStatus.Succeeded,
  ],
  [FakeScenario.ForcedFailure]: [
    ExecutorStatus.Queued,
    ExecutorStatus.Running,
    ExecutorStatus.Failed,
  ],
  [FakeScenario.ForcedCancellation]: [
    ExecutorStatus.Queued,
    ExecutorStatus.Running,
    ExecutorStatus.Cancelled,
  ],
  [FakeScenario.HeartbeatLoss]: [
    ExecutorStatus.Queued,
    ExecutorStatus.Running,
    ExecutorStatus.Unknown,
  ],
};

const REASONS: Readonly<Record<ExecutorStatus, string>> = {
  [ExecutorStatus.Queued]: "accepted by fake engine; awaiting start",
  [ExecutorStatus.Running]: "executing",
  [ExecutorStatus.Succeeded]: "engine exited 0 (pending artifact validation)",
  [ExecutorStatus.Failed]: "engine reported failure",
  [ExecutorStatus.Cancelled]: "cancelled",
  [ExecutorStatus.Unknown]: "heartbeat lost — connection uncertain",
};

interface FakeJob {
  readonly executorRef: string;
  readonly manifest: RunManifest;
  scenario: FakeScenario;
  /** Index into the current script; the status returned by the NEXT poll. */
  step: number;
  /** Set once cancel() is called; subsequent polls report Cancelled. */
  cancelled: boolean;
  /** Records a terminal success/failure once a poll has surfaced it (so cancel can reject it). */
  terminal: ExecutorStatus | null;
}

const isFinishedTerminal = (status: ExecutorStatus | null): boolean =>
  status === ExecutorStatus.Succeeded || status === ExecutorStatus.Failed;

export class FakeExecutor implements ExecutorAdapter {
  readonly id: string;
  readonly #jobs = new Map<string, FakeJob>();
  #seq = 0;
  readonly #defaultScenario: FakeScenario;

  constructor(opts: { id?: string; defaultScenario?: FakeScenario } = {}) {
    this.id = opts.id ?? "fake";
    this.#defaultScenario = opts.defaultScenario ?? FakeScenario.HappyPath;
  }

  async submit(manifest: RunManifest): Promise<ExecutorSubmission> {
    // Deterministic, opaque ref keyed by branch + an in-instance counter. Carries no secrets.
    const executorRef = `fake:${manifest.branchId}:${this.#seq++}`;
    this.#jobs.set(executorRef, {
      executorRef,
      manifest,
      scenario: this.#defaultScenario,
      step: 0,
      cancelled: false,
      terminal: null,
    });
    return { executorRef };
  }

  async poll(executorRef: string): Promise<ExecutorPoll> {
    const job = this.#job(executorRef);

    if (job.cancelled) {
      return this.#result(ExecutorStatus.Cancelled);
    }

    const script = SCRIPTS[job.scenario];
    // noUncheckedIndexedAccess: step is always clamped in-bounds below, but guard anyway.
    const status = script[job.step] ?? script[script.length - 1] ?? ExecutorStatus.Unknown;

    if (isFinishedTerminal(status)) {
      job.terminal = status;
    }
    // Advance for the next poll, clamped at the final step → monotonic, never regresses.
    job.step = Math.min(job.step + 1, script.length - 1);

    return this.#result(status);
  }

  async cancel(executorRef: string): Promise<void> {
    const job = this.#job(executorRef);
    if (job.cancelled) {
      return; // idempotent
    }
    if (isFinishedTerminal(job.terminal)) {
      throw new CannotCancelError(executorRef); // can't un-finish a succeeded/failed job
    }
    // Reachable from queued/running/unknown — the only non-terminal live states.
    job.cancelled = true;
  }

  /**
   * TEST-ONLY: replace a job's scripted lifecycle and reset it to the start. Lets a test force
   * failure/cancellation or a stuck heartbeat-loss after obtaining the ref from {@link submit}.
   */
  program(executorRef: string, scenario: FakeScenario): void {
    const job = this.#job(executorRef);
    job.scenario = scenario;
    job.step = 0;
    job.cancelled = false;
    job.terminal = null;
  }

  #job(executorRef: string): FakeJob {
    const job = this.#jobs.get(executorRef);
    if (!job) {
      throw new UnknownExecutorRefError(executorRef);
    }
    return job;
  }

  #result(status: ExecutorStatus): ExecutorPoll {
    // Progress is null everywhere: the fake reports stage-based status only, never a fabricated
    // percentage (PRD §6/§E — progress % only when the executor reports meaningful progress).
    return { status, progress: null, reason: REASONS[status] };
  }
}
