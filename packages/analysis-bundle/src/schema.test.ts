import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_BUNDLE_SCHEMA_VERSION,
  parseAnalysisBundle,
  safeParseAnalysisBundle,
  type AnalysisBundle,
} from "./schema.js";

const minimalBundle: AnalysisBundle = {
  schemaVersion: ANALYSIS_BUNDLE_SCHEMA_VERSION,
  run: { id: "run-1", workflowId: "flux-analysis", status: "completed" },
  organism: {
    chassisId: "yeast",
    taxonId: "559292",
    taxonName: "Saccharomyces cerevisiae",
    strainId: null,
    strainName: "S288C",
  },
  condition: { id: "cond-1", temperatureC: 30 },
  analyses: {
    flux: {
      status: "available",
      method: "COBRApy FBA",
      objective: "BIOMASS",
      results: [{ reactionId: "PGI", flux: 4.86, unit: "mmol/gDW/h", conditionId: "cond-1" }],
    },
  },
};

describe("analysis bundle contract", () => {
  it("accepts a minimal valid bundle and preserves native units", () => {
    const parsed = parseAnalysisBundle(minimalBundle);
    expect(parsed.analyses.flux?.results[0]?.unit).toBe("mmol/gDW/h");
    expect(parsed.analyses.flux?.results[0]?.flux).toBe(4.86);
  });

  it("validates the shipped template (all sections not_run)", () => {
    const path = fileURLToPath(new URL("../analysis-bundle.template.json", import.meta.url));
    const template = JSON.parse(readFileSync(path, "utf8"));
    const result = safeParseAnalysisBundle(template);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.analyses.yield?.status).toBe("not_run");
  });

  it("rejects an empty analyses object (minProperties 1)", () => {
    const bad = { ...minimalBundle, analyses: {} };
    expect(safeParseAnalysisBundle(bad).success).toBe(false);
  });

  it("rejects unknown keys (additionalProperties false)", () => {
    const bad = { ...minimalBundle, surprise: true };
    expect(safeParseAnalysisBundle(bad).success).toBe(false);
  });

  it("rejects a wrong schema version", () => {
    const bad = { ...minimalBundle, schemaVersion: "2.0.0" };
    expect(safeParseAnalysisBundle(bad).success).toBe(false);
  });

  it("rejects a probability outside [0,1]", () => {
    const bad = {
      ...minimalBundle,
      analyses: {
        geneExpression: {
          status: "available",
          results: [
            {
              featureId: "YAL001C",
              featureType: "gene",
              log2FoldChange: 1.2,
              pValue: 0.01,
              adjustedPValue: 1.4,
            },
          ],
        },
      },
    };
    expect(safeParseAnalysisBundle(bad).success).toBe(false);
  });

  it("keeps a failed analysis section as an explicit status, not a zero value", () => {
    const partial = {
      ...minimalBundle,
      run: { ...minimalBundle.run, status: "partial" as const },
      analyses: {
        flux: minimalBundle.analyses.flux!,
        metabolomics: {
          status: "failed" as const,
          notAvailableReason: "XCMS peak detection crashed on malformed mzML",
          results: [],
        },
      },
    };
    const parsed = parseAnalysisBundle(partial);
    expect(parsed.analyses.metabolomics?.status).toBe("failed");
    expect(parsed.analyses.metabolomics?.results).toHaveLength(0);
  });
});
