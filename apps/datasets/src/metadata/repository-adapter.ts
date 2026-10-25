import type { DatasetVersion, Modality, LicenseAccess, AvailabilityStatus } from "../types.js";

/**
 * Query over public repository metadata (PRD §C filters). All filters are optional; a
 * `null`/absent filter does not constrain. Text search is a plain substring/token match
 * here (Postgres FTS in production, ADR-D7) and NEVER replaces exact accession lookup.
 */
export interface DatasetQuery {
  readonly text?: string;
  readonly hostStrain?: string;
  readonly modality?: Modality;
  readonly condition?: string;
  readonly repository?: string;
  readonly assay?: string;
  readonly availability?: AvailabilityStatus;
  readonly referenceBuild?: string;
  readonly licenseAccess?: LicenseAccess;
}

/**
 * Raised by an adapter when the backing repository cannot be reached. The dataset service
 * catches this and serves cached metadata with an explicit age notice (PRD §12), rather
 * than surfacing it as an empty result.
 */
export class RepositoryUnavailableError extends Error {
  constructor(
    public readonly repositoryId: string,
    message?: string,
  ) {
    super(message ?? `Repository "${repositoryId}" is unavailable`);
    this.name = "RepositoryUnavailableError";
  }
}

/**
 * Adapter over a single public multiomics repository (PRD §7 "Repository adapters").
 * Implementations throw {@link RepositoryUnavailableError} on outage; they never fabricate
 * records and never imply guaranteed availability.
 */
export interface RepositoryAdapter {
  /** Stable repository id (e.g. "fixture-geo"). */
  readonly id: string;
  /**
   * Candidate records matching the (optional) modality/repository hints on the query.
   * Fine-grained filtering + text search is applied by the service so that logic is
   * uniform and testable across adapters. Throws on repository outage.
   */
  search(query: DatasetQuery): Promise<readonly DatasetVersion[]>;
  /**
   * Exact accession lookup (ADR-D7: must not be replaced by FTS/vector search). Returns
   * `null` when the accession is genuinely absent (a distinct state from an outage, which
   * throws).
   */
  fetchByAccession(accession: string): Promise<DatasetVersion | null>;
}
