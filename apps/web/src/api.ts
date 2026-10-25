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

/** A cited source behind a host recommendation. */
export interface CitationDTO {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  year: number | null;
  doi: string | null;
  url: string | null;
  passage: string;
  claim: string;
  claimType: string;
  accessStatus: string;
  readFullText: boolean;
  retrievalDate: string;
}

/** A ranked candidate host (advisory; the user selects). */
export interface DiscoveredHostDTO {
  id: string;
  host: string;
  score: number;
  suitabilityLabel: string;
  isSuitabilityEstimate: true;
  advisory: true;
  supportingSources: number;
  conflictingFindings: string[];
  freshness: { newestSourceYear: number | null; yearsStale: number | null };
  rationale: string;
  tradeoffs: string[];
  missingData: string[];
  citations: CitationDTO[];
}

/** A candidate dataset the user can select to feed the analysis. */
export interface DatasetCandidateDTO {
  id: string;
  accession: string;
  modality: string;
  source: string;
  repository: string | null;
  availability: string;
  licenseAccess: string;
  assay: string | null;
  taxonomy: string | null;
  sourceLink: string | null;
}

/** Result of the discovery (RAG) call: literature survey → candidate hosts + datasets. */
export interface DiscoveryResult {
  query: string;
  retrievalDate: string;
  providerId: string;
  illustrative: boolean;
  isEmpty: boolean;
  note?: string;
  hosts: DiscoveredHostDTO[];
  inaccessibleCount: number;
  datasets: { fromCache: boolean; note?: string; records: DatasetCandidateDTO[] };
}

/** Run discovery for an objective: survey the literature (cached) and rank candidate hosts/datasets. */
export async function discover(objective: string, signal?: AbortSignal): Promise<DiscoveryResult> {
  const res = await fetch(`${BASE}/discovery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: objective }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`Discovery failed (${res.status}).`);
  return (await res.json()) as DiscoveryResult;
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
