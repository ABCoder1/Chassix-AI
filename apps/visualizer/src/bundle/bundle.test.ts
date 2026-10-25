import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BundleLoadError,
  bundleFromJson,
  hasRealResults,
  httpBundleProvider,
  resolveArtifacts,
} from "./provider.js";
import {
  conditionLine,
  countSignificant,
  formatP,
  formatUncertainty,
  formatValue,
  organismLine,
} from "./format.js";
import { SAMPLE_BUNDLE } from "./sample-bundle.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bundle validation", () => {
  it("accepts the synthetic sample bundle", () => {
    const bundle = bundleFromJson(SAMPLE_BUNDLE);
    expect(bundle.run.id).toBe("sample-run-0001");
    expect(bundle.analyses.flux?.results[0]?.unit).toBe("mmol/gDW/h");
  });

  it("throws a readable BundleLoadError on invalid input", () => {
    try {
      bundleFromJson({ schemaVersion: "1.0.0" });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BundleLoadError);
      expect((error as BundleLoadError).detail.length).toBeGreaterThan(0);
    }
  });

  it("preserves a failed section as explicit status, not a zero value", () => {
    const bundle = bundleFromJson(SAMPLE_BUNDLE);
    expect(bundle.analyses.metabolomics?.status).toBe("failed");
    expect(bundle.analyses.metabolomics?.results).toHaveLength(0);
    expect(bundle.analyses.metabolomics?.notAvailableReason).toContain("Peak detection");
  });

  it("detects real results and resolves artifacts", () => {
    const bundle = bundleFromJson(SAMPLE_BUNDLE);
    expect(hasRealResults(bundle)).toBe(true);
    const arts = resolveArtifacts(bundle, bundle.analyses.flux?.artifactIds);
    expect(arts).toHaveLength(1);
    expect(arts[0]?.role).toBe("flux-distribution");
  });
});

describe("httpBundleProvider", () => {
  it("loads and validates a bundle from a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(SAMPLE_BUNDLE), { status: 200 })),
    );
    const provider = httpBundleProvider("http://engine/runs/r1/bundle");
    const bundle = await provider.load();
    expect(bundle.run.id).toBe("sample-run-0001");
  });

  it("raises BundleLoadError on a non-200 status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
    );
    const provider = httpBundleProvider("http://engine/runs/missing/bundle");
    await expect(provider.load()).rejects.toBeInstanceOf(BundleLoadError);
  });

  it("propagates an AbortError so a stale request is dropped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
    );
    const provider = httpBundleProvider("http://engine/runs/r1/bundle");
    await expect(provider.load()).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("native-unit formatting", () => {
  it("keeps signs on signed quantities and never rescales", () => {
    expect(formatValue(-10, "mmol/gDW/h", { signed: true })).toBe("-10.00 mmol/gDW/h");
    expect(formatValue(15.8, "mmol/gDW/h", { signed: true })).toBe("+15.80 mmol/gDW/h");
    expect(formatValue(0.287, "1/h")).toBe("0.287 1/h");
    expect(formatValue(0.44, "g/g")).toBe("0.440 g/g");
  });

  it("shows tiny p-values in scientific notation rather than rounding to zero", () => {
    expect(formatP(5.6e-16)).toBe("5.6e-16");
    expect(formatP(0.62)).toBe("0.620");
    expect(formatP(null)).toBe("—");
  });

  it("renders uncertainty with a confidence level", () => {
    expect(formatUncertainty({ lower: 0.41, upper: 0.46, confidenceLevel: 0.95 }, "g/g")).toBe(
      "0.41–0.46 g/g (95% CI)",
    );
    expect(formatUncertainty(null, "g/g")).toBeNull();
  });

  it("summarizes organism and condition from present fields only", () => {
    expect(organismLine(SAMPLE_BUNDLE.organism)).toContain("Saccharomyces cerevisiae");
    expect(conditionLine(SAMPLE_BUNDLE.condition)).toContain("37°C");
  });

  it("counts significant features at alpha, ignoring null padj", () => {
    const rows = SAMPLE_BUNDLE.analyses.geneExpression!.results;
    expect(countSignificant(rows)).toBe(3);
  });
});
