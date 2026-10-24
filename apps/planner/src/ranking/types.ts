/**
 * Host ranking rubric (Implementation Guide Step 2.2 / PRD §B, BF-02).
 *
 * The rubric is a VERSIONED, INSPECTABLE set of criterion weights. It produces a per-host score
 * plus an explicit "suitability estimate" label — this is NOT a probability of experimental
 * success (PRD §B). Rules enforced in code:
 * - the rubric version is recorded on every score;
 * - weights are revisable only by producing a NEW, immutable rubric version;
 * - missing data is surfaced as an indicator, never silently imputed;
 * - ranking is advisory — no host is silently selected.
 *
 * Rubric weights are ILLUSTRATIVE pending ADR-D10 scientific-owner sign-off.
 */

/** A single weighted criterion. `weight` is a share of the rubric's total weight. */
export interface RubricCriterion {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly weight: number;
}

/**
 * An immutable rubric version. Once published, a rubric is never mutated; a weight change is a new
 * version (e.g. "v1" → "v2"). `illustrative` is always true until ADR-D10 sign-off.
 */
export interface Rubric {
  readonly version: string;
  readonly description: string;
  readonly illustrative: true;
  readonly criteria: readonly RubricCriterion[];
}

/** Evidence aggregated for one host, the scorer's input. Derived from retrieval or supplied directly. */
export interface HostEvidence {
  readonly host: string;
  /** Count of accessible, deduped supporting sources (never counts inaccessible or duplicates). */
  readonly supportingSourceCount: number;
  /** Of those, how many carry an observed/measured claim (vs inferred/hypothesis). */
  readonly observedSupportCount: number;
  /** Human-readable conflicting findings (PRD §B "conflicting findings"). */
  readonly conflictingFindings: readonly string[];
  /** Newest supporting-source year, or null when unknown — null surfaces as missing freshness data. */
  readonly newestSourceYear: number | null;
  /** Reference ("current") year used for freshness decay. */
  readonly referenceYear: number;
}

/** Score for one criterion. `value: null` is an explicit missing-data indicator (never imputed). */
export interface CriterionScore {
  readonly criterionId: string;
  readonly label: string;
  readonly weight: number;
  /** 0..1, or null when the underlying data is missing. */
  readonly value: number | null;
  /** Why this value (or why it is missing). */
  readonly note: string;
}

/**
 * The suitability estimate label. Deliberately qualitative — NOT a probability of success.
 */
export const SuitabilityLabel = {
  Strong: "strong",
  Moderate: "moderate",
  Limited: "limited",
  /** No accessible supporting evidence — cannot estimate suitability. */
  InsufficientEvidence: "insufficient_evidence",
} as const;
export type SuitabilityLabel = (typeof SuitabilityLabel)[keyof typeof SuitabilityLabel];

/**
 * A host's score under a specific rubric version. Carries everything the host card and citation
 * drawer need (PRD §B): evidence coverage, rationale, tradeoffs, supporting source count,
 * conflicting findings, freshness, and surfaced missing data.
 */
export interface HostScore {
  readonly host: string;
  /** The rubric version this score was produced under — recorded on every score. */
  readonly rubricVersion: string;
  /** Weighted score over AVAILABLE criteria, 0..1. */
  readonly score: number;
  /** Qualitative suitability estimate — NOT a probability of experimental success. */
  readonly suitabilityLabel: SuitabilityLabel;
  /** Explicit marker that `score`/`suitabilityLabel` are an estimate, not a success probability. */
  readonly isSuitabilityEstimate: true;
  /** Ranking is advisory; selection is user-controlled (PRD §B). */
  readonly advisory: true;
  readonly supportingSourceCount: number;
  readonly conflictingFindings: readonly string[];
  readonly freshness: {
    readonly newestSourceYear: number | null;
    readonly yearsStale: number | null;
  };
  readonly rationale: string;
  readonly tradeoffs: readonly string[];
  /** Per-criterion breakdown, inspectable in the UI. */
  readonly criterionScores: readonly CriterionScore[];
  /** Criterion ids whose data was missing (surfaced, not imputed). */
  readonly missingData: readonly string[];
}
