import type { Rubric } from "./types.js";

/**
 * Rubric criterion ids. Stable keys the scorer and UI share.
 */
export const CriterionId = {
  EvidenceCoverage: "evidence_coverage",
  MeasuredSupport: "measured_support",
  Consistency: "consistency",
  Freshness: "freshness",
} as const;
export type CriterionId = (typeof CriterionId)[keyof typeof CriterionId];

/** Target number of supporting sources at which evidence coverage saturates (illustrative). */
export const COVERAGE_TARGET = 3;
/** Freshness decays to 0 over this many years (illustrative). */
export const FRESHNESS_WINDOW_YEARS = 10;

/**
 * Rubric v1 — the initial illustrative weighting (ADR-D10 pending sign-off).
 * Frozen: a weight change must be published as a NEW version, never a mutation.
 */
export const RUBRIC_V1: Rubric = Object.freeze({
  version: "v1",
  description: "Initial illustrative host-suitability rubric (balanced coverage/measured support).",
  illustrative: true,
  criteria: Object.freeze([
    Object.freeze({
      id: CriterionId.EvidenceCoverage,
      label: "Evidence coverage",
      description: "Breadth of accessible, deduped supporting sources.",
      weight: 0.35,
    }),
    Object.freeze({
      id: CriterionId.MeasuredSupport,
      label: "Measured support",
      description: "Share of support from observed/measured claims vs inferred.",
      weight: 0.25,
    }),
    Object.freeze({
      id: CriterionId.Consistency,
      label: "Consistency",
      description: "Absence of conflicting findings across sources.",
      weight: 0.2,
    }),
    Object.freeze({
      id: CriterionId.Freshness,
      label: "Freshness",
      description: "Recency of the newest supporting source.",
      weight: 0.2,
    }),
  ]),
}) as Rubric;

/**
 * Rubric v2 — an illustrative re-weighting that favors measured support and freshness. Demonstrates
 * that weights are revised only by producing a NEW immutable version; v1 remains inspectable.
 */
export const RUBRIC_V2: Rubric = Object.freeze({
  version: "v2",
  description:
    "Illustrative re-weighting favoring measured support and freshness over raw coverage.",
  illustrative: true,
  criteria: Object.freeze([
    Object.freeze({
      id: CriterionId.EvidenceCoverage,
      label: "Evidence coverage",
      description: "Breadth of accessible, deduped supporting sources.",
      weight: 0.2,
    }),
    Object.freeze({
      id: CriterionId.MeasuredSupport,
      label: "Measured support",
      description: "Share of support from observed/measured claims vs inferred.",
      weight: 0.4,
    }),
    Object.freeze({
      id: CriterionId.Consistency,
      label: "Consistency",
      description: "Absence of conflicting findings across sources.",
      weight: 0.1,
    }),
    Object.freeze({
      id: CriterionId.Freshness,
      label: "Freshness",
      description: "Recency of the newest supporting source.",
      weight: 0.3,
    }),
  ]),
}) as Rubric;

/** All published rubric versions, keyed by version string. Immutable. */
export const RUBRICS: Readonly<Record<string, Rubric>> = Object.freeze({
  [RUBRIC_V1.version]: RUBRIC_V1,
  [RUBRIC_V2.version]: RUBRIC_V2,
});

/** The current default rubric version used when a caller does not pick one. */
export const DEFAULT_RUBRIC = RUBRIC_V1;

/** Look up a published rubric by version; returns undefined for an unknown version. */
export const getRubric = (version: string): Rubric | undefined => RUBRICS[version];
