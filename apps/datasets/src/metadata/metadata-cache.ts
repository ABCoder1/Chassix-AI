import type { DatasetVersion } from "../types.js";

/** A cached search result plus the timestamp it was retrieved. */
export interface CacheEntry {
  readonly records: readonly DatasetVersion[];
  /** ISO timestamp of when this metadata was retrieved from the repository. */
  readonly retrievedAt: string;
}

/**
 * In-memory metadata cache keyed by repository + query signature (PRD §7 "metadata cache",
 * §12 "cache metadata with timestamps"). Each entry carries its retrieval timestamp so the
 * dataset service can serve stale-but-labeled data during a repository outage.
 *
 * Clock is injectable for deterministic tests.
 */
export class MetadataCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Stable signature for a repository + normalized query. */
  static key(repositoryId: string, querySignature: string): string {
    return `${repositoryId}::${querySignature}`;
  }

  put(key: string, records: readonly DatasetVersion[]): CacheEntry {
    const entry: CacheEntry = { records, retrievedAt: this.now().toISOString() };
    this.entries.set(key, entry);
    return entry;
  }

  get(key: string): CacheEntry | null {
    return this.entries.get(key) ?? null;
  }

  /** Age of an entry in milliseconds relative to the (injected) clock. */
  ageMs(entry: CacheEntry): number {
    return this.now().getTime() - new Date(entry.retrievedAt).getTime();
  }
}

/** Human-readable age notice for cached metadata served during an outage. */
export const formatAgeNotice = (retrievedAt: string, ageMs: number): string => {
  const minutes = Math.max(0, Math.round(ageMs / 60_000));
  const human =
    minutes < 60
      ? `${minutes} minute${minutes === 1 ? "" : "s"}`
      : `${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? "" : "s"}`;
  return (
    `Repository unavailable — showing cached metadata retrieved ${retrievedAt} (about ${human} old). ` +
    `Availability has not been re-verified and is not guaranteed.`
  );
};
