/**
 * Compatibility checks (PRD §C; Step 2.6) and the warn-vs-block policy table.
 *
 * Two classes:
 *  - **warning**: a scientist may acknowledge a justified warning (recorded as an audit event).
 *  - **blocking**: a structural incompatibility that blocks the affected analysis and can NOT
 *    be acknowledged away.
 */
export const CompatCheck = {
  TaxonomyStrainIdentity: "taxonomy_strain_identity",
  GenomeReferenceVersion: "genome_reference_version",
  SampleLabelConsistency: "sample_label_consistency",
  RequiredReplicates: "required_replicates",
  Contrasts: "contrasts",
  ConditionMismatch: "condition_mismatch",
  GeneIdentifiers: "gene_identifiers",
  BranchPrerequisiteAvailability: "branch_prerequisite_availability",
} as const;
export type CompatCheck = (typeof CompatCheck)[keyof typeof CompatCheck];

export const CompatClass = {
  Warning: "warning",
  Blocking: "blocking",
} as const;
export type CompatClass = (typeof CompatClass)[keyof typeof CompatClass];

/**
 * Default policy. Structural identity/reference/prerequisite mismatches block; the rest are
 * acknowledgeable warnings. This table is the single source of truth and is unit-tested.
 * (Per-workflow stricter policy is a P1 concern — PRD §F.)
 */
export const DEFAULT_COMPAT_POLICY: Readonly<Record<CompatCheck, CompatClass>> = {
  [CompatCheck.TaxonomyStrainIdentity]: CompatClass.Blocking,
  [CompatCheck.GenomeReferenceVersion]: CompatClass.Blocking,
  [CompatCheck.BranchPrerequisiteAvailability]: CompatClass.Blocking,
  [CompatCheck.SampleLabelConsistency]: CompatClass.Warning,
  [CompatCheck.RequiredReplicates]: CompatClass.Warning,
  [CompatCheck.Contrasts]: CompatClass.Warning,
  [CompatCheck.ConditionMismatch]: CompatClass.Warning,
  [CompatCheck.GeneIdentifiers]: CompatClass.Warning,
};

export type CompatPolicy = Readonly<Record<CompatCheck, CompatClass>>;

export const classify = (
  check: CompatCheck,
  policy: CompatPolicy = DEFAULT_COMPAT_POLICY,
): CompatClass => policy[check];
