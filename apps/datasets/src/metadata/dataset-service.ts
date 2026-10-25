import type { DatasetVersion } from "../types.js";
import {
  RepositoryUnavailableError,
  type DatasetQuery,
  type RepositoryAdapter,
} from "./repository-adapter.js";
import { MetadataCache, formatAgeNotice } from "./metadata-cache.js";

/**
 * Discovery outcome with *distinct* states (Step 2.4 DoD): a live `ok` result, a live but
 * `empty` result, a `cached` fallback carrying a retrieval timestamp + explicit age notice
 * when the repository is unavailable, and a hard `error` when the repository is unavailable
 * and nothing is cached. Empty and error are never conflated.
 */
export type DiscoveryOutcome =
  | { readonly kind: "ok"; readonly records: readonly DatasetVersion[]; readonly fromCache: false }
  | { readonly kind: "empty"; readonly records: readonly []; readonly fromCache: false }
  | {
      readonly kind: "cached";
      readonly records: readonly DatasetVersion[];
      readonly fromCache: true;
      readonly retrievedAt: string;
      readonly ageMs: number;
      readonly ageNotice: string;
    }
  | {
      readonly kind: "error";
      readonly code: "repository_unavailable";
      readonly message: string;
      readonly repositoryId: string;
    };

/** Exact-accession lookup outcome (ADR-D7): absent is distinct from an outage. */
export type AccessionOutcome =
  | { readonly kind: "found"; readonly record: DatasetVersion }
  | { readonly kind: "absent"; readonly accession: string }
  | {
      readonly kind: "error";
      readonly code: "repository_unavailable";
      readonly repositoryId: string;
    };

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

/** Deterministic signature so identical queries share a cache entry. */
const querySignature = (q: DatasetQuery): string =>
  JSON.stringify({
    text: norm(q.text),
    hostStrain: norm(q.hostStrain),
    modality: q.modality ?? "",
    condition: norm(q.condition),
    repository: norm(q.repository),
    assay: norm(q.assay),
    availability: q.availability ?? "",
    referenceBuild: norm(q.referenceBuild),
    licenseAccess: q.licenseAccess ?? "",
  });

/** True when a record satisfies every provided filter + text match. */
export const matchesQuery = (r: DatasetVersion, q: DatasetQuery): boolean => {
  if (q.modality && r.modality !== q.modality) return false;
  if (q.repository && norm(r.repository ?? "") !== norm(q.repository)) return false;
  if (q.availability && r.availability !== q.availability) return false;
  if (q.licenseAccess && r.licenseAccess !== q.licenseAccess) return false;
  if (q.assay && norm(r.assay ?? "") !== norm(q.assay)) return false;
  if (q.referenceBuild && norm(r.reference ?? "") !== norm(q.referenceBuild)) return false;
  if (q.condition && !norm(r.condition ?? "").includes(norm(q.condition))) return false;
  if (q.hostStrain) {
    const hay = `${norm(r.taxonomy ?? "")} ${norm(r.strain ?? "")}`;
    if (!hay.includes(norm(q.hostStrain))) return false;
  }
  if (q.text) {
    const hay = [
      r.accession,
      r.taxonomy,
      r.strain,
      r.reference,
      r.condition,
      r.assay,
      r.qualitySummary,
    ]
      .map((v) => norm(v ?? ""))
      .join(" ");
    for (const token of norm(q.text).split(/\s+/).filter(Boolean)) {
      if (!hay.includes(token)) return false;
    }
  }
  return true;
};

/**
 * Dataset metadata discovery service (PRD §7 Dataset service; Step 2.4).
 *
 * - Filters + text search are applied here (uniform across adapters).
 * - Successful searches are cached with a retrieval timestamp.
 * - On a repository outage the last cached result is served with an explicit age notice;
 *   if nothing is cached, a distinct `error` is returned (never a silent empty result).
 * - Availability is never implied as guaranteed.
 */
export class DatasetService {
  constructor(
    private readonly adapter: RepositoryAdapter,
    private readonly cache: MetadataCache = new MetadataCache(),
  ) {}

  async discover(query: DatasetQuery): Promise<DiscoveryOutcome> {
    const key = MetadataCache.key(this.adapter.id, querySignature(query));
    try {
      const candidates = await this.adapter.search(query);
      const filtered = candidates.filter((r) => matchesQuery(r, query));
      // Cache the filtered, query-specific result so the outage fallback is query-accurate.
      this.cache.put(key, filtered);
      if (filtered.length === 0) return { kind: "empty", records: [], fromCache: false };
      return { kind: "ok", records: filtered, fromCache: false };
    } catch (err) {
      if (!(err instanceof RepositoryUnavailableError)) throw err;
      const entry = this.cache.get(key);
      if (!entry) {
        return {
          kind: "error",
          code: "repository_unavailable",
          repositoryId: err.repositoryId,
          message:
            `Repository "${err.repositoryId}" is unavailable and no cached metadata exists for this query. ` +
            `Retry later or adjust filters.`,
        };
      }
      const ageMs = this.cache.ageMs(entry);
      return {
        kind: "cached",
        records: entry.records,
        fromCache: true,
        retrievedAt: entry.retrievedAt,
        ageMs,
        ageNotice: formatAgeNotice(entry.retrievedAt, ageMs),
      };
    }
  }

  /** Exact accession lookup (ADR-D7): never substituted by text/vector search. */
  async lookupByAccession(accession: string): Promise<AccessionOutcome> {
    try {
      const record = await this.adapter.fetchByAccession(accession);
      return record ? { kind: "found", record } : { kind: "absent", accession };
    } catch (err) {
      if (!(err instanceof RepositoryUnavailableError)) throw err;
      return { kind: "error", code: "repository_unavailable", repositoryId: err.repositoryId };
    }
  }
}
