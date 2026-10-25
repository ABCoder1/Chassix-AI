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
// Current Sonnet with adaptive-thinking support. (There is no "claude-sonnet-4-8": the 4.8 family
// is Opus-only, and Sonnet 4.5 does not support adaptive thinking — Sonnet 5.5 is the match.)
const DEFAULT_REASONING_MODEL = "claude-sonnet-5-5";

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

/** Any engine that turns a results summary into reasoning (Sonnet, Bitdeer, …). */
export interface Reasoner {
  reason(summary: string): Promise<ResultsReasoning>;
}

export interface ResultsReasonerOptions {
  client?: Anthropic;
  model?: string;
}

export class ResultsReasoner implements Reasoner {
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
      // Adaptive thinking: the model emits a thinking trace when the task warrants one (the panel
      // shows it when present). budget_tokens / forced thinking is rejected on current models.
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

/**
 * Bitdeer AI Model Studio reasoner (OpenAI-compatible). Fast "Flash" models serve the same
 * interpretation + reasoning-trace contract as the Anthropic path, so it can stand in for Sonnet
 * (the user's goal: lower latency). Base URL and model are overridable; the key comes from the
 * environment (BIT_DEER_API_KEY), never from the client. Reasoning models return their chain as
 * `reasoning_content` (or inline `<think>…</think>`), which we surface as `thinking`.
 */
const DEFAULT_BITDEER_MODEL = "zai-org/GLM-5.3-Flash";
const BITDEER_BASE_URL = "https://api-inference.bitdeer.ai/v1";

export interface BitdeerReasonerOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class BitdeerReasoner implements Reasoner {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(opts: BitdeerReasonerOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.BIT_DEER_API_KEY;
    if (!apiKey) throw new Error("BitdeerReasoner requires BIT_DEER_API_KEY.");
    this.#apiKey = apiKey;
    this.#model = opts.model ?? process.env.BITDEER_REASONING_MODEL ?? DEFAULT_BITDEER_MODEL;
    this.#baseUrl = opts.baseUrl ?? process.env.BITDEER_BASE_URL ?? BITDEER_BASE_URL;
    this.#fetch = opts.fetchImpl ?? fetch;
  }

  async reason(summary: string): Promise<ResultsReasoning> {
    const res = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: 2000,
        messages: [
          { role: "system", content: RESULTS_REASONING_SYSTEM },
          { role: "user", content: summary },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Bitdeer returned ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
    };
    const message = json.choices?.[0]?.message ?? {};
    let text = (message.content ?? "").trim();
    let thinking = (message.reasoning_content ?? "").trim();
    // Some models inline the chain as <think>…</think> in the content; split it out.
    const match = text.match(/^<think>([\s\S]*?)<\/think>\s*([\s\S]*)$/);
    if (match) {
      thinking = thinking || match[1]!.trim();
      text = match[2]!.trim();
    }
    if (!text) throw new Error("Bitdeer returned no content.");
    return { thinking, text, model: json.model ?? this.#model };
  }
}

/**
 * Tries a fast primary reasoner (Bitdeer) and falls back to a secondary (Sonnet) on any error — e.g.
 * Bitdeer insufficient balance or an outage. A circuit breaker disables the primary after its first
 * failure for the rest of the process, so later calls don't pay the failed-primary latency twice.
 */
export class FallbackReasoner implements Reasoner {
  #primaryDisabled = false;
  constructor(
    private readonly primary: Reasoner,
    private readonly secondary: Reasoner,
  ) {}

  async reason(summary: string): Promise<ResultsReasoning> {
    if (!this.#primaryDisabled) {
      try {
        return await this.primary.reason(summary);
      } catch (err) {
        this.#primaryDisabled = true;
        console.error(
          "[reasoner] primary failed; falling back for the rest of this process:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    return this.secondary.reason(summary);
  }
}

/**
 * Picks the reasoning engine from the environment:
 *   - Bitdeer + Anthropic set  → Bitdeer (fast) with a Sonnet fallback.
 *   - only one set             → that one.
 *   - neither                  → null (route returns 503).
 * Override the order with REASONING_PROVIDER=anthropic|bitdeer.
 */
export function createReasoner(): Reasoner | null {
  const hasBitdeer = Boolean(process.env.BIT_DEER_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const bitdeer = hasBitdeer ? new BitdeerReasoner() : null;
  const sonnet = hasAnthropic ? new ResultsReasoner() : null;

  const preference = process.env.REASONING_PROVIDER?.toLowerCase();
  if (preference === "anthropic") return sonnet ?? bitdeer;
  if (preference === "bitdeer") return bitdeer ?? sonnet;

  if (bitdeer && sonnet) return new FallbackReasoner(bitdeer, sonnet);
  return bitdeer ?? sonnet;
}
