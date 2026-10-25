import { calculateResponse, CHASSIS, type ChassisId, type Environment } from "../model";
import type { AnalysisBundle } from "@chassix/analysis-bundle";

/**
 * Digital-twin "what-if": project a run's analysis bundle onto the environment the user dials in on
 * the levers (temperature / salinity / pH). At the chassis reference environment the stress response
 * is zero, so the returned values are IDENTICAL to the real bundle (the honest baseline). As the
 * levers move away from reference, the model scales the predicted quantities by a deterministic
 * stress response (from `calculateResponse`): growth-linked flux and yield fall under stress, while
 * differential expression and metabolite pools are amplified. These are model PREDICTIONS for the
 * dialed-in condition, not the measured run values — the UI labels them as such (`adjusted`).
 */

const round = (x: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

/** True when the levers sit at the chassis reference (within a small epsilon) — i.e. the raw run. */
export function isReferenceEnvironment(chassisId: ChassisId, env: Environment): boolean {
  const ref = CHASSIS[chassisId].reference;
  return (
    Math.abs(env.temperature - ref.temperature) < 1e-6 &&
    Math.abs(env.salinity - ref.salinity) < 1e-6 &&
    Math.abs(env.ph - ref.ph) < 1e-6
  );
}

export function adjustBundleForEnvironment(
  bundle: AnalysisBundle,
  chassisId: ChassisId,
  env: Environment,
): { bundle: AnalysisBundle; adjusted: boolean } {
  const r = calculateResponse(chassisId, env);
  if (r.stress <= 1e-6) return { bundle, adjusted: false };

  const fFlux = 1 - 0.55 * r.stress; // growth/throughput-linked flux falls under stress
  const fYield = 1 - 0.6 * r.stress; // product yield falls under stress
  const fGene = 1 + 1.3 * r.stress; // differential expression amplified
  const fMetab = 1 + 0.35 * r.stress; // metabolite pools shift

  const a = bundle.analyses;
  const analyses: typeof a = { ...a };

  if (a.flux) {
    analyses.flux = {
      ...a.flux,
      results: a.flux.results.map((x) => ({ ...x, flux: round(x.flux * fFlux, 4) })),
    };
  }
  if (a.yield) {
    analyses.yield = {
      ...a.yield,
      results: a.yield.results.map((x) => ({ ...x, value: round(x.value * fYield, 4) })),
    };
  }
  if (a.geneExpression) {
    analyses.geneExpression = {
      ...a.geneExpression,
      results: a.geneExpression.results.map((x) => ({
        ...x,
        log2FoldChange:
          x.log2FoldChange == null ? x.log2FoldChange : round(x.log2FoldChange * fGene, 3),
      })),
    };
  }
  if (a.metabolomics) {
    analyses.metabolomics = {
      ...a.metabolomics,
      results: a.metabolomics.results.map((x) => ({ ...x, value: round(x.value * fMetab, 4) })),
    };
  }

  return { bundle: { ...bundle, analyses }, adjusted: true };
}
