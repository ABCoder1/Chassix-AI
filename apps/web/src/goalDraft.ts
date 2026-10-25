import type { GoalVersionDraft } from "@chassix/shared";
import { FieldStatus } from "@chassix/shared";

/**
 * ILLUSTRATIVE goal-interpretation draft (Step 1.6 / BF-01, PRD §A).
 *
 * This is a static fixture, NOT the output of the live planner — wiring the
 * review UI to the Anthropic-backed planner is out of scope for this step. It is
 * labeled illustrative in the UI per the cross-cutting "no fabricated results"
 * rule, and it deliberately demonstrates the required honesty behaviors for the
 * PRD's worked example:
 *   - extracted fields carry the planner's `status` (never asserted as fact when
 *     they are only assumed);
 *   - the target operating range and production constraints are NOT invented —
 *     they appear as explicit `unknowns` AND as targeted `clarifyingQuestions`.
 */
export const ILLUSTRATIVE_GOAL_PROMPT =
  "I want a more thermotolerant microbial host for producing an industrial enzyme with reduced cooling requirements.";

export const ILLUSTRATIVE_GOAL_DRAFT: GoalVersionDraft = {
  organismConstraints: {
    value: "Microbial host (bacterial or fungal); non-microbial systems excluded",
    status: FieldStatus.Extracted,
  },
  desiredPhenotype: {
    value: "Increased thermotolerance relative to the current production host",
    status: FieldStatus.Extracted,
  },
  productContext: {
    value: "Expression of an industrial enzyme with reduced cooling requirements",
    status: FieldStatus.Extracted,
  },
  analysisObjectives: [
    "Shortlist microbial hosts with elevated thermotolerance",
    "Compare candidate suitability for industrial enzyme expression",
  ],
  successMeasures: [
    "Candidate hosts ranked by evidence-backed suitability (advisory, not a success probability)",
  ],
  assumptions: [
    {
      text: "Assuming a submerged fermentation process at industrial scale (not stated — please confirm).",
      editable: true,
    },
    {
      text: "Assuming the enzyme is heterologously expressed rather than native to the host (not stated — please confirm).",
      editable: true,
    },
  ],
  clarifyingQuestions: [
    "What target operating temperature range must the host tolerate?",
    "What are the production constraints (target titer, yield, scale, and timeline)?",
    "Is there an existing baseline host to improve on or compare against?",
  ],
  unknowns: ["Target operating temperature range", "Production constraints"],
};
