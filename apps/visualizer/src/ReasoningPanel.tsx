import { useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, Sparkles } from "lucide-react";
import type { AnalysisBundle } from "@chassix/analysis-bundle";

/** Build a compact text summary of the bundle for the reasoner (no fabrication — just what's here). */
function buildSummary(b: AnalysisBundle): string {
  const lines: string[] = [];
  lines.push(
    `Organism: ${b.organism.taxonName}${b.organism.strainName ? " " + b.organism.strainName : ""} (chassis: ${b.organism.chassisId})`,
  );
  lines.push(
    `Condition: ${b.condition.id}${b.condition.media ? ` | media ${b.condition.media}` : ""}${b.condition.oxygenation ? ` | ${b.condition.oxygenation}` : ""}`,
  );
  const flux = b.analyses.flux;
  if (flux) {
    lines.push(
      `\nFlux [${flux.status}; method ${flux.method ?? "n/a"}; objective ${flux.objective ?? "n/a"}]:`,
    );
    lines.push(`  active reactions reported: ${flux.results.length}`);
    const key = flux.results.filter((r) =>
      /ethanol|acetate|succinate|lactate|biomass|growth|glucose|oxygen/i.test(
        `${r.reactionName ?? ""} ${r.reactionId}`,
      ),
    );
    for (const r of key.slice(0, 12)) {
      lines.push(`  ${r.reactionName ?? r.reactionId} = ${r.flux} ${r.unit} [${r.conditionId}]`);
    }
  }
  const yld = b.analyses.yield;
  if (yld && yld.results.length) {
    lines.push(`\nPredicted yields [${yld.status}; method ${yld.method ?? "n/a"}]:`);
    for (const y of yld.results)
      lines.push(`  ${y.name ?? y.metricId} = ${y.value} ${y.unit} (${y.kind})`);
  }
  const ge = b.analyses.geneExpression;
  if (ge && ge.results.length) {
    lines.push(`\nGene/protein expression [${ge.status}; method ${ge.method ?? "n/a"}]:`);
    const top = [...ge.results]
      .sort((a, c) => Math.abs(c.log2FoldChange ?? 0) - Math.abs(a.log2FoldChange ?? 0))
      .slice(0, 8);
    for (const g of top)
      lines.push(`  ${g.symbol ?? g.featureId} log2FC=${g.log2FoldChange} (${g.featureType})`);
  }
  const mb = b.analyses.metabolomics;
  if (mb && mb.results.length) {
    lines.push(`\nMetabolites [${mb.status}; method ${mb.method ?? "n/a"}]:`);
    for (const m of mb.results.slice(0, 8))
      lines.push(
        `  ${m.name ?? m.featureId} = ${m.value} ${m.unit}${m.change != null ? ` (change ${m.change})` : ""}`,
      );
  }
  return lines.join("\n");
}

interface Reasoning {
  thinking: string;
  text: string;
  model: string;
}

/**
 * Sonnet 4.8 reasoning over the loaded bundle, shown at the bottom of the results. Posts a compact
 * summary to the engine's /reasoning endpoint and renders the model's thinking (collapsible) and its
 * interpretation. If the endpoint is unreachable or unconfigured, it says so rather than inventing one.
 */
export function ReasoningPanel({ bundle }: { bundle: AnalysisBundle }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("loading");
  const [data, setData] = useState<Reasoning | null>(null);
  const [error, setError] = useState<string>("");
  const [showThinking, setShowThinking] = useState(true);
  const key = `${bundle.run.id}:${bundle.condition.id}`;
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    const controller = new AbortController();
    setState("loading");
    setData(null);
    setError("");
    fetch("/api/reasoning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ summary: buildSummary(bundle) }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const detail =
            res.status === 503
              ? "Model reasoning is not configured on the server (set ANTHROPIC_API_KEY)."
              : `Reasoning service returned ${res.status}.`;
          throw new Error(detail);
        }
        return (await res.json()) as Reasoning;
      })
      .then((r) => {
        setData(r);
        setState("done");
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      });
    return () => controller.abort();
  }, [key, bundle]);

  return (
    <section className="reasoning" aria-label="Model reasoning about the results">
      <div className="reasoning-head">
        <span className="reasoning-eyebrow">
          <Brain size={14} /> MODEL REASONING
        </span>
        {data?.model && <span className="reasoning-model">{data.model}</span>}
      </div>

      {state === "loading" && (
        <div className="reasoning-loading">
          <span className="reasoning-spinner" aria-hidden="true" />
          Sonnet is reasoning about the results…
        </div>
      )}

      {state === "error" && <p className="reasoning-error">{error}</p>}

      {state === "done" && data && (
        <>
          {data.thinking && (
            <div className="reasoning-thinking">
              <button
                type="button"
                className="reasoning-thinking-toggle"
                aria-expanded={showThinking}
                onClick={() => setShowThinking((v) => !v)}
              >
                <ChevronDown
                  size={13}
                  style={{ transform: showThinking ? "none" : "rotate(-90deg)" }}
                />
                Thinking
              </button>
              {showThinking && <pre className="reasoning-thinking-body">{data.thinking}</pre>}
            </div>
          )}
          <div className="reasoning-text">
            <Sparkles size={14} className="reasoning-text-icon" />
            <p>{data.text}</p>
          </div>
        </>
      )}
    </section>
  );
}
