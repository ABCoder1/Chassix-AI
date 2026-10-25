import type { GoalVersionDraft } from "@chassix/shared";

/**
 * A Planner turns a plain-language goal into a structured, schema-valid GoalVersion draft
 * (Implementation Guide Step 1.6 / PRD §A). Implementations MUST NOT fabricate missing
 * details — unknowns stay unknown and genuinely-missing critical details become clarifying
 * questions. Keeping this behind an interface lets the API and tests run against a
 * deterministic fake with no live key (project rule: credentials behind interfaces).
 */
export interface Planner {
  interpretGoal(prompt: string): Promise<GoalVersionDraft>;
}

export class PlannerError extends Error {
  override readonly name = "PlannerError";
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}
