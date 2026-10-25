/**
 * Run-execution dependency wiring (Phase 3, Wave 3B; DB-backed in a later pass).
 *
 * Builds a `RunOrchestrator` over the orchestrator stack (ADR-D3). Two backends:
 *   - in-memory (default, and what every test uses): in-memory repo + event log + transport,
 *     the `FakeExecutor`, and the fixture validator. No database required.
 *   - Drizzle/Supabase: when a `DbClient` is supplied, runs/branches/attempts and the
 *     append-only event log persist to Postgres. Because the Drizzle repositories are
 *     workspace-scoped (cross-workspace access impossible at the query layer), a DB-backed
 *     orchestrator is built PER REQUEST for the caller's workspace — see `RunOrchestratorProvider`.
 *
 * The live event transport is always the in-memory `InMemoryEventTransport`: it fans events to
 * SSE subscribers in THIS process and is shared across requests. Durable replay comes from the
 * (now persistent) event log, so a reconnect still replays gap-free from Postgres.
 */
import {
  RunOrchestrator,
  InMemoryStore,
  InMemoryRunRepository,
  InMemoryEventLogRepository,
  InMemoryEventTransport,
  DrizzleRunRepository,
  DrizzleEventLogRepository,
  FixtureOutputValidator,
  asWorkspaceId,
  type RunRepository,
  type EventLogRepository,
  type BranchOutputSchema,
} from "@chassix/orchestrator";
import { FakeExecutor } from "@chassix/executor";
import type { DbClient } from "@chassix/db";
import type { ExecutorAdapter } from "@chassix/shared";

/** Everything the run routes need for one workspace: the orchestrator plus its concrete ports. */
export interface RunOrchestratorBundle {
  readonly orchestrator: RunOrchestrator;
  /** Shared live transport — routes `subscribe()` to it for the SSE tail (the port is publish-only). */
  readonly transport: InMemoryEventTransport;
  /** Persistence port — the logs projection reads attempt records directly from it. */
  readonly repo: RunRepository;
  readonly eventLog: EventLogRepository;
  readonly executor: ExecutorAdapter;
  /** Present only for the in-memory backend (used by tests that simulate a restart). */
  readonly store?: InMemoryStore;
}

/**
 * Supplies a run-orchestrator bundle per request. The transport is shared (process-wide SSE
 * fan-out); `getBundle(workspaceId)` returns either the single in-memory bundle (ignoring the
 * id) or a freshly-scoped Drizzle bundle for that workspace.
 */
export interface RunOrchestratorProvider {
  readonly transport: InMemoryEventTransport;
  getBundle(workspaceId: string): RunOrchestratorBundle;
}

export interface CreateRunOrchestratorOptions {
  /** Override the engine seam (tests inject a submission-counting fake). Defaults to `FakeExecutor`. */
  readonly executor?: ExecutorAdapter;
  /** Per-branch output contract for the Step 3.5 validation gate. Defaults to empty. */
  readonly outputSchema?: BranchOutputSchema;
}

/** Construct a fresh, fully in-memory run-orchestrator bundle (used directly by tests). */
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

/** Wrap an already-built bundle as a provider that returns it for every workspace (tests). */
export function providerFromBundle(bundle: RunOrchestratorBundle): RunOrchestratorProvider {
  return { transport: bundle.transport, getBundle: () => bundle };
}

export interface CreateRunOrchestratorProviderOptions extends CreateRunOrchestratorOptions {
  /** When set, runs + the event log persist to Postgres, scoped per request workspace. */
  readonly dbClient?: DbClient;
}

/**
 * Build the provider the API uses. With a `dbClient`, each `getBundle` builds a workspace-scoped
 * Drizzle orchestrator over a shared transport/executor/validator; without one, a single in-memory
 * bundle is shared across all workspaces (the prior behavior, and what tests rely on).
 */
export function createRunOrchestratorProvider(
  options: CreateRunOrchestratorProviderOptions = {},
): RunOrchestratorProvider {
  const transport = new InMemoryEventTransport();
  const executor = options.executor ?? new FakeExecutor();
  const validator = new FixtureOutputValidator(options.outputSchema ?? {});

  if (options.dbClient) {
    const client = options.dbClient;
    return {
      transport,
      getBundle(workspaceId: string): RunOrchestratorBundle {
        const wsId = asWorkspaceId(workspaceId);
        const repo = new DrizzleRunRepository(client, wsId);
        const eventLog = new DrizzleEventLogRepository(client, wsId);
        const orchestrator = new RunOrchestrator({
          repo,
          eventLog,
          executor,
          transport,
          validator,
        });
        return { orchestrator, transport, repo, eventLog, executor };
      },
    };
  }

  const store = new InMemoryStore();
  const repo = new InMemoryRunRepository(store);
  const eventLog = new InMemoryEventLogRepository(store);
  const orchestrator = new RunOrchestrator({ repo, eventLog, executor, transport, validator });
  const bundle: RunOrchestratorBundle = {
    orchestrator,
    transport,
    repo,
    eventLog,
    store,
    executor,
  };
  return { transport, getBundle: () => bundle };
}
