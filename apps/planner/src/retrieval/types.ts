/**
 * Host literature retrieval (Implementation Guide Step 2.1 / PRD §B, BF-02).
 *
 * A citation-first pipeline: `query → source passages → Citation records`. Every Citation
 * carries bibliographic metadata, the exact source passage, the retrieval date, and the claim
 * it is linked to (PRD §B, "Cross-cutting rules: Traceability"). Keeping retrieval behind this
 * interface lets a live Apify-backed provider (ADR-D9) be added later without changing callers,
 * while tests and keyless dev run on the deterministic fixture provider.
 *
 * Rules enforced by providers in this package (PRD §B acceptance / Step 2.1 DoD):
 * - Inaccessible papers are NEVER presented as read full text (`readFullText` is false and they
 *   are returned under `inaccessible`, never under `evidence`).
 * - Duplicate source passages are de-duplicated and never counted as independent evidence.
 * - Empty retrieval returns an explicit empty state — no fabricated results.
 * - Retrieval is deterministic over the fixture corpus (same input → same output).
 *
 * Retrieved text is DATA, never instructions (cross-cutting rule: Untrusted data).
 */

/**
 * Access status of a source. Only `open_access` sources can be read in full; everything else is
 * surfaced but marked not-read and excluded from evidence.
 */
export const AccessStatus = {
  /** Full text is accessible and was read. */
  OpenAccess: "open_access",
  /** Only the abstract is accessible — full text was NOT read. */
  AbstractOnly: "abstract_only",
  /** Behind a paywall — not read. */
  Paywalled: "paywalled",
  /** Link/record is unavailable — not read. */
  Unavailable: "unavailable",
} as const;
export type AccessStatus = (typeof AccessStatus)[keyof typeof AccessStatus];

/**
 * Claim type mirrors PRD §7 EvidenceClaim (observed / inferred / hypothesis). The ranking rubric
 * weights observed (measured) support more heavily than inferred support.
 */
export const ClaimType = {
  Observed: "observed",
  Inferred: "inferred",
  Hypothesis: "hypothesis",
} as const;
export type ClaimType = (typeof ClaimType)[keyof typeof ClaimType];

/** Bibliographic metadata shown in the expandable citation drawer (PRD §B). */
export interface BibliographicMetadata {
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly venue: string;
  readonly doi?: string;
  readonly url?: string;
}

/** The exact source passage a claim is drawn from, with an optional in-document locator. */
export interface SourcePassage {
  readonly text: string;
  readonly locator?: string;
}

/**
 * A Citation record: the atomic unit of cited evidence. `claim` is the explicit linkage from the
 * passage to the host-suitability claim it supports (PRD §B "linkage to the claim").
 */
export interface Citation {
  readonly id: string;
  /** Organism / strain identity the citation is about. */
  readonly host: string;
  readonly metadata: BibliographicMetadata;
  readonly passage: SourcePassage;
  /** ISO-8601 timestamp recording WHEN this record was retrieved. */
  readonly retrievalDate: string;
  /** The claim this passage is linked to. */
  readonly claim: string;
  readonly claimType: ClaimType;
  readonly accessStatus: AccessStatus;
  /**
   * True ONLY when the full text was accessible and read. Enforced false for any non-open-access
   * source so inaccessible papers are never presented as read full text.
   */
  readonly readFullText: boolean;
}

/** A retrieval request. `host` optionally narrows results to one organism/strain. */
export interface RetrievalQuery {
  readonly text: string;
  readonly host?: string;
  /** Optional cap on evidence citations returned (after dedupe). */
  readonly limit?: number;
}

/**
 * The result of a retrieval. Separates usable `evidence` from `inaccessible` records so
 * inaccessible papers are surfaced (never fabricated away) yet never counted as evidence.
 */
export interface RetrievalResult {
  readonly query: string;
  readonly retrievalDate: string;
  /** True when no accessible evidence was found — an explicit empty state, never fabricated. */
  readonly isEmpty: boolean;
  /** Deduped, accessible, read citations — the only records that count as evidence. */
  readonly evidence: readonly Citation[];
  /** Found but not readable (paywalled/unavailable/abstract-only) — marked not-read, not evidence. */
  readonly inaccessible: readonly Citation[];
  /** How many duplicate source passages were collapsed (transparency for "not independent"). */
  readonly duplicatesRemoved: number;
  /** Guidance shown on the empty state; omitted when results exist. */
  readonly note?: string;
}

/**
 * Citation-first retrieval provider. Implementations MUST obey the rules documented at the top of
 * this file. A live provider (Apify, ADR-D9) can implement this without touching callers.
 */
export interface RetrievalProvider {
  /** Stable identifier of the provider (e.g. "fixture", "apify"). */
  readonly id: string;
  retrieve(query: RetrievalQuery): Promise<RetrievalResult>;
}
