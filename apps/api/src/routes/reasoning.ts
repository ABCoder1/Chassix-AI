/**
 * Results-reasoning API — `POST /reasoning`. Takes a compact summary of a finished run's analysis
 * bundle(s) and returns Claude Sonnet 4.8's extended thinking plus a concise interpretation, so the
 * dashboard can show the model reasoning about the flux maps / multi-omics results at the bottom.
 *
 * Unauthenticated like /goals/interpret (it only reasons over the posted summary, no persistence).
 * The reasoner is injected; when no ANTHROPIC_API_KEY is configured it is null and the route returns
 * a clear 503 rather than fabricating analysis.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "@chassix/shared";
import type { AgentMemoryStore, ResultsReasoner } from "@chassix/planner";

const reasoningSchema = z.object({ summary: z.string().min(1).max(20000) });

export interface ReasoningRouteDeps {
  reasoner: ResultsReasoner | null;
  /** Optional agentic memory (Moss) — recall related prior reasoning, then store this one. */
  memory?: AgentMemoryStore;
}

export const registerReasoningRoutes = (
  app: FastifyInstance,
  { reasoner, memory }: ReasoningRouteDeps,
): void => {
  app.post("/reasoning", async (req, reply) => {
    if (!reasoner) {
      return reply.status(503).send(
        apiError("REASONER_UNAVAILABLE", "Model reasoning is not configured on this server.", {
          retryable: false,
          correlationId: req.id,
        }),
      );
    }
    const parsed = reasoningSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("VALIDATION", "A non-empty results summary (max 20000 chars) is required.", {
          retryable: false,
          correlationId: req.id,
        }),
      );
    }
    try {
      // Recall semantically-related prior reasoning from agent memory and give it to the model.
      const priors = (await memory?.recall(parsed.data.summary, { topK: 3 })) ?? [];
      const summary =
        priors.length > 0
          ? `${parsed.data.summary}\n\n--- Related prior analyses from memory (for context only) ---\n` +
            priors.map((p, i) => `(${i + 1}) ${p.text}`).join("\n")
          : parsed.data.summary;

      const result = await reasoner.reason(summary);

      // Remember this reasoning as an agent-memory state (best-effort, non-blocking).
      void memory?.remember({
        id: `reasoning:${req.id}`,
        text: `Results summary: ${parsed.data.summary}\nInterpretation: ${result.text}`,
        metadata: { kind: "reasoning", model: result.model, at: new Date().toISOString() },
      });

      return reply.status(200).send(result);
    } catch {
      return reply.status(502).send(
        apiError(
          "REASONING_FAILED",
          "Could not reason about the results right now. Please retry.",
          {
            retryable: true,
            correlationId: req.id,
          },
        ),
      );
    }
  });
};
