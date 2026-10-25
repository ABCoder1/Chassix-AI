import { describe, it, expect } from "vitest";
import { GoalVersionDraftSchema } from "@chassix/shared";
import { ClaudePlanner } from "./claude-planner.js";

/**
 * Live smoke test against the real Claude API. Skipped unless ANTHROPIC_API_KEY is set, so CI
 * and keyless dev stay green. When run, it verifies the planner returns a schema-valid draft and
 * — the key behavior — does NOT fabricate the operating range the example goal never states.
 */
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

const EXAMPLE =
  "I want a more thermotolerant microbial host for producing an industrial enzyme with reduced cooling requirements.";

describe.skipIf(!hasKey)("ClaudePlanner (live)", () => {
  it("interprets the thermotolerant-host goal without fabricating the operating range", async () => {
    const draft = await new ClaudePlanner().interpretGoal(EXAMPLE);

    // Schema-valid by construction, but assert explicitly.
    expect(GoalVersionDraftSchema.safeParse(draft).success).toBe(true);

    // The goal states a product + phenotype; the planner should ground those.
    expect(draft.productContext.value ?? "").toMatch(/enzyme|protein|product/i);

    // The target operating range is NOT in the prompt — it must be unknown or asked about,
    // never invented as a concrete value.
    const asksRange = draft.clarifyingQuestions.some((q) =>
      /range|temperature|operating|cooling/i.test(q),
    );
    const rangeUnknown = draft.unknowns.length > 0;
    expect(asksRange || rangeUnknown).toBe(true);
  }, 60_000);
});
