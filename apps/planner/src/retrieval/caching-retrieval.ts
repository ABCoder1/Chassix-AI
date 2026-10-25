import type { RetrievalProvider, RetrievalQuery, RetrievalResult } from "./types.js";

/**
 * Caches a {@link RetrievalProvider}'s results so a repeated literature survey for the same query
 * is served from memory instead of re-hitting the (potentially slow / rate-limited / paid) source
 * (PRD §12 "cache retrieved literature"; ADR-D9). Keyed by the normalized query; entries expire
 * after a TTL. Wrapping any provider keeps caching orthogonal to retrieval, so the fixture provider
 * and a future Apify-backed one both gain caching unchanged.
 */
export interface CachingRetrievalOptions {
  /** Entry lifetime in ms before a re-fetch (default 1 hour). */
  readonly ttlMs?: number;
  /** Clock seam for tests. */
  readonly now?: () => number;
}

interface CacheEntry {
  readonly at: number;
  readonly result: RetrievalResult;
}

export class CachingRetrievalProvider implements RetrievalProvider {
  readonly id: string;
  readonly #inner: RetrievalProvider;
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(inner: RetrievalProvider, options: CachingRetrievalOptions = {}) {
    this.#inner = inner;
    this.#ttlMs = options.ttlMs ?? 60 * 60 * 1000;
    this.#now = options.now ?? Date.now;
    this.id = `${inner.id}+cache`;
  }

  private key(query: RetrievalQuery): string {
    return JSON.stringify({
      text: query.text.trim().toLowerCase(),
      host: query.host?.trim().toLowerCase() ?? null,
      limit: query.limit ?? null,
    });
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const key = this.key(query);
    const hit = this.#cache.get(key);
    const now = this.#now();
    if (hit && now - hit.at < this.#ttlMs) return hit.result;
    const result = await this.#inner.retrieve(query);
    this.#cache.set(key, { at: now, result });
    return result;
  }

  /** Number of cached queries (inspection / tests). */
  get size(): number {
    return this.#cache.size;
  }

  /** Drop all cached surveys (e.g. a manual "refresh literature"). */
  clear(): void {
    this.#cache.clear();
  }
}
