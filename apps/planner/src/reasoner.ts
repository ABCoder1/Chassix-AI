import Anthropic from "@anthropic-ai/sdk";

/**
 * Sonnet 4.8 reasoning over a finished bioinformatics run (ADR-D9). Given a compact summary of the
 * analysis bundle(s) — flux maps, condition-specific changes, cross-organism comparison — it returns
 * both the model's extended thinking and its concise scientific interpretation, so the dashboard can
 * surface the reasoning, not just a verdict.
 *
 * Credentials come from the environment (ANTHROPIC_API_KEY) via the SDK's default resolution — never
 * passed from the client, never logged. Uses adaptive thinking at medium effort (budget_tokens is
 * rejected on current models). Override the model with ANTHROPIC_REASONING_MODEL.
 */
const DEFAULT_REASONING_MODEL = "claude-sonnet-4-8";

export const RESULTS_REASONING_SYSTEM = `You are a computational systems-biology analyst reviewing the
results of a multi-omics pipeline run (genome-scale metabolic flux balance analysis plus
transcriptomic / proteomic / metabolomic context) for one or more microbial hosts.

You are given a compact JSON/text summary of the computed results. Reason about what the numbers mean
biologically: the condition-specific flux changes, growth vs. byproduct trade-offs, respiration→
fermentation switches, and any cross-organism contrasts. Be specific and quantitative where the data
supports it, and explicitly flag anything that is illustrative/literature-sourced rather than computed.
Do not invent values that are not in the summary.

Respond with a concise interpretation (4–8 sentences): the headline finding, the mechanism it implies,
and one concrete, cautious next experiment or caveat. Plain prose, no preamble.`;

export interface ResultsReasoning {
  readonly thinking: string;
  readonly text: string;
  readonly model: string;
}

export interface ResultsReasonerOptions {
  client?: Anthropic;
  model?: string;
}

export class ResultsReasoner {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: ResultsReasonerOptions = {}) {
    this.client = opts.client ?? new Anthropic();
    this.model = opts.model ?? process.env.ANTHROPIC_REASONING_MODEL ?? DEFAULT_REASONING_MODEL;
  }

  async reason(summary: string): Promise<ResultsReasoning> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: RESULTS_REASONING_SYSTEM,
      messages: [{ role: "user", content: summary }],
    });

    const thinking = response.content
      .filter((b): b is Anthropic.ThinkingBlock => b.type === "thinking")
      .map((b) => b.thinking)
      .join("\n\n")
      .trim();
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return { thinking, text, model: this.model };
  }
}

/** Live reasoner when ANTHROPIC_API_KEY is set, else null (so the app runs keyless). */
export function createReasoner(): ResultsReasoner | null {
  return process.env.ANTHROPIC_API_KEY ? new ResultsReasoner() : null;
}
