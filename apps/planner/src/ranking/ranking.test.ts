import { describe, it, expect } from "vitest";
import { scoreHost, rankHosts, toHostEvidence } from "./scorer.js";
import { RUBRIC_V1, RUBRIC_V2, getRubric, CriterionId } from "./rubric.js";
import { SuitabilityLabel, type HostEvidence } from "./types.js";
import { FixtureRetrievalProvider } from "../retrieval/fixture-retrieval.js";

const wellEvidenced: HostEvidence = {
  host: "Bacillus subtilis",
  supportingSourceCount: 3,
  observedSupportCount: 3,
  conflictingFindings: [],
  newestSourceYear: 2024,
  referenceYear: 2026,
};

describe("scoreHost", () => {
  it("records the rubric version on every score", () => {
    expect(scoreHost(wellEvidenced, RUBRIC_V1).rubricVersion).toBe("v1");
    expect(scoreHost(wellEvidenced, RUBRIC_V2).rubricVersion).toBe("v2");
  });

  it("labels the output a suitability estimate, not a probability of success", () => {
    const s = scoreHost(wellEvidenced, RUBRIC_V1);
    expect(s.isSuitabilityEstimate).toBe(true);
    expect(s.advisory).toBe(true);
    expect(Object.values(SuitabilityLabel)).toContain(s.suitabilityLabel);
  });

  it("surfaces missing data as an indicator and never imputes it", () => {
    const missingFreshness: HostEvidence = {
      host: "Pichia pastoris",
      supportingSourceCount: 2,
      observedSupportCount: 1,
      conflictingFindings: [],
      newestSourceYear: null, // unknown → freshness missing
      referenceYear: 2026,
    };
    const s = scoreHost(missingFreshness, RUBRIC_V1);
    expect(s.missingData).toContain(CriterionId.Freshness);
    const freshness = s.criterionScores.find((c) => c.criterionId === CriterionId.Freshness);
    expect(freshness?.value).toBeNull();
    // Score is computed over available criteria only (missing criterion excluded, not imputed as 0).
    const availableWeight = s.criterionScores
      .filter((c) => c.value !== null)
      .reduce((a, c) => a + c.weight, 0);
    const expected =
      s.criterionScores
        .filter((c): c is typeof c & { value: number } => c.value !== null)
        .reduce((a, c) => a + c.weight * c.value, 0) / availableWeight;
    expect(s.score).toBeCloseTo(expected, 10);
  });

  it("returns insufficient_evidence when there are no accessible sources", () => {
    const none: HostEvidence = {
      host: "Nothing",
      supportingSourceCount: 0,
      observedSupportCount: 0,
      conflictingFindings: [],
      newestSourceYear: null,
      referenceYear: 2026,
    };
    const s = scoreHost(none);
    expect(s.suitabilityLabel).toBe(SuitabilityLabel.InsufficientEvidence);
    expect(s.missingData).toContain(CriterionId.MeasuredSupport);
  });

  it("surfaces conflicting findings as tradeoffs", () => {
    const conflicted: HostEvidence = {
      ...wellEvidenced,
      host: "Thermus thermophilus",
      conflictingFindings: ["Limited heterologous enzyme secretion."],
    };
    const s = scoreHost(conflicted, RUBRIC_V1);
    expect(s.conflictingFindings).toHaveLength(1);
    expect(s.tradeoffs).toContain("Limited heterologous enzyme secretion.");
  });
});

describe("rubric versioning", () => {
  it("two different rubric versions produce different scores, both inspectable", () => {
    // A host where coverage and measured/freshness sub-scores differ, so re-weighting moves the score.
    const ev: HostEvidence = {
      host: "Mixed",
      supportingSourceCount: 1, // low coverage
      observedSupportCount: 1, // perfect measured support
      conflictingFindings: [],
      newestSourceYear: 2026, // perfectly fresh
      referenceYear: 2026,
    };
    const s1 = scoreHost(ev, RUBRIC_V1);
    const s2 = scoreHost(ev, RUBRIC_V2);
    expect(s1.score).not.toBeCloseTo(s2.score, 6);
    // Both rubric versions remain retrievable/inspectable.
    expect(getRubric("v1")?.criteria.length).toBeGreaterThan(0);
    expect(getRubric("v2")?.criteria.length).toBeGreaterThan(0);
  });

  it("rubric versions are immutable (frozen)", () => {
    expect(Object.isFrozen(RUBRIC_V1)).toBe(true);
    expect(Object.isFrozen(RUBRIC_V1.criteria)).toBe(true);
    expect(() => {
      // @ts-expect-error — compile + runtime both reject mutation of a frozen rubric.
      RUBRIC_V1.criteria[0].weight = 0.99;
    }).toThrow();
  });

  it("weights are illustrative pending ADR-D10 sign-off", () => {
    expect(RUBRIC_V1.illustrative).toBe(true);
    expect(RUBRIC_V2.illustrative).toBe(true);
  });
});

describe("rankHosts", () => {
  it("ranks deterministically by score desc, host name tiebreak", () => {
    const a: HostEvidence = {
      ...wellEvidenced,
      host: "Zeta",
      supportingSourceCount: 1,
      observedSupportCount: 1,
    };
    const b: HostEvidence = {
      ...wellEvidenced,
      host: "Alpha",
      supportingSourceCount: 1,
      observedSupportCount: 1,
    };
    const ranked = rankHosts([a, b], RUBRIC_V1);
    // Equal scores → alphabetical tiebreak.
    expect(ranked.map((h) => h.host)).toEqual(["Alpha", "Zeta"]);
    expect(rankHosts([a, b], RUBRIC_V1)).toEqual(ranked);
  });
});

describe("retrieval → ranking integration", () => {
  it("aggregates retrieval citations into host evidence and scores them", async () => {
    const res = await new FixtureRetrievalProvider().retrieve({
      text: "thermotolerant microbial host for industrial enzyme production",
    });
    const ev = toHostEvidence("Bacillus subtilis", res.evidence, {
      conflictingFindings: [],
      referenceYear: 2026,
    });
    // lit-0007/lit-0008 (paywalled/unavailable) are not in evidence, so they are not counted.
    expect(ev.supportingSourceCount).toBeGreaterThan(0);
    const s = scoreHost(ev, RUBRIC_V1);
    expect(s.rubricVersion).toBe("v1");
    expect(s.supportingSourceCount).toBe(ev.supportingSourceCount);
  });
});
