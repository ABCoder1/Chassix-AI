/**
 * GCS-backed {@link BundleSource}: reads the per-branch `bundle.<branch>.json` fragments a workflow
 * run wrote to `gs://<bucket>/studies/<runId>/outputs/`, validates each against the schema-1.0.0
 * contract, and merges their analysis sections + artifacts for the run bundle endpoint.
 *
 * Object storage is reached only through the injected {@link ObjectStore}, so this is tested with a
 * fake store (no GCS, no credentials). The real `@google-cloud/storage`-backed store lives in
 * `gcs-store.ts` (the only file that imports the SDK). Fragments that are missing or invalid are
 * skipped — never fabricated — so a partial run yields the sections that did land, no more.
 */
import { safeParseAnalysisBundle, type Artifact } from "@chassix/analysis-bundle";
import type { AnalysisKey, AnalysisSection, BundleSource } from "./bundle.js";

/** Minimal object-store surface: list object names under a prefix, and download one as text. */
export interface ObjectStore {
  list(prefix: string): Promise<string[]>;
  download(objectName: string): Promise<string>;
}

const BUNDLE_NAME = /\/bundle\.[a-z0-9_]+\.json$/i;

export class GcsBundleSource implements BundleSource {
  constructor(private readonly store: ObjectStore) {}

  private outputsPrefix(runId: string): string {
    return `studies/${runId}/outputs/`;
  }

  /** Load + validate every bundle fragment for a run (skipping missing/invalid ones). */
  private async loadFragments(runId: string) {
    const names = (await this.store.list(this.outputsPrefix(runId))).filter((n) =>
      BUNDLE_NAME.test(n),
    );
    const fragments = [];
    for (const name of names) {
      let text: string;
      try {
        text = await this.store.download(name);
      } catch {
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }
      const parsed = safeParseAnalysisBundle(json);
      if (parsed.success) fragments.push(parsed.data);
    }
    return fragments;
  }

  async sectionsForRun(runId: string): Promise<Partial<Record<AnalysisKey, AnalysisSection>>> {
    const out: Partial<Record<AnalysisKey, AnalysisSection>> = {};
    for (const bundle of await this.loadFragments(runId)) {
      for (const [key, section] of Object.entries(bundle.analyses) as [
        AnalysisKey,
        AnalysisSection,
      ][]) {
        // First fragment to carry a section wins; prefer one with real results over an empty status.
        if (
          section &&
          (!out[key] || (out[key]!.results.length === 0 && section.results.length > 0))
        ) {
          out[key] = section;
        }
      }
    }
    return out;
  }

  async artifactsForRun(runId: string): Promise<Artifact[]> {
    const byId = new Map<string, Artifact>();
    for (const bundle of await this.loadFragments(runId)) {
      for (const artifact of bundle.artifacts ?? []) byId.set(artifact.id, artifact);
    }
    return [...byId.values()];
  }
}
