import { type GoalVersionDraft } from "@chassix/shared";
import { type Planner, PlannerError } from "./planner.js";

/**
 * Deterministic planner for tests and for running without an API key. Output is ILLUSTRATIVE
 * (no live model) and, like the real planner, never fabricates missing critical details — it
 * marks them unknown and asks for them. Used by `createPlanner()` when ANTHROPIC_API_KEY is unset.
 */
export class FakePlanner implements Planner {
  async interpretGoal(prompt: string): Promise<GoalVersionDraft> {
    const trimmed = prompt.trim();
    if (!trimmed) throw new PlannerError("Goal prompt is empty.");

    const lower = trimmed.toLowerCase();
    const mentionsHost = /host|microb|organism|strain|bacteri|yeast|e\. ?coli/.test(lower);
    const mentionsThermo = /thermo|heat|temperature|cooling/.test(lower);
    const mentionsEnzyme = /enzyme|protein|product|produc(e|tion)/.test(lower);

    const draft: GoalVersionDraft = {
      organismConstraints: mentionsHost
        ? { value: "Microbial host (specific strain not stated)", status: "extracted" }
        : { value: null, status: "unknown" },
      desiredPhenotype: mentionsThermo
        ? { value: "Improved thermotolerance", status: "extracted" }
        : { value: null, status: "unknown" },
      productContext: mentionsEnzyme
        ? { value: "Industrial enzyme production", status: "extracted" }
        : { value: null, status: "unknown" },
      analysisObjectives: mentionsHost ? ["Identify candidate hosts with supporting evidence"] : [],
      successMeasures: [],
      assumptions: [],
      // Critical details the prompt does not pin down — asked for, never invented.
      clarifyingQuestions: [
        "What is the target operating temperature range?",
        "What are the production constraints (titer, yield, scale)?",
      ],
      unknowns: ["targetOperatingRange", "productionConstraints", "successMeasures"],
    };
    return draft;
  }
}
