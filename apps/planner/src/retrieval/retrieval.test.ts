import { describe, it, expect } from "vitest";
import { FixtureRetrievalProvider, FIXTURE_RETRIEVAL_DATE } from "./fixture-retrieval.js";
import { AccessStatus } from "./types.js";

const QUERY = { text: "thermotolerant microbial host for industrial enzyme production" };

describe("FixtureRetrievalProvider", () => {
  it("links every evidence citation to a claim and records a retrieval date", async () => {
    const res = await new FixtureRetrievalProvider().retrieve(QUERY);
    expect(res.evidence.length).toBeGreaterThan(0);
    for (const c of res.evidence) {
      expect(c.claim.length).toBeGreaterThan(0);
      expect(c.passage.text.length).toBeGreaterThan(0);
      expect(c.retrievalDate).toBe(FIXTURE_RETRIEVAL_DATE);
    }
    expect(res.retrievalDate).toBe(FIXTURE_RETRIEVAL_DATE);
  });

  it("de-duplicates identical source passages (not counted as independent evidence)", async () => {
    const res = await new FixtureRetrievalProvider().retrieve(QUERY);
    const passages = res.evidence.map((c) => c.passage.text.trim().toLowerCase());
    expect(new Set(passages).size).toBe(passages.length);
    // The corpus seeds one duplicated passage (lit-0001/lit-0002).
    expect(res.duplicatesRemoved).toBeGreaterThanOrEqual(1);
    const bsubIds = res.evidence.filter((c) => c.host === "Bacillus subtilis").map((c) => c.id);
    expect(bsubIds).not.toContain("lit-0002");
  });

  it("returns an explicit empty state for an empty query (no fabricated results)", async () => {
    const res = await new FixtureRetrievalProvider().retrieve({ text: "   " });
    expect(res.isEmpty).toBe(true);
    expect(res.evidence).toHaveLength(0);
    expect(res.inaccessible).toHaveLength(0);
    expect(res.note).toBeTruthy();
  });

  it("returns an explicit empty state when nothing matches (no fabrication)", async () => {
    const res = await new FixtureRetrievalProvider().retrieve({
      text: "quantum chromodynamics lattice",
    });
    expect(res.isEmpty).toBe(true);
    expect(res.evidence).toHaveLength(0);
    expect(res.note).toMatch(/no .*fabricat/i);
  });

  it("marks paywalled/unavailable sources not-read and never surfaces them as evidence", async () => {
    const res = await new FixtureRetrievalProvider().retrieve(QUERY);
    const evidenceIds = res.evidence.map((c) => c.id);
    // Paywalled (lit-0007) and unavailable (lit-0008) must not appear in evidence.
    expect(evidenceIds).not.toContain("lit-0007");
    expect(evidenceIds).not.toContain("lit-0008");
    // Every evidence citation is read full text and open access.
    for (const c of res.evidence) {
      expect(c.readFullText).toBe(true);
      expect(c.accessStatus).toBe(AccessStatus.OpenAccess);
    }
    // The inaccessible ones are surfaced but marked not-read.
    const inaccessibleIds = res.inaccessible.map((c) => c.id);
    expect(inaccessibleIds).toContain("lit-0007");
    expect(inaccessibleIds).toContain("lit-0008");
    for (const c of res.inaccessible) {
      expect(c.readFullText).toBe(false);
      expect(c.accessStatus).not.toBe(AccessStatus.OpenAccess);
    }
  });

  it("is deterministic over the fixture corpus (same input → same output)", async () => {
    const a = await new FixtureRetrievalProvider().retrieve(QUERY);
    const b = await new FixtureRetrievalProvider().retrieve(QUERY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("supports a host filter that narrows evidence to one organism", async () => {
    const res = await new FixtureRetrievalProvider().retrieve({
      ...QUERY,
      host: "Thermus thermophilus",
    });
    expect(res.evidence.length).toBeGreaterThan(0);
    for (const c of res.evidence) expect(c.host).toBe("Thermus thermophilus");
  });
});
