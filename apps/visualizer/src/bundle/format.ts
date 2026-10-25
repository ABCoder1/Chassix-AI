import type {
  AnalysisStatus,
  Condition,
  Organism,
  Uncertainty,
  YieldResult,
} from "@chassix/analysis-bundle";

/** Display label + tone for a per-analysis status. Tone drives the status-chip color. */
export const STATUS_LABEL: Record<
  AnalysisStatus,
  { label: string; tone: "ok" | "warn" | "muted" | "bad" }
> = {
  available: { label: "Available", tone: "ok" },
  partial: { label: "Partial", tone: "warn" },
  not_run: { label: "Not run", tone: "muted" },
  failed: { label: "Failed", tone: "bad" },
};

/**
 * Format a measured number WITH its native unit. Never rescales. Keeps the sign for
 * signed quantities (e.g. reaction flux), which the handoff requires for fluxes.
 */
export function formatValue(value: number, unit: string, opts?: { signed?: boolean }): string {
  const abs = Math.abs(value);
  // Choose precision from magnitude so native values stay legible without lying about scale.
  const digits = abs !== 0 && abs < 0.01 ? 4 : abs < 1 ? 3 : abs < 100 ? 2 : abs < 10000 ? 1 : 0;
  const sign = opts?.signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} ${unit}`.trim();
}

/** Format a p-value, using scientific notation for very small values rather than rounding to 0. */
export function formatP(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  if (p === 0) return "0";
  if (p < 0.001) return p.toExponential(1);
  return p.toFixed(3);
}

export function formatLog2Fc(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

/** Render an uncertainty interval in native units, if present. */
export function formatUncertainty(u: Uncertainty | null | undefined, unit: string): string | null {
  if (!u) return null;
  const level = u.confidenceLevel ? ` (${Math.round(u.confidenceLevel * 100)}% CI)` : "";
  return `${u.lower.toFixed(2)}–${u.upper.toFixed(2)} ${unit}${level}`.trim();
}

export const YIELD_KIND_LABEL: Record<YieldResult["kind"], string> = {
  measured: "Measured",
  predicted: "Predicted",
  derived: "Derived",
};

/** One-line organism provenance, e.g. "Saccharomyces cerevisiae · S288C". */
export function organismLine(organism: Organism): string {
  return [organism.taxonName, organism.strainName].filter(Boolean).join(" · ");
}

/** Compact condition summary from whichever fields are present (null stays absent). */
export function conditionLine(condition: Condition): string {
  const parts: string[] = [];
  if (condition.temperatureC !== null && condition.temperatureC !== undefined)
    parts.push(`${condition.temperatureC}°C`);
  if (condition.pH !== null && condition.pH !== undefined) parts.push(`pH ${condition.pH}`);
  if (condition.salinityMolL !== null && condition.salinityMolL !== undefined)
    parts.push(`${condition.salinityMolL} M`);
  if (condition.media) parts.push(condition.media);
  if (condition.oxygenation) parts.push(condition.oxygenation);
  if (condition.timepoint) parts.push(`${condition.timepoint.value} ${condition.timepoint.unit}`);
  return parts.length ? parts.join(" · ") : condition.id;
}

/** Count significant features at an adjusted-p threshold, ignoring rows with no padj. */
export function countSignificant(
  rows: readonly { adjustedPValue: number | null | undefined }[],
  alpha = 0.05,
): number {
  return rows.filter(
    (r) => r.adjustedPValue !== null && r.adjustedPValue !== undefined && r.adjustedPValue < alpha,
  ).length;
}
