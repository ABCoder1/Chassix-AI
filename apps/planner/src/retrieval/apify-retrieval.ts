import {
  AccessStatus,
  ClaimType,
  type Citation,
  type RetrievalProvider,
  type RetrievalQuery,
  type RetrievalResult,
} from "./types.js";

/**
 * Live, Apify-backed literature retriever (ADR-D9). Runs an Apify actor that searches the
 * literature and maps each returned record into a citation-first {@link RetrievalResult}, obeying
 * the same honesty rules as the fixture provider:
 *   - only open-access records are marked read full text and counted as evidence;
 *   - everything else is surfaced under `inaccessible`, never fabricated away;
 *   - duplicate source passages are collapsed and not counted as independent evidence;
 *   - an empty survey returns an explicit empty state.
 *
 * Credentials (the Apify token) stay server-side and are passed only in the request; the HTTP call
 * is injectable (`fetchImpl`) so tests run with a fake and no token. The actor, its input, and the
 * item→citation mapping are configurable because actor output schemas differ; the defaults target a
 * generic `{ query }` actor and read common scholarly fields. Host (organism) attribution comes from
 * an `organism`/`host` field on the item or from `query.host`; records without a host cannot be
 * grouped for ranking (documented), so configure the mapper/actor to supply it.
 *
 * Wrap this in {@link CachingRetrievalProvider} to cache the survey (that is how the API wires it).
 */
export interface ApifyRetrievalConfig {
  readonly token: string;
  /** Apify actor id, e.g. "apify~google-search-scraper". */
  readonly actorId: string;
  /** Max dataset items to request (default 25). */
  readonly maxItems?: number;
  /** Build the actor input from a query (default `{ query, maxItems }`). */
  readonly buildInput?: (query: RetrievalQuery) => Record<string, unknown>;
  /** Map one dataset item to a Citation, or null to skip it (default reads common fields). */
  readonly mapItem?: (item: Record<string, unknown>, query: RetrievalQuery) => Citation | null;
  /** Injected fetch (default global fetch). */
  readonly fetchImpl?: typeof fetch;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

const firstString = (item: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const s = str(item[k]);
    if (s) return s;
  }
  return undefined;
};

const asAuthors = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((a) => String(a)).filter((a) => a.length > 0);
  const s = str(v);
  return s
    ? s
        .split(/[;,]/)
        .map((a) => a.trim())
        .filter(Boolean)
    : [];
};

const asYear = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const m = str(v)?.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
};

const truthy = (v: unknown): boolean =>
  v === true || v === "true" || v === 1 || v === "open" || v === "openAccess";

/** Default mapper: read common scholarly fields; mark OA records read, others abstract-only. */
function defaultMapItem(item: Record<string, unknown>, query: RetrievalQuery): Citation | null {
  const title = firstString(item, ["title", "name", "headline"]);
  const passage = firstString(item, ["abstract", "snippet", "description", "summary", "text"]);
  if (!title && !passage) return null;

  const host = firstString(item, ["organism", "host", "strain", "species"]) ?? query.host;
  if (!host) return null; // cannot attribute to a host → cannot rank; skip (never guess the organism)

  const openAccess =
    truthy(item.isOpenAccess) ||
    truthy(item.openAccess) ||
    truthy(item.oa) ||
    Boolean(firstString(item, ["pdfUrl", "fullTextUrl", "openAccessPdf"]));
  const accessStatus = openAccess ? AccessStatus.OpenAccess : AccessStatus.AbstractOnly;

  return {
    id:
      firstString(item, ["id", "doi", "url", "link"]) ??
      `${host}:${title ?? passage}`.slice(0, 120),
    host,
    metadata: {
      title: title ?? "(untitled)",
      authors: asAuthors(item.authors ?? item.author),
      year: asYear(item.year ?? item.publicationYear ?? item.date),
      venue: firstString(item, ["venue", "journal", "source", "publisher"]) ?? "",
      ...(firstString(item, ["doi"]) ? { doi: firstString(item, ["doi"])! } : {}),
      ...(firstString(item, ["url", "link"]) ? { url: firstString(item, ["url", "link"])! } : {}),
    },
    passage: { text: passage ?? title ?? "" },
    retrievalDate: new Date().toISOString(),
    claim: title ?? passage ?? "",
    // A search snippet is inferred support unless the mapper is configured to assert "observed".
    claimType: ClaimType.Inferred,
    accessStatus,
    // Honesty invariant: full text is only "read" for open-access records.
    readFullText: accessStatus === AccessStatus.OpenAccess,
  };
}

export class ApifyRetrievalProvider implements RetrievalProvider {
  readonly id = "apify";
  readonly #config: Required<Pick<ApifyRetrievalConfig, "token" | "actorId">> &
    ApifyRetrievalConfig;
  readonly #fetch: typeof fetch;

  constructor(config: ApifyRetrievalConfig) {
    if (!config.token || !config.actorId) {
      throw new Error("ApifyRetrievalProvider requires a token and actorId.");
    }
    this.#config = config;
    this.#fetch = config.fetchImpl ?? fetch;
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const maxItems = this.#config.maxItems ?? 25;
    const input = this.#config.buildInput
      ? this.#config.buildInput(query)
      : { query: query.text, maxItems };
    const map = this.#config.mapItem ?? defaultMapItem;

    const url =
      `https://api.apify.com/v2/acts/${encodeURIComponent(this.#config.actorId)}` +
      `/run-sync-get-dataset-items?token=${encodeURIComponent(this.#config.token)}&clean=true`;

    const retrievalDate = new Date().toISOString();
    let items: unknown;
    try {
      const res = await this.#fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        return this.empty(query.text, retrievalDate, `Apify actor returned ${res.status}.`);
      }
      items = await res.json();
    } catch (err) {
      return this.empty(
        query.text,
        retrievalDate,
        `Could not reach Apify: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!Array.isArray(items)) {
      return this.empty(query.text, retrievalDate, "Apify actor returned no dataset items.");
    }

    const mapped = items
      .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
      .map((it) => map(it, query))
      .filter((c): c is Citation => c !== null)
      .slice(0, maxItems);

    // Dedupe by normalized passage; an identical passage is not independent evidence.
    const seen = new Set<string>();
    const unique: Citation[] = [];
    let duplicatesRemoved = 0;
    for (const c of mapped) {
      const key = c.passage.text.trim().toLowerCase();
      if (key && seen.has(key)) {
        duplicatesRemoved++;
        continue;
      }
      if (key) seen.add(key);
      unique.push(c);
    }

    const evidence = unique.filter(
      (c) => c.readFullText && c.accessStatus === AccessStatus.OpenAccess,
    );
    const inaccessible = unique.filter(
      (c) => !(c.readFullText && c.accessStatus === AccessStatus.OpenAccess),
    );

    return {
      query: query.text,
      retrievalDate,
      isEmpty: evidence.length === 0,
      evidence,
      inaccessible,
      duplicatesRemoved,
      ...(evidence.length === 0
        ? { note: "No open-access evidence found for this query via the configured Apify actor." }
        : {}),
    };
  }

  private empty(query: string, retrievalDate: string, note: string): RetrievalResult {
    return {
      query,
      retrievalDate,
      isEmpty: true,
      evidence: [],
      inaccessible: [],
      duplicatesRemoved: 0,
      note,
    };
  }
}
