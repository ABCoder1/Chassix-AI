import Anthropic from "@anthropic-ai/sdk";
import { GoalVersionDraftSchema, type GoalVersionDraft } from "@chassix/shared";
import { type Planner, PlannerError } from "./planner.js";
import { GOAL_INTERPRETATION_SYSTEM } from "./prompt.js";

/**
 * Default model: Opus 4.8 at medium effort (override with ANTHROPIC_MODEL). Opus 4.8 has
 * narrower safety classifiers than the 5.x line, so it handles legitimate strain-engineering
 * goals directly without the `bio` false-positive that required a server-side fallback on
 * Opus 5.5 — the request can stay on the plain (non-beta) Messages endpoint.
 */
const DEFAULT_MODEL = "claude-opus-4-8";

export interface ClaudePlannerOptions {
  client?: Anthropic;
  model?: string;
}

/**
 * Planner backed by the Claude API (ADR-D9). Credentials come from the environment
 * (ANTHROPIC_API_KEY) via the SDK's default resolution — never passed from the client and
 * never logged. Uses Opus 4.8 with adaptive thinking at medium effort and asks for strict JSON,
 * which we validate against the shared schema (no `temperature`: rejected on current models).
 */
export class ClaudePlanner implements Planner {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: ClaudePlannerOptions = {}) {
    this.client = opts.client ?? new Anthropic();
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async interpretGoal(prompt: string): Promise<GoalVersionDraft> {
    const trimmed = prompt.trim();
    if (!trimmed) throw new PlannerError("Goal prompt is empty.");

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: GOAL_INTERPRETATION_SYSTEM,
        messages: [{ role: "user", content: trimmed }],
      });
    } catch (err) {
      throw new PlannerError("Claude request failed.", err);
    }

    if (response.stop_reason === "refusal") {
      throw new PlannerError(
        `Claude refused the request (${response.stop_details?.category ?? "unspecified"}).`,
      );
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new PlannerError("Claude returned no text content.");

    return parseGoalDraft(text);
  }
}

/** Extract and validate the JSON object from the model's text (tolerating code fences). */
export function parseGoalDraft(text: string): GoalVersionDraft {
  const unfenced = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new PlannerError("Planner response did not contain a JSON object.");
  }
  let json: unknown;
  try {
    json = JSON.parse(unfenced.slice(start, end + 1));
  } catch (err) {
    throw new PlannerError("Planner response was not valid JSON.", err);
  }
  const parsed = GoalVersionDraftSchema.safeParse(json);
  if (!parsed.success) {
    throw new PlannerError(`Planner response failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
