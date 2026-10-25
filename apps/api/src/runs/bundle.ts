/**
 * Run → analysis-bundle producer (the engine side of the digital-twin handoff).
 *
 * Assembles the run's authoritative state (orchestrator snapshot) plus whatever validated
 * analysis fragments a `BundleSource` can supply into one schema-1.0.0 `AnalysisBundle` —
 * the exact contract the visualizer consumes (`packages/analysis-bundle`).
 *
 * Honesty rules, enforced here, not left to the UI:
 *   - Native units only; this layer never invents numeric results.
 *   - A branch that has not produced an ingested numeric fragment is reported with an
 *     explicit per-section status (`not_run` / `partial` / `failed`), never a zero stand-in.
 *   - "Unknown stays unknown": organism / condition fields we cannot resolve are left null.
 *
 * Real workflows (see `workflows/`) upload per-branch fragments to object storage; a
 * `BundleSource` reads them back. The in-process stack has no fragments, so a run there
 * yields a valid bundle whose sections carry progress/terminal status with no fabricated rows.
 */
import { BranchState, isBranchTerminal } from "@chassix/shared";
import {
  ANALYSIS_BUNDLE_SCHEMA_VERSION,
  parseAnalysisBundle,
  type AnalysisBundle,
  type AnalysisStatus,
  type Artifact,
  type Condition,
  type FluxAnalysis,
  type GeneExpression,
  type Interactions,
  type Metabolomics,
  type ModelVersion,
  type Organism,
  type RunStatus,
  type YieldAnalysis,
} from "@chassix/analysis-bundle";
import type { BranchRecord, RunRecord } from "@chassix/orchestrator";

/** The analysis sections the bundle schema defines. */
export type AnalysisKey = "geneExpression" | "flux" | "metabolomics" | "yield" | "interactions";

/** A fully-formed section coming from an ingested workflow fragment. */
export type AnalysisSection =
  | GeneExpression
  | FluxAnalysis
  | Metabolomics
  | YieldAnalysis
  | Interactions;

/**
 * Branch name → analysis section(s). Genomics and pathways have NO first-class numeric
 * section in schema 1.0.0 (they contribute artifacts only); that gap is documented in
 * `workflows/README.md`. The flux/yield branch contributes both the flux distribution and
 * the predicted yields.
 */
const BRANCH_ANALYSIS_MAP: Readonly<Record<string, readonly AnalysisKey[]>> = {
  transcriptomics: ["geneExpression"],
  transcriptomicsperturbation: ["geneExpression"],
  perturbation: ["geneExpression"],
  flux: ["flux", "yield"],
  fluxomics: ["flux", "yield"],
  fluxanalysis: ["flux", "yield"],
  metabolomics: ["metabolomics"],
  interactions: ["interactions"],
  genomics: [],
  pathways: [],
};

/** Normalize a branch name so "Flux analysis" / "flux_analysis" / "fluxAnalysis" all match. */
export function normalizeBranchName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

/** Section status for a branch WITHOUT an ingested numeric fragment, from its branch state. */
export function branchProgressStatus(state: BranchState): AnalysisStatus {
  switch (state) {
    case BranchState.Failed:
      return "failed";
    case BranchState.Succeeded:
      // Terminal success but no numeric rows ingested yet → partial, with a reason + artifacts.
      return "partial";
    case BranchState.Cancelled:
    case BranchState.Skipped:
    case BranchState.NotConfigured:
    default:
      return "not_run";
  }
}

function branchStatusReason(state: BranchState): string {
  switch (state) {
    case BranchState.Failed:
      return "Branch failed; no results were produced.";
    case BranchState.Succeeded:
      return "Branch succeeded; numeric results not yet ingested into the bundle.";
    case BranchState.Cancelled:
      return "Branch was cancelled.";
    case BranchState.Skipped:
      return "Branch was skipped.";
    case BranchState.NotConfigured:
      return "Branch is not configured.";
    default:
      return `Branch is ${state.replace(/_/g, " ")}; results not available yet.`;
  }
}

/** Derive the run-level bundle status from the run record and its branches. */
export function deriveRunStatus(run: RunRecord, branches: readonly BranchRecord[]): RunStatus {
  if (branches.length === 0) return run.startedAt ? "running" : "queued";
  if (!run.startedAt) return "queued";
  const allTerminal = branches.every((b) => isBranchTerminal(b.state));
  if (!allTerminal) return "running";
  const succeeded = branches.filter((b) => b.state === BranchState.Succeeded).length;
  if (succeeded === branches.length) return "completed";
  if (succeeded > 0) return "partial";
  return "failed";
}

/** Supplies ingested numeric sections (and bundle artifacts) for a run. */
export interface BundleSource {
  sectionsForRun(runId: string): Promise<Partial<Record<AnalysisKey, AnalysisSection>>>;
  artifactsForRun(runId: string): Promise<Artifact[]>;
}

/** Default source: no fragments ingested (the in-process stack). */
export const emptyBundleSource: BundleSource = {
  async sectionsForRun() {
    return {};
  },
  async artifactsForRun() {
    return [];
  },
};

/** Provenance the producer cannot derive from run/branch state alone. */
export interface BundleContext {
  readonly organism: Organism;
  readonly condition: Condition;
  readonly workflowId: string;
  readonly workflowVersion: string | null;
  readonly modelVersions: ModelVersion[];
}

/**
 * Best-effort context from the run + branch manifests. Organism / condition are read from a
 * branch manifest's `parameters.organism` / `parameters.condition` when present, else left
 * explicitly unspecified (never fabricated). Tool versions become model-version provenance.
 */
