import { AccessStatus, ClaimType, type Citation } from "../retrieval/types.js";
import { CriterionId, COVERAGE_TARGET, DEFAULT_RUBRIC, FRESHNESS_WINDOW_YEARS } from "./rubric.js";
import {
  type CriterionScore,
  type HostEvidence,
  type HostScore,
  type Rubric,
  SuitabilityLabel,
} from "./types.js";

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Compute the 0..1 value for one criterion from a host's evidence, or null when the data needed is
 * missing (surfaced as a missing-data indicator — never imputed as 0).
 */
function criterionValue(id: string, ev: HostEvidence): { value: number | null; note: string } {
  switch (id) {
    case CriterionId.EvidenceCoverage: {
      // Count is always known (zero is data, not missing).
      const value = clamp01(ev.supportingSourceCount / COVERAGE_TARGET);
      return {
        value,
        note: `${ev.supportingSourceCount} accessible, deduped supporting source(s).`,
      };
    }
    case CriterionId.MeasuredSupport: {
      if (ev.supportingSourceCount === 0) {
        return {
          value: null,
          note: "No supporting sources — measured-support share cannot be assessed.",
        };
      }
      const value = clamp01(ev.observedSupportCount / ev.supportingSourceCount);
      return {
        value,
        note: `${ev.observedSupportCount}/${ev.supportingSourceCount} support(s) are observed/measured.`,
      };
    }
    case CriterionId.Consistency: {
      const n = ev.conflictingFindings.length;
      const value = clamp01(1 - 0.34 * n);
      return {
        value,
        note:
          n === 0 ? "No conflicting findings." : `${n} conflicting finding(s) reduce consistency.`,
      };
    }
    case CriterionId.Freshness: {
      if (ev.newestSourceYear === null) {
        return { value: null, note: "Newest source year unknown — freshness cannot be assessed." };
      }
      const yearsStale = Math.max(0, ev.referenceYear - ev.newestSourceYear);
      const value = clamp01(1 - yearsStale / FRESHNESS_WINDOW_YEARS);
      return { value, note: `Newest supporting source is ${yearsStale} year(s) old.` };
    }
    default:
      return { value: null, note: "Unknown criterion — no data." };
  }
}

/** Derive a qualitative suitability estimate. NOT a probability of experimental success. */
function suitabilityLabel(score: number, ev: HostEvidence): SuitabilityLabel {
  if (ev.supportingSourceCount === 0) return SuitabilityLabel.InsufficientEvidence;
  if (score >= 0.7) return SuitabilityLabel.Strong;
  if (score >= 0.45) return SuitabilityLabel.Moderate;
  return SuitabilityLabel.Limited;
}

function buildRationale(
  ev: HostEvidence,
  label: SuitabilityLabel,
  missing: readonly string[],
): string {
  if (ev.supportingSourceCount === 0) {
    return `No accessible supporting evidence for ${ev.host}; suitability cannot be estimated.`;
  }
  const parts = [
    `${ev.host}: ${ev.supportingSourceCount} accessible supporting source(s), ${ev.observedSupportCount} observed/measured`,
    ev.conflictingFindings.length > 0
      ? `${ev.conflictingFindings.length} conflicting finding(s)`
      : "no conflicts",
  ];
  if (missing.length > 0) parts.push(`missing data: ${missing.join(", ")}`);
  return `${parts.join("; ")}. Suitability estimate: ${label} (advisory, not a success probability).`;
}

/**
 * Score one host against a rubric. The weighted score is computed ONLY over criteria whose data is
 * available; criteria with missing data are surfaced in `missingData` and excluded from the
 * denominator (never imputed). The rubric version is recorded on the score.
 */
export function scoreHost(ev: HostEvidence, rubric: Rubric = DEFAULT_RUBRIC): HostScore {
  const criterionScores: CriterionScore[] = rubric.criteria.map((c) => {
    const { value, note } = criterionValue(c.id, ev);
    return { criterionId: c.id, label: c.label, weight: c.weight, value, note };
  });

  const missingData = criterionScores.filter((c) => c.value === null).map((c) => c.criterionId);

  const available = criterionScores.filter(
    (c): c is CriterionScore & { value: number } => c.value !== null,
  );
  const weightSum = available.reduce((acc, c) => acc + c.weight, 0);
  const score =
    weightSum > 0 ? available.reduce((acc, c) => acc + c.weight * c.value, 0) / weightSum : 0;

  const label = suitabilityLabel(score, ev);

  const tradeoffs: string[] = [];
  if (ev.conflictingFindings.length > 0) tradeoffs.push(...ev.conflictingFindings);
  if (missingData.length > 0)
    tradeoffs.push(`Incomplete evidence: ${missingData.join(", ")} not assessed.`);

  const yearsStale =
    ev.newestSourceYear === null ? null : Math.max(0, ev.referenceYear - ev.newestSourceYear);

  return {
    host: ev.host,
    rubricVersion: rubric.version,
    score,
    suitabilityLabel: label,
    isSuitabilityEstimate: true,
    advisory: true,
    supportingSourceCount: ev.supportingSourceCount,
    conflictingFindings: ev.conflictingFindings,
    freshness: { newestSourceYear: ev.newestSourceYear, yearsStale },
    rationale: buildRationale(ev, label, missingData),
    tradeoffs,
    criterionScores,
    missingData,
  };
}

/**
 * Score and rank many hosts. Deterministic: sorted by score descending, ties broken by host name
 * ascending. Ranking is advisory — this selects nothing.
 */
export function rankHosts(
  evidence: readonly HostEvidence[],
  rubric: Rubric = DEFAULT_RUBRIC,
): HostScore[] {
  return evidence
    .map((ev) => scoreHost(ev, rubric))
    .sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));
}

/**
 * Aggregate retrieval Citations into per-host {@link HostEvidence}. Only accessible, read citations
 * should be passed in (the retrieval provider already excludes inaccessible ones from `evidence`);
 * this helper enforces that by ignoring any citation that is not open-access / read full text.
 */
export function toHostEvidence(
  host: string,
  citations: readonly Citation[],
  options: { conflictingFindings?: readonly string[]; referenceYear?: number } = {},
): HostEvidence {
  const supporting = citations.filter(
    (c) => c.host === host && c.readFullText && c.accessStatus === AccessStatus.OpenAccess,
  );
  const observedSupportCount = supporting.filter((c) => c.claimType === ClaimType.Observed).length;
  const years = supporting
    .map((c) => c.metadata.year)
    .filter((y): y is number => typeof y === "number");
  const newestSourceYear = years.length > 0 ? Math.max(...years) : null;
  return {
    host,
    supportingSourceCount: supporting.length,
    observedSupportCount,
    conflictingFindings: options.conflictingFindings ?? [],
    newestSourceYear,
    referenceYear: options.referenceYear ?? new Date().getUTCFullYear(),
  };
}
