import { describe, it, expect } from "vitest";
import { asId } from "@chassix/shared";
import { Modality, LicenseAccess } from "../types.js";
import { FixtureRepositoryAdapter } from "./fixture-adapter.js";
import { MetadataCache } from "./metadata-cache.js";
import { DatasetService } from "./dataset-service.js";

const ws = asId<"WorkspaceId">("ws-public");

describe("DatasetService — discovery (Step 2.4)", () => {
  it("search returns ok with records and stable identifiers", async () => {
    const svc = new DatasetService(new FixtureRepositoryAdapter("fixture-geo", ws));
    const out = await svc.discover({ modality: Modality.Genomics });
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.records).toHaveLength(1);
    const first = out.records[0]!;
    // stable id: source:accession:version
    expect(first.id).toBe("public_repository:ASM-GEOBAC-02:v1");
    expect(first.illustrative).toBe(true);
  });

  it("filters compose: host/strain + modality + license", async () => {
    const svc = new DatasetService(new FixtureRepositoryAdapter("fixture-geo", ws));
    const out = await svc.discover({
      modality: Modality.TranscriptomicsPerturbation,
      hostStrain: "bacillus",
      licenseAccess: LicenseAccess.Open,
    });
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.records.map((r) => r.accession)).toEqual(["GSE-THERMO-01"]);
  });

  it("text search tokens must all match", async () => {
    const svc = new DatasetService(new FixtureRepositoryAdapter("fixture-geo", ws));
    const hit = await svc.discover({ text: "heat shock" });
    expect(hit.kind).toBe("ok");
    const miss = await svc.discover({ text: "heat nonexistentterm" });
    expect(miss.kind).toBe("empty");
  });

  it("distinguishes EMPTY (repo responded, nothing matched) from ERROR", async () => {
    const adapter = new FixtureRepositoryAdapter("fixture-geo", ws);
    const svc = new DatasetService(adapter);
    const empty = await svc.discover({ assay: "no-such-assay" });
    expect(empty.kind).toBe("empty");
    if (empty.kind === "empty") expect(empty.records).toHaveLength(0);

    // Unavailable with NO cache for this query → error (not empty).
    adapter.available = false;
    const err = await svc.discover({ assay: "brand-new-query" });
    expect(err.kind).toBe("error");
    if (err.kind !== "error") return;
    expect(err.code).toBe("repository_unavailable");
    expect(err.message).toMatch(/unavailable/i);
  });

  it("repository-unavailable → cached metadata WITH timestamp + explicit age notice", async () => {
    let t = new Date("2026-10-24T10:00:00.000Z").getTime();
    const cache = new MetadataCache(() => new Date(t));
    const adapter = new FixtureRepositoryAdapter("fixture-geo", ws);
    const svc = new DatasetService(adapter, cache);

    // Warm the cache while available.
    const warm = await svc.discover({ modality: Modality.Pathways });
    expect(warm.kind).toBe("ok");

    // 90 minutes later the repository goes down.
    t += 90 * 60_000;
    adapter.available = false;
    const cached = await svc.discover({ modality: Modality.Pathways });
    expect(cached.kind).toBe("cached");
    if (cached.kind !== "cached") return;
    expect(cached.fromCache).toBe(true);
    expect(cached.retrievedAt).toBe("2026-10-24T10:00:00.000Z");
    expect(cached.ageMs).toBe(90 * 60_000);
    expect(cached.ageNotice).toMatch(/cached metadata retrieved/i);
    expect(cached.ageNotice).toMatch(/not guaranteed/i);
    expect(cached.records).toHaveLength(1);
  });

  it("exact accession lookup is found / absent / error — not replaced by text search", async () => {
    const adapter = new FixtureRepositoryAdapter("fixture-geo", ws);
    const svc = new DatasetService(adapter);
    const found = await svc.lookupByAccession("GSE-THERMO-01");
    expect(found.kind).toBe("found");

    const absent = await svc.lookupByAccession("GSE-DOES-NOT-EXIST");
    expect(absent.kind).toBe("absent");

    adapter.available = false;
    const err = await svc.lookupByAccession("GSE-THERMO-01");
    expect(err.kind).toBe("error");
  });

  it("unknown stays unknown — license/replicate nulls are preserved", async () => {
    const svc = new DatasetService(new FixtureRepositoryAdapter("fixture-geo", ws));
    const out = await svc.lookupByAccession("PWY-ECOLI-03");
    expect(out.kind).toBe("found");
    if (out.kind !== "found") return;
    expect(out.record.licenseAccess).toBe(LicenseAccess.Unknown);
    expect(out.record.replicateCount).toBeNull();
  });
});
