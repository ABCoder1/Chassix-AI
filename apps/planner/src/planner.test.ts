import { describe, it, expect } from "vitest";
import { GoalVersionDraftSchema } from "@chassix/shared";
import { FakePlanner } from "./fake-planner.js";
import { parseGoalDraft } from "./claude-planner.js";
import { PlannerError } from "./planner.js";

const EXAMPLE =
  "I want a more thermotolerant microbial host for producing an industrial enzyme with reduced cooling requirements.";

describe("FakePlanner", () => {
  it("returns a schema-valid draft for the example goal", async () => {
    const draft = await new FakePlanner().interpretGoal(EXAMPLE);
    expect(GoalVersionDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("does NOT fabricate the operating range — it is unknown or asked about", async () => {
    const draft = await new FakePlanner().interpretGoal(EXAMPLE);
    const asksRange = draft.clarifyingQuestions.some((q) => /range|temperature/i.test(q));
    const rangeUnknown = draft.unknowns.some((u) => /range/i.test(u));
    expect(asksRange || rangeUnknown).toBe(true);
    // No field should carry a made-up numeric operating range.
    const values = [draft.organismConstraints.value, draft.desiredPhenotype.value].join(" ");
    expect(values).not.toMatch(/\d+\s?°?[cC]\b/);
  });

  it("extracts the stated product context and phenotype", async () => {
    const draft = await new FakePlanner().interpretGoal(EXAMPLE);
    expect(draft.productContext.status).toBe("extracted");
    expect(draft.desiredPhenotype.status).toBe("extracted");
  });

  it("throws on an empty prompt", async () => {
    await expect(new FakePlanner().interpretGoal("   ")).rejects.toBeInstanceOf(PlannerError);
  });
});

describe("parseGoalDraft", () => {
  const valid = JSON.stringify({
    organismConstraints: { value: null, status: "unknown" },
    desiredPhenotype: { value: null, status: "unknown" },
    productContext: { value: null, status: "unknown" },
    analysisObjectives: [],
    successMeasures: [],
    assumptions: [],
    clarifyingQuestions: [],
    unknowns: [],
  });

  it("parses a bare JSON object", () => {
    expect(parseGoalDraft(valid).unknowns).toEqual([]);
  });

  it("parses JSON wrapped in code fences", () => {
    expect(() => parseGoalDraft("```json\n" + valid + "\n```")).not.toThrow();
  });

  it("throws on non-JSON", () => {
    expect(() => parseGoalDraft("sorry, no JSON here")).toThrow(PlannerError);
  });

  it("throws on JSON that violates the schema", () => {
    expect(() => parseGoalDraft('{"organismConstraints": "nope"}')).toThrow(PlannerError);
  });
});
