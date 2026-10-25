import type { GoalVersionDraft } from "@chassix/shared";

/**
 * Thin client for the Chassix API. In dev, requests go to `/api/*`, which Vite proxies to the API
 * server (see vite.config.ts) so there is no CORS. Override with `VITE_API_URL` for other setups.
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

/** Result of the goal-interpretation call (the first real pipeline step, Step 1.6). */
export interface GoalInterpretationResult {
  originalPrompt: string;
  draft: GoalVersionDraft;
  /** "anthropic" when the live planner ran, "fake" when the deterministic fallback did. */
  provider: string;
  /** True when the draft came from the fake planner (no live model) — show it as illustrative. */
  illustrative: boolean;
}

/** Interpret a plain-language goal into a structured, reviewable draft via the API planner. */
export async function interpretGoal(
  prompt: string,
  signal?: AbortSignal,
): Promise<GoalInterpretationResult> {
  const res = await fetch(`${BASE}/goals/interpret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    let message = `Goal interpretation failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string") message = body.message;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }
  return (await res.json()) as GoalInterpretationResult;
}
