/**
 * Host discovery (the RAG step, BF-02 / PRD §B): take the user's objective, run a citation-first
 * literature survey, and rank candidate hosts from the retrieved evidence — advisory only, with
 * every claim traceable to a cited passage. This composes the retrieval provider (Step 2.1) and the
 * ranking rubric (Step 2.2); it fabricates nothing (empty retrieval → explicit empty discovery).
 */
import type { Citation, RetrievalProvider } from "./retrieval/index.js";
import {
  DEFAULT_RUBRIC,
  rankHosts,
  toHostEvidence,
  type HostScore,
  type Rubric,
} from "./ranking/index.js";

/** One candidate host: its rubric score plus the exact citations supporting it. */
export interface DiscoveredHost {
  readonly host: string;
  readonly score: HostScore;
  /** The accessible, read citations attributed to this host (the evidence behind the score). */
  readonly citations: readonly Citation[];
}

export interface HostDiscovery {
  readonly query: string;
  readonly retrievalDate: string;
  /** True when no accessible evidence yielded a rankable host — an explicit empty state. */
  readonly isEmpty: boolean;
  /** Ranked candidate hosts (advisory; user selects). */
  readonly hosts: readonly DiscoveredHost[];
  /** Surfaced-but-not-read sources (paywalled/unavailable) — never counted as evidence. */
  readonly inaccessible: readonly Citation[];
  readonly duplicatesRemoved: number;
  readonly note?: string;
}

export interface DiscoverHostsInput {
  readonly query: string;
  /** Optional cap on evidence citations retrieved (after dedupe). */
  readonly limit?: number;
}

/** Survey the literature for the objective and rank candidate hosts from the cited evidence. */
export async function discoverHosts(
  provider: RetrievalProvider,
  input: DiscoverHostsInput,
  rubric: Rubric = DEFAULT_RUBRIC,
): Promise<HostDiscovery> {
  const result = await provider.retrieve({
    text: input.query,
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  });

  // One ranked candidate per distinct host that has accessible, read evidence.
  const hostNames = [...new Set(result.evidence.map((c) => c.host))];
  const evidence = hostNames.map((host) => toHostEvidence(host, result.evidence));
  const scores = rankHosts(evidence, rubric);
  const hosts: DiscoveredHost[] = scores.map((score) => ({
    host: score.host,
    score,
    citations: result.evidence.filter((c) => c.host === score.host),
  }));

  return {
    query: result.query,
    retrievalDate: result.retrievalDate,
    isEmpty: result.isEmpty || hosts.length === 0,
    hosts,
    inaccessible: result.inaccessible,
    duplicatesRemoved: result.duplicatesRemoved,
    ...(result.note !== undefined ? { note: result.note } : {}),
  };
}
