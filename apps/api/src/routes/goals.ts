/**
 * Goal-interpretation API (Step 1.6 / BF-01, PRD §A) — the first real pipeline step behind the
 * landing page. `POST /goals/interpret` runs the planner on a plain-language prompt and returns a
 * schema-valid GoalVersion draft (extracted/assumed/unknown fields, clarifying questions — never
 * fabricated). It is intentionally UNAUTHENTICATED: the welcome screen runs before login and this
 * endpoint only interprets (no persistence, no workspace). Persisting a GoalVersion happens later,
 * once the user is in a workspace/project.
 *
 * The planner is injected (project rule: credentials behind interfaces), so tests run against the
 * deterministic FakePlanner with no Anthropic key; `illustrative` is true whenever the fake is used.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "@chassix/shared";
import type { AgentMemoryStore, Planner } from "@chassix/planner";

const interpretSchema = z.object({ prompt: z.string().min(1).max(4000) });

export interface GoalRouteDeps {
  planner: Planner;
  /** True when the planner is the live (Anthropic-backed) one; drives the `illustrative` flag. */
  live: boolean;
  /** Optional agentic memory (Moss) — the interpreted goal is remembered best-effort. */
  memory?: AgentMemoryStore;
}

export const registerGoalRoutes = (
  app: FastifyInstance,
  { planner, live, memory }: GoalRouteDeps,
): void => {
  app.post("/goals/interpret", async (req, reply) => {
    const parsed = interpretSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("VALIDATION", "A non-empty goal prompt (max 4000 chars) is required.", {
          retryable: false,
          correlationId: req.id,
        }),
      );
    }
    try {
      const draft = await planner.interpretGoal(parsed.data.prompt);
      // Remember this interpretation as an agent-memory state (best-effort, non-blocking).
      void memory?.remember({
        id: `goal:${req.id}`,
        text: `Objective: ${parsed.data.prompt}\nInterpreted goal: ${JSON.stringify(draft)}`,
        metadata: {
          kind: "goal",
          provider: live ? "anthropic" : "fake",
          at: new Date().toISOString(),
        },
      });
      return reply.status(200).send({
        originalPrompt: parsed.data.prompt,
        draft,
        provider: live ? "anthropic" : "fake",
        illustrative: !live,
      });
    } catch {
      return reply.status(502).send(
        apiError("PLANNER_FAILED", "Could not interpret the goal right now. Please retry.", {
          retryable: true,
          correlationId: req.id,
        }),
      );
    }
  });
};
