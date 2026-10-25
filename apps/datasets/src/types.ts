import { z } from "zod";
import { asId } from "@chassix/shared";
import type { Brand, WorkspaceId } from "@chassix/shared";

/**
 * Local dataset/compatibility types for the dataset service (PRD §C/D, §7).
 *
 * `@chassix/shared` is the only cross-package seam: branded IDs reuse its `Brand`/`asId`
 * machinery; dataset- and compat-specific types are defined here (we do NOT edit
 * packages/shared or packages/db). All fixture data produced by this package is
 * illustrative until real repositories and scientific tools land (cross-cutting rule;
 * ADR-D10).
 *
 * "Unknown stays unknown": a field we cannot ground is `null`, never inferred. An
 * empty array means "none recorded", which is distinct from a `null` scalar meaning
 * "not known".
 */

// Branded IDs local to this package (reusing the shared Brand machinery).
export type DatasetVersionId = Brand<string, "DatasetVersionId">;
export type HostId = Brand<string, "HostId">;
export type UploadSessionId = Brand<string, "UploadSessionId">;

export const asDatasetVersionId = (v: string): DatasetVersionId => asId<"DatasetVersionId">(v);
export const asHostId = (v: string): HostId => asId<"HostId">(v);
export const asUploadSessionId = (v: string): UploadSessionId => asId<"UploadSessionId">(v);

/** Re-export for consumers that only import from this package's barrel. */
export type { WorkspaceId, UserId, BranchId } from "@chassix/shared";

/**
 * Analysis modality = the five branch families (PRD §E; scientific sign-off 2026-10-24 added
 * metabolomics and flux analysis for yield predictions). "My uploads" is a *source* tab, not a
 * modality — see {@link DatasetSourceKind}.
 */
export const Modality = {
  Genomics: "genomics",
  TranscriptomicsPerturbation: "transcriptomics_perturbation",
  Pathways: "pathways",
  Metabolomics: "metabolomics",
  Fluxomics: "fluxomics",
} as const;
export type Modality = (typeof Modality)[keyof typeof Modality];

export const DatasetSourceKind = {
  PublicRepository: "public_repository",
  Upload: "upload",
} as const;
export type DatasetSourceKind = (typeof DatasetSourceKind)[keyof typeof DatasetSourceKind];

/** License / access posture. `unknown` is a first-class state, never inferred as `open`. */
export const LicenseAccess = {
  Open: "open",
  Restricted: "restricted",
  Unknown: "unknown",
} as const;
export type LicenseAccess = (typeof LicenseAccess)[keyof typeof LicenseAccess];

/**
 * Availability of the underlying data. There is deliberately no "guaranteed" member:
 * the system never implies guaranteed access (PRD §12, Step 2.4 DoD). When metadata is
 * served from cache after a repository outage, callers receive an explicit age notice
 * and MUST treat availability as not re-verified.
 */
export const AvailabilityStatus = {
  Available: "available",
  Restricted: "restricted",
  Unknown: "unknown",
} as const;
export type AvailabilityStatus = (typeof AvailabilityStatus)[keyof typeof AvailabilityStatus];

/** One row of a sample sheet (PRD §C sample mapping). */
export const SampleMappingRowSchema = z.object({
  sampleId: z.string().min(1),
  /** Condition label; `null` = unknown. */
  condition: z.string().nullable(),
  /** Replicate ordinal within the condition; `null` = unknown. */
  replicate: z.number().int().positive().nullable(),
  /** Free-text display label; `null` = unknown. */
  label: z.string().nullable(),
});
export type SampleMappingRow = z.infer<typeof SampleMappingRowSchema>;

/**
 * DatasetVersion record (PRD §7 + §C fields). IDs are validated as strings at the trust
 * boundary and branded by the constructors below; `null` scalars mean "unknown".
 */
export const DatasetVersionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  /** Accession or stable source identifier (e.g. "GSE123456"). */
  accession: z.string().min(1),
  source: z.nativeEnum(DatasetSourceKind),
  /** Repository id the record came from (e.g. "fixture-geo"); `null` for uploads. */
  repository: z.string().nullable(),
  /** Monotonic version/retrieval label for the record. */
  version: z.string().min(1),
  /** ISO timestamp the metadata was retrieved/finalized. */
  retrievalTimestamp: z.string().datetime(),
  /** sha256 hex of the underlying file; `null` when not computed (metadata-only). */
  checksum: z.string().nullable(),
  licenseAccess: z.nativeEnum(LicenseAccess),
  availability: z.nativeEnum(AvailabilityStatus),
  /** NCBI taxonomy / organism; `null` = unknown. */
  taxonomy: z.string().nullable(),
  strain: z.string().nullable(),
  /** Genome/reference build (e.g. "ASM584v2"); `null` = unknown. */
  reference: z.string().nullable(),
  modality: z.nativeEnum(Modality),
  /** Experimental condition summary; `null` = unknown. */
  condition: z.string().nullable(),
  sampleMapping: z.array(SampleMappingRowSchema),
  /** Biological replicate count "when available" (PRD §C); `null` = unknown. */
  replicateCount: z.number().int().positive().nullable(),
  /** File size in bytes; `null` = unknown. */
  fileSizeBytes: z.number().int().nonnegative().nullable(),
  /** Canonical source link; `null` = unknown. */
  sourceLink: z.string().nullable(),
  /** Assay type (e.g. "RNA-seq"); `null` = unknown. */
  assay: z.string().nullable(),
  /** Quality summary string; `null` = unknown. */
  qualitySummary: z.string().nullable(),
  /** Gene identifier scheme present in the data (e.g. "locus_tag"); `null` = unknown. */
  geneIdScheme: z.string().nullable(),
  /** Contrast labels the dataset can support; empty = none recorded. */
  contrasts: z.array(z.string()),
  /** Human-readable compatibility warnings carried on the record. */
  compatibilityWarnings: z.array(z.string()),
  /** True for illustrative fixture data (cross-cutting rule / ADR-D10). */
  illustrative: z.boolean(),
});

/** Runtime-validated shape (plain strings for IDs). */
export type DatasetVersionRecord = z.infer<typeof DatasetVersionSchema>;

/** Branded view used throughout the service. */
export type DatasetVersion = Omit<DatasetVersionRecord, "id" | "workspaceId"> & {
  id: DatasetVersionId;
  workspaceId: WorkspaceId;
};

/** Validate an untrusted record and brand its IDs. */
export const parseDatasetVersion = (input: unknown): DatasetVersion => {
  const r = DatasetVersionSchema.parse(input);
  return { ...r, id: asDatasetVersionId(r.id), workspaceId: asId<"WorkspaceId">(r.workspaceId) };
};

/**
 * Stable identifier for a dataset version (Step 2.4 DoD "stable identifiers"): the same
 * source + accession + version always maps to the same id.
 */
export const stableDatasetId = (
  source: DatasetSourceKind,
  accession: string,
  version: string,
): DatasetVersionId => asDatasetVersionId(`${source}:${accession}:${version}`);
