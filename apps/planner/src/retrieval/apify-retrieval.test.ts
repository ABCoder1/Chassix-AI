import { describe, it, expect, vi } from "vitest";
import { ApifyRetrievalProvider } from "./apify-retrieval.js";

/** Build a fake fetch returning the given dataset items as JSON (and capturing the request). */
function fakeFetch(items: unknown, capture?: (url: string, init?: RequestInit) => void) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    capture?.(url, init);
    return new Response(JSON.stringify(items), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("ApifyRetrievalProvider", () => {
  it("maps actor items to citations, counts only open-access as evidence, dedupes", async () => {
    let seenUrl = "";
    let body: unknown;
    const fetchImpl = fakeFetch(
      [
        {
          title: "Thermotolerant Bacillus review",
          abstract: "Bacillus subtilis keeps secreted enzyme activity at 52C.",
          organism: "Bacillus subtilis",
          authors: ["A. One", "B. Two"],
          year: 2022,
          doi: "10.1/x",
          isOpenAccess: true,
        },
        {
          title: "Dup passage",
          abstract: "Bacillus subtilis keeps secreted enzyme activity at 52C.", // duplicate passage
          organism: "Bacillus subtilis",
          isOpenAccess: true,
        },
        {
          title: "Paywalled study",
          abstract: "Some other finding.",
          organism: "Escherichia coli",
          // no OA marker → abstract-only → inaccessible, not evidence
        },
        {
          title: "No organism — skipped",
          abstract: "Unattributable passage.",
        },
      ],
      (url, init) => {
        seenUrl = url;
        body = init?.body ? JSON.parse(String(init.body)) : undefined;
      },
    );

    const provider = new ApifyRetrievalProvider({
      token: "tok",
      actorId: "apify~scholar",
      maxItems: 10,
      fetchImpl,
    });
    const result = await provider.retrieve({ text: "thermotolerant enzyme host" });

    expect(seenUrl).toContain("/acts/apify~scholar/run-sync-get-dataset-items");
    expect(seenUrl).toContain("token=tok");
    expect(body).toMatchObject({ query: "thermotolerant enzyme host" });

    expect(result.isEmpty).toBe(false);
    expect(result.evidence).toHaveLength(1); // one OA Bacillus (the dup collapsed)
    expect(result.evidence[0]!.host).toBe("Bacillus subtilis");
    expect(result.evidence[0]!.readFullText).toBe(true);
    expect(result.duplicatesRemoved).toBe(1);
    // E. coli abstract-only is surfaced but NOT evidence.
    expect(result.inaccessible.some((c) => c.host === "Escherichia coli")).toBe(true);
    expect(result.evidence.some((c) => c.host === "Escherichia coli")).toBe(false);
  });

  it("returns an explicit empty state on a non-200 response (no fabrication)", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("err", { status: 500 }),
    ) as unknown as typeof fetch;
    const provider = new ApifyRetrievalProvider({ token: "t", actorId: "a~b", fetchImpl });
    const result = await provider.retrieve({ text: "q" });
    expect(result.isEmpty).toBe(true);
    expect(result.evidence).toHaveLength(0);
    expect(result.note).toContain("500");
  });

  it("requires a token and actorId", () => {
    expect(() => new ApifyRetrievalProvider({ token: "", actorId: "a" })).toThrow();
  });
});
