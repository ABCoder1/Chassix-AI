export * from "./planner.js";
export * from "./claude-planner.js";
export * from "./fake-planner.js";
export { GOAL_INTERPRETATION_SYSTEM } from "./prompt.js";
// Sonnet 4.8 reasoning over finished run results (thinking + interpretation).
export * from "./reasoner.js";

// Step 2.1 — host literature retrieval (citation-first, behind RetrievalProvider).
export * from "./retrieval/index.js";
export * from "./retrieval/caching-retrieval.js";
export * from "./retrieval/apify-retrieval.js";
// Step 2.2 — versioned, inspectable host ranking rubric + scorer.
export * from "./ranking/index.js";
// Step 2.3 — host discovery (RAG): survey → rank candidate hosts.
export * from "./discovery.js";

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

import { CachingRetrievalProvider } from "./retrieval/caching-retrieval.js";
import { FixtureRetrievalProvider } from "./retrieval/fixture-retrieval.js";
import { ApifyRetrievalProvider } from "./retrieval/apify-retrieval.js";
import type { RetrievalProvider } from "./retrieval/types.js";

/**
 * The retrieval provider for the discovery RAG step. Uses the live Apify actor (cached) when both
 * `APIFY_API_TOKEN` and `APIFY_RETRIEVAL_ACTOR` are set; otherwise the deterministic fixture
 * provider (cached), so the app runs keyless. `live` drives the UI's live-vs-illustrative label.
 */
export function createRetrievalProvider(): { provider: RetrievalProvider; live: boolean } {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_RETRIEVAL_ACTOR;
  if (token && actorId) {
    return {
      provider: new CachingRetrievalProvider(new ApifyRetrievalProvider({ token, actorId })),
      live: true,
    };
  }
  return { provider: new CachingRetrievalProvider(new FixtureRetrievalProvider()), live: false };
}
