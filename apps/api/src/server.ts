import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { apiError } from "@bioforge/shared";

/**
 * Builds the API server. No routes beyond /health yet — auth, RBAC, plans, runs and
 * events land in later steps. Every error response uses the shared ApiError envelope
 * (PRD §7) with a correlation id.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: false,
  });

  app.get("/health", async () => ({ status: "ok" }));

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
