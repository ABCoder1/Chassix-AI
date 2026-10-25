import { describe, it, expect } from "vitest";
import {
  AccessStatus,
  ClaimType,
  type Citation,
  type RetrievalProvider,
  type RetrievalQuery,
  type RetrievalResult,
} from "./retrieval/index.js";
import { CachingRetrievalProvider } from "./retrieval/caching-retrieval.js";
import { discoverHosts } from "./discovery.js";

function citation(host: string, id: string, claimType: ClaimType = ClaimType.Observed): Citation {
  return {
    id,
    host,
    metadata: { title: `Study ${id}`, authors: ["A. Author"], year: 2023, venue: "J. Microbiol" },
    passage: { text: `Evidence passage for ${host}.` },
    retrievalDate: "2026-10-25T00:00:00.000Z",
    claim: `${host} is suitable`,
    claimType,
    accessStatus: AccessStatus.OpenAccess,
    readFullText: true,
  };
}

/** A fake provider returning a fixed result and counting calls (for cache + grouping tests). */
class FakeProvider implements RetrievalProvider {
  readonly id = "fake";
  calls = 0;
  constructor(private readonly result: RetrievalResult) {}
  async retrieve(_query: RetrievalQuery): Promise<RetrievalResult> {
    this.calls++;
    return this.result;
  }
}

const twoHostResult: RetrievalResult = {
  query: "thermotolerant host",
  retrievalDate: "2026-10-25T00:00:00.000Z",
  isEmpty: false,
  evidence: [
    citation("Bacillus licheniformis", "c1"),
    citation("Bacillus licheniformis", "c2"),
    citation("Escherichia coli", "c3", ClaimType.Inferred),
  ],
  inaccessible: [],
  duplicatesRemoved: 0,
};

describe("discoverHosts (RAG: survey → ranked hosts)", () => {
  it("groups evidence by host and ranks candidates with their citations", async () => {
    const d = await discoverHosts(new FakeProvider(twoHostResult), {
      query: "thermotolerant host",
    });
    expect(d.isEmpty).toBe(false);
    expect(d.hosts.map((h) => h.host)).toEqual(["Bacillus licheniformis", "Escherichia coli"]);
    // Bacillus (2 sources, 2 observed) outranks E. coli (1 inferred).
    expect(d.hosts[0]!.score.score).toBeGreaterThan(d.hosts[1]!.score.score);
    expect(d.hosts[0]!.citations).toHaveLength(2);
    expect(d.hosts[0]!.score.supportingSourceCount).toBe(2);
  });

  it("reports an explicit empty discovery when retrieval found nothing", async () => {
    const empty: RetrievalResult = {
      query: "nonsense",
      retrievalDate: "2026-10-25T00:00:00.000Z",
      isEmpty: true,
      evidence: [],
      inaccessible: [],
      duplicatesRemoved: 0,
      note: "No accessible evidence.",
    };
    const d = await discoverHosts(new FakeProvider(empty), { query: "nonsense" });
    expect(d.isEmpty).toBe(true);
    expect(d.hosts).toHaveLength(0);
    expect(d.note).toContain("No accessible evidence");
  });
});

describe("CachingRetrievalProvider (survey caching)", () => {
  it("serves a repeated identical query from cache, then re-fetches after TTL", async () => {
    let clock = 1000;
    const inner = new FakeProvider(twoHostResult);
    const cached = new CachingRetrievalProvider(inner, { ttlMs: 500, now: () => clock });

    await cached.retrieve({ text: "Thermotolerant Host" });
    await cached.retrieve({ text: "thermotolerant host" }); // normalized → same key
    expect(inner.calls).toBe(1);
    expect(cached.size).toBe(1);

    clock += 600; // past TTL
    await cached.retrieve({ text: "thermotolerant host" });
    expect(inner.calls).toBe(2);
  });
});
