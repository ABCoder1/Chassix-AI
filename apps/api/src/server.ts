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

export interface BuildServerOptions {
  /** Persistence ports. Defaults to in-memory repositories (no Postgres needed). */
  repos?: Repositories;
  /** Session signing secret. Defaults to `JWT_SECRET`, else an ephemeral dev secret. */
  sessionSecret?: string;
  /** Pre-built session manager (overrides `sessionSecret`); mainly for tests. */
  sessions?: SessionManager;
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

  app.register(cookie);

  const guards = createAuthGuards({ repos, sessions });

  app.get("/health", async () => ({ status: "ok" }));

  registerAuthRoutes(app, { repos, sessions, guards });
  registerWorkspaceRoutes(app, { repos, guards });

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
