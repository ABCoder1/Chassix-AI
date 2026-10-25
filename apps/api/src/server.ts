import { randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { apiError } from "@chassix/shared";
import { createSessionManager, type SessionManager } from "./auth/session.js";
import { createAuthGuards } from "./context.js";
import { createInMemoryRepositories } from "./repositories/memory.js";
import type { Repositories } from "./repositories/types.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerGoalRoutes } from "./routes/goals.js";
import { registerDiscoveryRoutes } from "./routes/discovery.js";
import {
  createPlanner,
  CachingRetrievalProvider,
  FixtureRetrievalProvider,
  type Planner,
  type RetrievalProvider,
} from "@chassix/planner";
import { DatasetService, FixtureRepositoryAdapter } from "@chassix/datasets";
import {
  createRunOrchestratorProvider,
  providerFromBundle,
  type CreateRunOrchestratorProviderOptions,
  type RunOrchestratorBundle,
  type RunOrchestratorProvider,
} from "./runs/service.js";
import type { BundleSource } from "./runs/bundle.js";
import type { DbClient } from "@chassix/db";
import type { ExecutorAdapter } from "@chassix/shared";

export interface BuildServerOptions {
  /** Persistence ports. Defaults to in-memory repositories (no Postgres needed). */
  repos?: Repositories;
  /** Session signing secret. Defaults to `JWT_SECRET`, else an ephemeral dev secret. */
  sessionSecret?: string;
  /** Pre-built session manager (overrides `sessionSecret`); mainly for tests. */
  sessions?: SessionManager;
  /** Run orchestrator bundle (in-memory stack + FakeExecutor). Overrides the provider; tests pass this. */
  orchestrator?: RunOrchestratorBundle;
  /** Full provider override (advanced/tests). Takes precedence over `orchestrator` and `dbClient`. */
  runProvider?: RunOrchestratorProvider;
  /** When set (and no override above), runs + the event log persist to Postgres per workspace. */
  dbClient?: DbClient;
  /** Engine seam for the run provider (e.g. the live GcpBatchExecutor). Defaults to FakeExecutor. */
  executor?: ExecutorAdapter;
  /** Supplies ingested analysis fragments for the run bundle endpoint. Defaults to none ingested. */
  bundleSource?: BundleSource;
  /** Goal-interpretation planner. Defaults to the live Claude planner when keyed, else the fake. */
  planner?: Planner;
  /** Literature-retrieval provider for discovery. Defaults to a cached fixture provider. */
  retrieval?: RetrievalProvider;
  /** Dataset discovery service. Defaults to a fixture-backed service. */
  datasetService?: DatasetService;
}

/**
 * Builds the API server. Auth, workspaces and RBAC (Step 1.4 / BF-14) are wired here; plans,
 * runs and events land in later steps. Every error response uses the shared ApiError envelope
 * (PRD §7) with a correlation id. Secrets are read server-side only and never logged.
 */
export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: false,
  });

  const repos = options.repos ?? createInMemoryRepositories();
  const sessions =
    options.sessions ??
    createSessionManager(
      options.sessionSecret ?? process.env.JWT_SECRET ?? randomBytes(32).toString("hex"),
    );

  // Resolve the run-orchestrator provider: explicit override > test bundle > DB/executor-backed.
  const providerOpts: CreateRunOrchestratorProviderOptions = {
    ...(options.dbClient ? { dbClient: options.dbClient } : {}),
    ...(options.executor ? { executor: options.executor } : {}),
  };
  const runProvider: RunOrchestratorProvider =
    options.runProvider ??
    (options.orchestrator
      ? providerFromBundle(options.orchestrator)
      : createRunOrchestratorProvider(providerOpts));

  app.register(cookie);

  const guards = createAuthGuards({ repos, sessions });

  app.get("/health", async () => ({ status: "ok" }));

  // Goal interpretation (landing page → planner). Injected planner ⇒ illustrative (fake); the
  // default is live only when ANTHROPIC_API_KEY is set (same condition createPlanner() uses).
  const planner = options.planner ?? createPlanner();
  const plannerLive = options.planner ? false : Boolean(process.env.ANTHROPIC_API_KEY);

  // Discovery (RAG): literature survey (cached) + candidate hosts/datasets. Fixture-backed by
  // default (illustrative); a live Apify retriever (ADR-D9) can be injected behind the interface.
  const retrieval =
    options.retrieval ?? new CachingRetrievalProvider(new FixtureRetrievalProvider());
  const datasetService =
    options.datasetService ?? new DatasetService(new FixtureRepositoryAdapter());

  registerAuthRoutes(app, { repos, sessions, guards });
  registerWorkspaceRoutes(app, { repos, guards });
  registerGoalRoutes(app, { planner, live: plannerLive });
  registerDiscoveryRoutes(app, { retrieval, datasets: datasetService, live: false });
  registerRunRoutes(app, {
    guards,
    provider: runProvider,
    ...(options.bundleSource ? { bundleSource: options.bundleSource } : {}),
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(
      apiError("NOT_FOUND", `No route for ${req.method} ${req.url}.`, {
        retryable: false,
        correlationId: req.id,
      }),
    );
  });

  app.setErrorHandler((err, req, reply) => {
    reply.status(500).send(
      apiError("INTERNAL", "Something went wrong. Please retry.", {
        retryable: true,
        correlationId: req.id,
        details: { name: err.name },
      }),
    );
  });

  return app;
}
