import { describe, it, expect } from "vitest";
import { ANALYSIS_BUNDLE_SCHEMA_VERSION, type AnalysisBundle } from "@chassix/analysis-bundle";
import { GcsBundleSource, type ObjectStore } from "./gcs-bundle-source.js";

class FakeStore implements ObjectStore {
  constructor(private readonly files: Record<string, string>) {}
  async list(prefix: string): Promise<string[]> {
    return Object.keys(this.files).filter((n) => n.startsWith(prefix));
  }
  async download(name: string): Promise<string> {
    const v = this.files[name];
    if (v === undefined) throw new Error(`no such object: ${name}`);
    return v;
  }
}

function fragment(section: "flux" | "metabolomics", artifactId: string): AnalysisBundle {
  const base = {
    schemaVersion: ANALYSIS_BUNDLE_SCHEMA_VERSION,
    run: { id: "run1", workflowId: `chassix-${section}`, status: "completed" as const },
    organism: {
      chassisId: "bacterium" as const,
      taxonId: null,
      taxonName: "E. coli",
      strainId: null,
      strainName: null,
    },
    condition: { id: "c1" },
    artifacts: [
      {
        id: artifactId,
        uri: `gs://b/${artifactId}.csv`,
        mediaType: "text/csv",
        sha256: null,
        role: section,
      },
    ],
  };
  if (section === "flux") {
    return {
      ...base,
      analyses: {
        flux: {
          status: "available",
          method: "COBRApy",
          results: [{ reactionId: "PGI", flux: 4.8, unit: "mmol/gDW/h", conditionId: "c1" }],
          artifactIds: [artifactId],
        },
        yield: {
          status: "available",
          results: [
            { metricId: "y1", value: 0.4, unit: "g/g", kind: "predicted", conditionId: "c1" },
          ],
          artifactIds: [artifactId],
        },
      },
    };
  }
  return {
    ...base,
    analyses: {
      metabolomics: {
        status: "available",
        results: [{ featureId: "m1", value: 12.3, unit: "peak_area", conditionId: "c1" }],
        artifactIds: [artifactId],
      },
    },
  };
}

describe("GcsBundleSource", () => {
  it("merges sections + artifacts from all fragment files for a run", async () => {
    const store = new FakeStore({
      "studies/run1/outputs/bundle.flux.json": JSON.stringify(fragment("flux", "art-flux")),
      "studies/run1/outputs/bundle.metabolomics.json": JSON.stringify(
        fragment("metabolomics", "art-metab"),
      ),
      "studies/run1/outputs/flux_distribution.csv": "reaction,flux\nPGI,4.8", // ignored (not a bundle)
      "studies/run1/outputs/bundle.broken.json": "{not json", // skipped
    });
    const source = new GcsBundleSource(store);

    const sections = await source.sectionsForRun("run1");
    expect(Object.keys(sections).sort()).toEqual(["flux", "metabolomics", "yield"]);
    expect(sections.flux?.results).toHaveLength(1);
    expect(sections.metabolomics?.results).toHaveLength(1);
    expect(sections.metabolomics?.status).toBe("available");

    const artifacts = await source.artifactsForRun("run1");
    expect(artifacts.map((a) => a.id).sort()).toEqual(["art-flux", "art-metab"]);
  });

  it("returns nothing for a run with no outputs", async () => {
    const source = new GcsBundleSource(new FakeStore({}));
    expect(await source.sectionsForRun("missing")).toEqual({});
    expect(await source.artifactsForRun("missing")).toEqual([]);
  });

  it("scopes to the run's own prefix (no cross-run bleed)", async () => {
    const store = new FakeStore({
      "studies/runA/outputs/bundle.flux.json": JSON.stringify(fragment("flux", "a")),
      "studies/runB/outputs/bundle.flux.json": JSON.stringify(fragment("flux", "b")),
    });
    const source = new GcsBundleSource(store);
    const arts = await source.artifactsForRun("runA");
    expect(arts.map((a) => a.id)).toEqual(["a"]);
  });
});
