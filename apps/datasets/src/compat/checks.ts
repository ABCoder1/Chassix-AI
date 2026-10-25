import type { DatasetVersion, Modality, BranchId, HostId } from "../types.js";
import {
  CompatCheck,
  CompatClass,
  classify,
  type CompatPolicy,
  DEFAULT_COMPAT_POLICY,
} from "./policy.js";

/**
 * The requirement a selected branch (for a given host) imposes on a dataset. `null` fields
 * are "no requirement / unknown" and do not themselves trigger a finding (unknown stays
 * unknown — we do not fabricate a mismatch against an unknown expectation).
 */
export interface BranchRequirement {
  readonly branchId: BranchId;
  readonly kind: Modality;
  readonly hostId: HostId;
  readonly expectedTaxonomy: string | null;
  readonly expectedStrain: string | null;
  readonly expectedReference: string | null;
  readonly requiredReplicates: number | null;
  readonly requiredContrasts: readonly string[];
  readonly expectedConditions: readonly string[];
  readonly expectedGeneIdScheme: string | null;
  /** Branch prerequisites that must be available before this branch can run. */
  readonly prerequisites: readonly string[];
  /** Prerequisites currently satisfied/available. */
  readonly availablePrerequisites: readonly string[];
}

export interface CompatFinding {
  readonly checkId: CompatCheck;
  readonly class: CompatClass;
  readonly datasetId: DatasetVersion["id"];
  readonly branchId: BranchId;
  readonly hostId: HostId;
  readonly message: string;
  readonly expected: string | null;
  readonly actual: string | null;
}

const eqCaseless = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Run every compatibility check for one (dataset, branch, host) triple and return the
 * findings, each classified via the policy table. No finding = compatible on that axis.
 */
export const runCompatChecks = (
  dataset: DatasetVersion,
  req: BranchRequirement,
  policy: CompatPolicy = DEFAULT_COMPAT_POLICY,
): readonly CompatFinding[] => {
  const findings: CompatFinding[] = [];
  const add = (
    checkId: CompatCheck,
    message: string,
    expected: string | null,
    actual: string | null,
  ): void => {
    findings.push({
      checkId,
      class: classify(checkId, policy),
      datasetId: dataset.id,
      branchId: req.branchId,
      hostId: req.hostId,
      message,
      expected,
      actual,
    });
  };

  // Taxonomy / strain identity (structural).
  if (
    req.expectedTaxonomy &&
    dataset.taxonomy &&
    !eqCaseless(dataset.taxonomy, req.expectedTaxonomy)
  ) {
    add(
      CompatCheck.TaxonomyStrainIdentity,
      `Taxonomy mismatch: dataset is "${dataset.taxonomy}" but the branch host expects "${req.expectedTaxonomy}".`,
      req.expectedTaxonomy,
      dataset.taxonomy,
    );
  } else if (
    req.expectedStrain &&
    dataset.strain &&
    !eqCaseless(dataset.strain, req.expectedStrain)
  ) {
    add(
      CompatCheck.TaxonomyStrainIdentity,
      `Strain mismatch: dataset strain "${dataset.strain}" does not match expected "${req.expectedStrain}".`,
      req.expectedStrain,
      dataset.strain,
    );
  }

  // Genome / reference version (structural).
  if (
    req.expectedReference &&
    dataset.reference &&
    !eqCaseless(dataset.reference, req.expectedReference)
  ) {
    add(
      CompatCheck.GenomeReferenceVersion,
      `Reference build mismatch: dataset uses "${dataset.reference}" but the branch requires "${req.expectedReference}".`,
      req.expectedReference,
      dataset.reference,
    );
  }

  // Sample-label consistency (warning): a sample row missing a label.
  const unlabeled = dataset.sampleMapping.filter((s) => s.label === null).map((s) => s.sampleId);
  if (unlabeled.length > 0) {
    add(
      CompatCheck.SampleLabelConsistency,
      `Sample label(s) missing for: ${unlabeled.join(", ")}. Map them in the sample sheet.`,
      "all samples labeled",
      `${unlabeled.length} unlabeled`,
    );
  }

  // Required replicates (warning).
  if (req.requiredReplicates !== null) {
    if (dataset.replicateCount === null) {
      add(
        CompatCheck.RequiredReplicates,
        `Replicate count is unknown; the branch recommends at least ${req.requiredReplicates}.`,
        String(req.requiredReplicates),
        "unknown",
      );
    } else if (dataset.replicateCount < req.requiredReplicates) {
      add(
        CompatCheck.RequiredReplicates,
        `Only ${dataset.replicateCount} replicate(s); the branch recommends at least ${req.requiredReplicates}.`,
        String(req.requiredReplicates),
        String(dataset.replicateCount),
      );
    }
  }

  // Contrasts (warning): required contrast not present in the dataset.
  for (const c of req.requiredContrasts) {
    if (!dataset.contrasts.some((dc) => eqCaseless(dc, c))) {
      add(
        CompatCheck.Contrasts,
        `Required contrast "${c}" is not available in the dataset.`,
        c,
        dataset.contrasts.length ? dataset.contrasts.join(", ") : "none",
      );
    }
  }

  // Condition mismatch (warning): dataset condition not among expected conditions.
  if (req.expectedConditions.length > 0 && dataset.condition) {
    const covered = req.expectedConditions.some((c) =>
      dataset.condition!.toLowerCase().includes(c.toLowerCase()),
    );
    if (!covered) {
      add(
        CompatCheck.ConditionMismatch,
        `Dataset condition "${dataset.condition}" is outside the expected conditions (${req.expectedConditions.join(", ")}).`,
        req.expectedConditions.join(", "),
        dataset.condition,
      );
    }
  }

  // Gene identifiers (warning).
  if (
    req.expectedGeneIdScheme &&
    dataset.geneIdScheme &&
    !eqCaseless(dataset.geneIdScheme, req.expectedGeneIdScheme)
  ) {
    add(
      CompatCheck.GeneIdentifiers,
      `Gene identifier scheme "${dataset.geneIdScheme}" differs from expected "${req.expectedGeneIdScheme}"; harmonization may be required.`,
      req.expectedGeneIdScheme,
      dataset.geneIdScheme,
    );
  }

  // Branch-prerequisite availability (structural / blocking).
  const missing = req.prerequisites.filter((p) => !req.availablePrerequisites.includes(p));
  if (missing.length > 0) {
    add(
      CompatCheck.BranchPrerequisiteAvailability,
      `Branch prerequisite(s) unavailable: ${missing.join(", ")}.`,
      req.prerequisites.join(", "),
      req.availablePrerequisites.length ? req.availablePrerequisites.join(", ") : "none",
    );
  }

  return findings;
};