export function resolveContext(run: RunRecord, branches: readonly BranchRecord[]): BundleContext {
  const organism = readOrganism(branches) ?? {
    chassisId: "other",
    taxonId: null,
    taxonName: "Unspecified organism",
    strainId: null,
    strainName: null,
  };
  const condition = readCondition(branches) ?? { id: `${run.id}:default` };

  const tools = new Map<string, string>();
  for (const b of branches) {
    for (const [id, version] of Object.entries(b.manifest.toolVersions)) tools.set(id, version);
  }
  const modelVersions: ModelVersion[] = [...tools].map(([id, version]) => ({ id, version }));

  return {
    organism,
    condition,
    workflowId: `chassix-run-${run.planId}`,
    workflowVersion: null,
    modelVersions,
  };
}

function readOrganism(branches: readonly BranchRecord[]): Organism | null {
  for (const b of branches) {
    const o = (b.manifest.parameters as Record<string, unknown>).organism;
    if (o && typeof o === "object") {
      const rec = o as Record<string, unknown>;
      const taxonName = typeof rec.taxonName === "string" ? rec.taxonName : null;
      if (taxonName) {
        const chassis = rec.chassisId;
        return {
          chassisId:
            chassis === "yeast" || chassis === "bacterium" || chassis === "archaeon"
              ? chassis
              : "other",
          taxonId: typeof rec.taxonId === "string" ? rec.taxonId : null,
          taxonName,
          strainId: typeof rec.strainId === "string" ? rec.strainId : null,
          strainName: typeof rec.strainName === "string" ? rec.strainName : null,
        };
      }
    }
  }
  return null;
}

function readCondition(branches: readonly BranchRecord[]): Condition | null {
  for (const b of branches) {
    const c = (b.manifest.parameters as Record<string, unknown>).condition;
    if (c && typeof c === "object") {
      const rec = c as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : null;
      if (id) {
        const out: Condition = { id };
        if (typeof rec.temperatureC === "number") out.temperatureC = rec.temperatureC;
        if (typeof rec.pH === "number") out.pH = rec.pH;
        if (typeof rec.salinityMolL === "number") out.salinityMolL = rec.salinityMolL;
        if (typeof rec.media === "string") out.media = rec.media;
        return out;
      }
    }
  }
  return null;
}

function emptySection(
  key: AnalysisKey,
  status: AnalysisStatus,
  reason: string,
  artifactIds: string[],
): AnalysisSection {
  const base = { status, notAvailableReason: reason, artifactIds, results: [] as [] };
  // Each section shares the base shape; results are empty when there is no fragment.
  return base as AnalysisSection;
}

export interface BuildRunBundleInput {
  readonly run: RunRecord;
  readonly branches: readonly BranchRecord[];
  readonly context: BundleContext;
  readonly sections: Partial<Record<AnalysisKey, AnalysisSection>>;
  readonly artifacts: readonly Artifact[];
}

/**
 * Assemble and VALIDATE a run's analysis bundle. Ingested fragments win; branches without a
 * fragment contribute an explicit-status empty section; if a run has only section-less
 * branches (genomics/pathways), all five sections are reported `not_run` so the bundle stays
 * valid (schema requires ≥1) and honest.
 */
export function buildRunBundle(input: BuildRunBundleInput): AnalysisBundle {
  const { run, branches, context, sections, artifacts } = input;
  const analyses: Partial<Record<AnalysisKey, AnalysisSection>> = {};

  for (const branch of branches) {
    const keys = BRANCH_ANALYSIS_MAP[normalizeBranchName(branch.name)] ?? [];
    for (const key of keys) {
      if (analyses[key]) continue;
      const fragment = sections[key];
      if (fragment) {
        analyses[key] = fragment;
      } else {
        analyses[key] = emptySection(
          key,
          branchProgressStatus(branch.state),
          branchStatusReason(branch.state),
          [],
        );
      }
    }
  }

  // Merge any fragments whose branch was not mapped above (defensive).
  for (const [key, section] of Object.entries(sections) as [AnalysisKey, AnalysisSection][]) {
    if (!analyses[key] && section) analyses[key] = section;
  }

  if (Object.keys(analyses).length === 0) {
    const reason = "No analysis branch in this run produces this result.";
    const keys: AnalysisKey[] = ["geneExpression", "flux", "metabolomics", "yield", "interactions"];
    for (const key of keys) analyses[key] = emptySection(key, "not_run", reason, []);
  }

  const bundle = {
    schemaVersion: ANALYSIS_BUNDLE_SCHEMA_VERSION,
    run: {
      id: run.id,
      workflowId: context.workflowId,
      workflowVersion: context.workflowVersion,
      status: deriveRunStatus(run, branches),
      createdAt: run.createdAt,
      completedAt: run.finishedAt,
      modelVersions: context.modelVersions,
    },
    organism: context.organism,
    condition: context.condition,
    artifacts: [...artifacts],
    analyses,
  };

  // Validate before returning: the engine never emits an off-contract bundle.
  return parseAnalysisBundle(bundle);
}

/** Convenience: build a run's bundle from a snapshot + a source, resolving context by default. */
export async function bundleFromSnapshot(
  snapshot: { run: RunRecord; branches: BranchRecord[] },
  source: BundleSource = emptyBundleSource,
  context?: BundleContext,
): Promise<AnalysisBundle> {
  const { run, branches } = snapshot;
  const [sections, artifacts] = await Promise.all([
    source.sectionsForRun(run.id),
    source.artifactsForRun(run.id),
  ]);
  return buildRunBundle({
    run,
    branches,
    context: context ?? resolveContext(run, branches),
    sections,
    artifacts,
  });
}
