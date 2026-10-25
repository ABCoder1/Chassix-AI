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
import { createRunOrchestrator, type RunOrchestratorBundle } from "./runs/service.js";
import type { BundleSource } from "./runs/bundle.js";

export interface BuildServerOptions {
  /** Persistence ports. Defaults to in-memory repositories (no Postgres needed). */
  repos?: Repositories;
  /** Session signing secret. Defaults to `JWT_SECRET`, else an ephemeral dev secret. */
  sessionSecret?: string;
  /** Pre-built session manager (overrides `sessionSecret`); mainly for tests. */
  sessions?: SessionManager;
  /** Run orchestrator bundle (in-memory stack + FakeExecutor). Defaults to a fresh one; override for tests. */
  orchestrator?: RunOrchestratorBundle;
  /** Supplies ingested analysis fragments for the run bundle endpoint. Defaults to none ingested. */
  bundleSource?: BundleSource;
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

  const orchestrator = options.orchestrator ?? createRunOrchestrator();

  app.register(cookie);

  const guards = createAuthGuards({ repos, sessions });

  app.get("/health", async () => ({ status: "ok" }));

  registerAuthRoutes(app, { repos, sessions, guards });
  registerWorkspaceRoutes(app, { repos, guards });
  registerRunRoutes(app, {
    guards,
    bundle: orchestrator,
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
