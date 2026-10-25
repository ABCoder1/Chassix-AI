/**
 * ILLUSTRATIVE plan-review fixtures (Step 3.2 / BF-05, Screen 4, PRD §D).
 *
 * Static fixtures, NOT the output of the live planner or orchestrator. Wiring the
 * review UI to the manifest API is out of scope for this step; the shape here
 * deliberately mirrors `RunManifest` from @chassix/shared so a later fetch swap is
 * trivial. Per the cross-cutting "no fabricated results" rule, every value is
 * illustrative and labeled as such in the UI; resource estimates are ranges, not
 * promises, and unresolved assumptions / blocked branches are surfaced, not hidden.
 */

/** One planned analysis branch (maps 1:1 to a launched Run branch). */
export interface PlannedBranch {
  id: string;
  /** Short branch name (analysis × host). */
  title: string;
  /** The host this branch targets. */
  host: string;
  /** Datasets fed into this branch. */
  datasets: string[];
  /** Proposed tools + the pinned versions that go into the manifest. */
  tools: { name: string; version: string }[];
  /** Required reference datasets/genomes + versions. */
  references: { name: string; version: string }[];
  /** Expected output artifacts (validated before "Succeeded"). */
  expectedOutputs: string[];
  /** Remote compute environment / container image. */
  environment: string;
  /** Estimated resource range, or null when the executor can't estimate yet. */
  estimatedResources: string | null;
  /** Plainly-worded blocker, if the branch cannot launch yet. */
  blockedReason: string | null;
}

/** A single parameter row, split into basic vs advanced for the expandable panel. */
export interface PlanParameter {
  key: string;
  value: string;
  advanced: boolean;
}

export interface PlanDraft {
  runId: string;
  goalPrompt: string;
  hosts: string[];
  datasets: string[];
  branches: PlannedBranch[];
  parameters: PlanParameter[];
  /** Contrast tables / comparisons the plan will compute. */
  contrasts: string[];
  /** Unresolved assumptions the user should confirm before launch. */
  unresolvedAssumptions: string[];
}

export const ILLUSTRATIVE_PLAN_LABEL =
  "Illustrative execution plan — hosts, tools, versions, resource ranges and outputs are fixtures, not a live manifest. Starting analyses here does not launch a real remote job.";

export const ILLUSTRATIVE_PLAN: PlanDraft = {
  runId: "run-ILLUSTRATIVE-0001",
  goalPrompt:
    "I want a more thermotolerant microbial host for producing an industrial enzyme with reduced cooling requirements.",
  hosts: ["Bacillus licheniformis (BL-01)", "Kluyveromyces marxianus (KM-07)"],
  datasets: [
    "Reference genome assembly (illustrative)",
    "Heat-stress expression series (illustrative)",
    "Curated pathway model (illustrative)",
  ],
  branches: [
    {
      id: "branch-genome-bl01",
      title: "Genome assessment × B. licheniformis",
      host: "Bacillus licheniformis (BL-01)",
      datasets: ["Reference genome assembly (illustrative)"],
      tools: [
        { name: "assembly-qc", version: "2.3.1" },
        { name: "annotate", version: "1.9.0" },
      ],
      references: [{ name: "BL-01 reference genome", version: "2024-07" }],
      expectedOutputs: ["Assembly QC report", "Annotated feature table"],
      environment: "remote-cpu-small (illustrative)",
      estimatedResources: "~2 vCPU · ~4 GB · ~15–25 min (estimated range)",
      blockedReason: null,
    },
    {
      id: "branch-expr-bl01",
      title: "Expression analysis × B. licheniformis",
      host: "Bacillus licheniformis (BL-01)",
      datasets: ["Heat-stress expression series (illustrative)"],
      tools: [{ name: "expr-contrast", version: "3.0.2" }],
      references: [{ name: "BL-01 reference genome", version: "2024-07" }],
      expectedOutputs: ["Contrast table", "Per-gene uncertainty summary"],
      environment: "remote-cpu-medium (illustrative)",
      estimatedResources: "~4 vCPU · ~8 GB · ~20–40 min (estimated range)",
      blockedReason: null,
    },
    {
      id: "branch-pathway-km07",
      title: "Pathway mapping × K. marxianus",
      host: "Kluyveromyces marxianus (KM-07)",
      datasets: ["Curated pathway model (illustrative)"],
      tools: [{ name: "pathway-map", version: "0.8.4" }],
      references: [{ name: "KM-07 pathway references", version: "2023-11" }],
      expectedOutputs: ["Pathway enrichment table"],
      environment: "remote-cpu-small (illustrative)",
      estimatedResources: null, // executor cannot estimate yet — shown as "unknown".
      blockedReason:
        "Blocked: the target operating temperature range is still unknown and is required to parameterize this branch.",
    },
  ],
  parameters: [
    { key: "Significance threshold (FDR)", value: "0.05", advanced: false },
    { key: "Minimum evidence sources per claim", value: "2", advanced: false },
    { key: "Random seed", value: "20261024", advanced: true },
    { key: "Max retries per branch", value: "2", advanced: true },
    { key: "Identifier harmonization mode", value: "strict (no unit averaging)", advanced: true },
  ],
  contrasts: [
    "Heat-stress vs. baseline expression (illustrative)",
    "Candidate host A vs. candidate host B suitability (advisory)",
  ],
  unresolvedAssumptions: [
    "Submerged fermentation at industrial scale (not confirmed).",
    "Enzyme is heterologously expressed rather than native (not confirmed).",
  ],
};
