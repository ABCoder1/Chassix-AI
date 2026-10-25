import { asId } from "@chassix/shared";
import {
  Modality,
  DatasetSourceKind,
  LicenseAccess,
  AvailabilityStatus,
  stableDatasetId,
} from "../types.js";
import type { DatasetVersion, WorkspaceId } from "../types.js";
import {
  RepositoryUnavailableError,
  type DatasetQuery,
  type RepositoryAdapter,
} from "./repository-adapter.js";

/**
 * Deterministic, fixture-backed repository adapter (ILLUSTRATIVE data — ADR-D10).
 *
 * No live network. The record set is fixed so tests are reproducible. `available` can be
 * toggled to simulate a repository outage (search/fetch then throw
 * {@link RepositoryUnavailableError}) exercising the cached-with-age fallback.
 */
export class FixtureRepositoryAdapter implements RepositoryAdapter {
  public available = true;
  private readonly records: readonly DatasetVersion[];

  constructor(
    public readonly id: string = "fixture-geo",
    workspaceId: WorkspaceId = asId<"WorkspaceId">("ws-public"),
    records?: readonly DatasetVersion[],
  ) {
    this.records = records ?? FixtureRepositoryAdapter.defaultRecords(id, workspaceId);
  }

  async search(_query: DatasetQuery): Promise<readonly DatasetVersion[]> {
    if (!this.available) throw new RepositoryUnavailableError(this.id);
    // The service applies filters + text search uniformly; the adapter returns candidates.
    return this.records;
  }

  async fetchByAccession(accession: string): Promise<DatasetVersion | null> {
    if (!this.available) throw new RepositoryUnavailableError(this.id);
    return this.records.find((r) => r.accession === accession) ?? null;
  }

  /** Illustrative seed corpus covering the three modalities + unknown-metadata cases. */
  static defaultRecords(repository: string, workspaceId: WorkspaceId): readonly DatasetVersion[] {
    const base = (
      accession: string,
      modality: Modality,
      fields: Partial<DatasetVersion>,
    ): DatasetVersion => ({
      id: stableDatasetId(DatasetSourceKind.PublicRepository, accession, "v1"),
      workspaceId,
      accession,
      source: DatasetSourceKind.PublicRepository,
      repository,
      version: "v1",
      retrievalTimestamp: "2026-10-20T12:00:00.000Z",
      checksum: null,
      licenseAccess: LicenseAccess.Open,
      availability: AvailabilityStatus.Available,
      taxonomy: null,
      strain: null,
      reference: null,
      modality,
      condition: null,
      sampleMapping: [],
      replicateCount: null,
      fileSizeBytes: null,
      sourceLink: `https://example.org/${accession}`,
      assay: null,
      qualitySummary: null,
      geneIdScheme: null,
      contrasts: [],
      compatibilityWarnings: [],
      illustrative: true,
      ...fields,
    });

    return [
      base("GSE-THERMO-01", Modality.TranscriptomicsPerturbation, {
        taxonomy: "Bacillus subtilis",
        strain: "168",
        reference: "ASM904v1",
        condition: "heat shock 52C vs 37C",
        assay: "RNA-seq",
        replicateCount: 3,
        fileSizeBytes: 5_242_880,
        geneIdScheme: "locus_tag",
        contrasts: ["heat_vs_control"],
        qualitySummary: "Illustrative: median Q30 > 90%",
        sampleMapping: [
          { sampleId: "S1", condition: "control", replicate: 1, label: "37C-rep1" },
          { sampleId: "S2", condition: "heat", replicate: 1, label: "52C-rep1" },
        ],
      }),
      base("ASM-GEOBAC-02", Modality.Genomics, {
        taxonomy: "Geobacillus thermoglucosidasius",
        strain: "C56-YS93",
        reference: "ASM18260v1",
        assay: "WGS",
        fileSizeBytes: 3_670_016,
        licenseAccess: LicenseAccess.Open,
      }),
      base("PWY-ECOLI-03", Modality.Pathways, {
        taxonomy: "Escherichia coli",
        strain: "K-12 MG1655",
        reference: "ASM584v2",
        assay: "pathway-model",
        // license + replicate deliberately unknown to exercise "unknown stays unknown"
        licenseAccess: LicenseAccess.Unknown,
      }),
    ];
  }
}
