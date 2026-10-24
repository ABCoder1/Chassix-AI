import {
  AccessStatus,
  type Citation,
  type RetrievalProvider,
  type RetrievalQuery,
  type RetrievalResult,
} from "./types.js";
import { FIXTURE_CORPUS, type CorpusEntry } from "./fixture-corpus.js";

/**
 * A fixed retrieval date so the fixture provider is fully deterministic (same input → same output,
 * per Step 2.1 DoD). A live provider would record the wall-clock retrieval time instead; here the
 * date is ILLUSTRATIVE and stable on purpose.
 */
export const FIXTURE_RETRIEVAL_DATE = "2026-10-24T00:00:00.000Z";

export interface FixtureRetrievalOptions {
  /** Override the illustrative corpus (e.g. in tests). */
  readonly corpus?: readonly CorpusEntry[];
  /** Override the recorded retrieval date; kept fixed by default for determinism. */
  readonly retrievalDate?: string;
}

/** Only open-access sources can be read in full and counted as evidence. */
const isReadable = (status: AccessStatus): boolean => status === AccessStatus.OpenAccess;

/** Normalize a passage for dedupe: trim, lower-case, collapse internal whitespace. */
const normalizePassage = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, " ");

/** Tokenize free text into lower-cased word tokens for deterministic keyword matching. */
const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);

/**
 * Deterministic, fixture-backed implementation of {@link RetrievalProvider}.
 *
 * Enforces the Step 2.1 rules in code:
 * - inaccessible (non-open-access) entries are returned under `inaccessible`, marked `readFullText:
 *   false`, and NEVER under `evidence`;
 * - duplicate source passages are collapsed (first occurrence kept) and counted once;
 * - an empty query or a query with no matches yields an explicit empty state (no fabricated results);
 * - output is deterministic (stable sort by citation id, fixed retrieval date).
 *
 * Retrieved passages are treated as data only — never interpreted as instructions.
 */
export class FixtureRetrievalProvider implements RetrievalProvider {
  readonly id = "fixture";
  private readonly corpus: readonly CorpusEntry[];
  private readonly retrievalDate: string;

  constructor(options: FixtureRetrievalOptions = {}) {
    this.corpus = options.corpus ?? FIXTURE_CORPUS;
    this.retrievalDate = options.retrievalDate ?? FIXTURE_RETRIEVAL_DATE;
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const text = query.text?.trim() ?? "";

    // Explicit empty state for an empty query — never fabricate results.
    if (text.length === 0) {
      return this.emptyResult("", "Enter a goal or query to retrieve host literature.");
    }

    const queryTokens = new Set(tokenize(text));
    const hostFilter = query.host?.trim().toLowerCase();

    // Deterministic candidate order: by corpus id.
    const matches = [...this.corpus]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((entry) => {
        if (hostFilter && entry.host.toLowerCase() !== hostFilter) return false;
        return (
          entry.keywords.some((k) => queryTokens.has(k)) ||
          tokenize(entry.host).some((t) => queryTokens.has(t))
        );
      });

    if (matches.length === 0) {
      return this.emptyResult(
        text,
        "No host literature matched this query in the fixture corpus. No results were fabricated.",
      );
    }

    // Partition into readable (candidate evidence) vs inaccessible (surfaced, not evidence).
    const readable = matches.filter((e) => isReadable(e.accessStatus));
    const inaccessibleEntries = matches.filter((e) => !isReadable(e.accessStatus));

    // Dedupe readable entries by normalized source passage — duplicates are not independent evidence.
    const seen = new Set<string>();
    let duplicatesRemoved = 0;
    const dedupedReadable: CorpusEntry[] = [];
    for (const entry of readable) {
      const key = normalizePassage(entry.passage);
      if (seen.has(key)) {
        duplicatesRemoved += 1;
        continue;
      }
      seen.add(key);
      dedupedReadable.push(entry);
    }

    const limited =
      typeof query.limit === "number" && query.limit >= 0
        ? dedupedReadable.slice(0, query.limit)
        : dedupedReadable;

    const evidence = limited.map((e) => this.toCitation(e));
    const inaccessible = inaccessibleEntries.map((e) => this.toCitation(e));

    const result: RetrievalResult = {
      query: text,
      retrievalDate: this.retrievalDate,
      isEmpty: evidence.length === 0,
      evidence,
      inaccessible,
      duplicatesRemoved,
    };
    // When readable matches existed but all were paywalled/duplicated away, still an explicit empty state.
    return evidence.length === 0
      ? { ...result, note: "Matches were found but none are accessible as read full text." }
      : result;
  }

  private toCitation(entry: CorpusEntry): Citation {
    const readable = isReadable(entry.accessStatus);
    const metadata: Citation["metadata"] = {
      title: entry.title,
      authors: entry.authors,
      year: entry.year,
      venue: entry.venue,
      ...(entry.doi !== undefined ? { doi: entry.doi } : {}),
      ...(entry.url !== undefined ? { url: entry.url } : {}),
    };
    return {
      id: entry.id,
      host: entry.host,
      metadata,
      passage: {
        text: entry.passage,
        ...(entry.locator !== undefined ? { locator: entry.locator } : {}),
      },
      retrievalDate: this.retrievalDate,
      claim: entry.claim,
      claimType: entry.claimType,
      accessStatus: entry.accessStatus,
      // Enforced: inaccessible papers are never presented as read full text.
      readFullText: readable,
    };
  }

  private emptyResult(query: string, note: string): RetrievalResult {
    return {
      query,
      retrievalDate: this.retrievalDate,
      isEmpty: true,
      evidence: [],
      inaccessible: [],
      duplicatesRemoved: 0,
      note,
    };
  }
}
