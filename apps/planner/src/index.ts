export * from "./planner.js";
export * from "./claude-planner.js";
export * from "./fake-planner.js";
export { GOAL_INTERPRETATION_SYSTEM } from "./prompt.js";

// Step 2.1 — host literature retrieval (citation-first, behind RetrievalProvider).
export * from "./retrieval/index.js";
// Step 2.2 — versioned, inspectable host ranking rubric + scorer.
export * from "./ranking/index.js";

import { type Planner } from "./planner.js";
import { ClaudePlanner } from "./claude-planner.js";
import { FakePlanner } from "./fake-planner.js";

/**
 * Returns the live Claude-backed planner when ANTHROPIC_API_KEY is configured, otherwise the
 * deterministic fake so the app still boots and tests run without a key.
 */
export function createPlanner(): Planner {
  return process.env.ANTHROPIC_API_KEY ? new ClaudePlanner() : new FakePlanner();
}
