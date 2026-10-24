/**
 * Run-execution dependency wiring (Phase 3, Wave 3B).
 *
 * Builds a `RunOrchestrator` over the in-memory orchestrator stack (ADR-D3): in-memory
 * repository + append-only event log, the `@chassix/executor` `FakeExecutor` as the (only)
 * seam to a workflow engine, an `InMemoryEventTransport` for live SSE fan-out, and the
 * fixture artifact-validation gate. No live database or engine is required — the whole stack
 * is pure, in-process state, mirroring how `createInMemoryRepositories` injects persistence.
 *
 * The bundle is injected into `buildServer` so tests can supply their own (e.g. a submission-
 * counting executor to assert idempotency) exactly the way `repos`/`sessions` are overridden.
 */
import {
  RunOrchestrator,
  InMemoryStore,
  InMemoryRunRepository,
  InMemoryEventLogRepository,
  InMemoryEventTransport,
  FixtureOutputValidator,
  type BranchOutputSchema,
} from "@chassix/orchestrator";
import { FakeExecutor } from "@chassix/executor";
import type { ExecutorAdapter } from "@chassix/shared";

/** Everything the run routes need: the orchestrator plus the concrete ports they read from. */
export interface RunOrchestratorBundle {
  readonly orchestrator: RunOrchestrator;
  /** Concrete transport — routes `subscribe()` to it for the live SSE tail (the port is publish-only). */
  readonly transport: InMemoryEventTransport;
  /** Persistence port — the logs projection reads attempt records directly from it. */
  readonly repo: InMemoryRunRepository;
  readonly eventLog: InMemoryEventLogRepository;
  readonly store: InMemoryStore;
  readonly executor: ExecutorAdapter;
}

export interface CreateRunOrchestratorOptions {
  /** Override the engine seam (tests inject a submission-counting fake). Defaults to `FakeExecutor`. */
  readonly executor?: ExecutorAdapter;
  /** Per-branch output contract for the Step 3.5 validation gate. Defaults to empty. */
  readonly outputSchema?: BranchOutputSchema;
}

/** Construct a fresh, fully in-memory run-orchestrator bundle. */
export function createRunOrchestrator(
  options: CreateRunOrchestratorOptions = {},
): RunOrchestratorBundle {
  const store = new InMemoryStore();
  const repo = new InMemoryRunRepository(store);
  const eventLog = new InMemoryEventLogRepository(store);
  const transport = new InMemoryEventTransport();
  const executor = options.executor ?? new FakeExecutor();
  const validator = new FixtureOutputValidator(options.outputSchema ?? {});
  const orchestrator = new RunOrchestrator({ repo, eventLog, executor, transport, validator });
  return { orchestrator, transport, repo, eventLog, store, executor };
}
