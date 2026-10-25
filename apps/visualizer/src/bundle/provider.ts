import {
  safeParseAnalysisBundle,
  type AnalysisBundle,
  type Artifact,
} from "@chassix/analysis-bundle";

/**
 * Real-data path for the workstation. The 3D twin keeps its illustrative
 * demo-heuristic animation (see `simulation.ts`); this module is the SEPARATE,
 * provenance-aware channel that loads a validated Chassix-AI analysis bundle from
 * the core engine and never coerces native values into the twin's 0–100 scales.
 *
 * A bundle is already the versioned, native-unit, provenance-carrying result
 * type the dashboard needs, so a provider simply validates and returns it,
 * surfacing load / error / stale states explicitly.
 */

/** Thrown when a payload is not a schema-1.0.0 bundle; `.detail` is human-readable. */
export class BundleLoadError extends Error {
  readonly detail: string;
  constructor(message: string, detail: string) {
    super(message);
    this.name = "BundleLoadError";
    this.detail = detail;
  }
}

/** Validate an untrusted payload (parsed JSON) into a typed bundle, or throw a readable error. */
export function bundleFromJson(input: unknown): AnalysisBundle {
  const result = safeParseAnalysisBundle(input);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const where = first?.path.length ? first.path.join(".") : "(root)";
  const detail = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  throw new BundleLoadError(`Analysis bundle is invalid at ${where}`, detail);
}

export type BundleProvider = {
  readonly id: string;
  load: (signal?: AbortSignal) => Promise<AnalysisBundle>;
};

/** Load a bundle from an engine endpoint. Honors AbortSignal so a stale request is dropped. */
export function httpBundleProvider(url: string): BundleProvider {
  return {
    id: `http:${url}`,
    async load(signal) {
      let response: Response;
      try {
        response = await fetch(url, { signal, headers: { accept: "application/json" } });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new BundleLoadError(
          "Could not reach the analysis service",
          error instanceof Error ? error.message : String(error),
        );
      }
      if (!response.ok) {
        throw new BundleLoadError(
          `Analysis service returned ${response.status}`,
          `${response.status} ${response.statusText} for ${url}`,
        );
      }
      let json: unknown;
      try {
        json = await response.json();
      } catch (error) {
        throw new BundleLoadError(
          "Analysis service returned non-JSON",
          error instanceof Error ? error.message : String(error),
        );
      }
      return bundleFromJson(json);
    },
  };
}

/** Load a bundle the user imported as a local file (demo-before-service path in the handoff). */
export function fileBundleProvider(file: File): BundleProvider {
  return {
    id: `file:${file.name}`,
    async load(signal) {
      if (signal?.aborted) throw new DOMException("Bundle load aborted", "AbortError");
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new BundleLoadError(
          "File is not valid JSON",
          error instanceof Error ? error.message : String(error),
        );
      }
      return bundleFromJson(json);
    },
  };
}

/** Index a bundle's artifacts by id so a result's artifactIds can be resolved to sources. */
export function artifactIndex(bundle: AnalysisBundle): Map<string, Artifact> {
  return new Map((bundle.artifacts ?? []).map((a) => [a.id, a]));
}

/** Resolve a list of artifact ids to the artifacts the bundle actually carries. */
export function resolveArtifacts(
  bundle: AnalysisBundle,
  ids: readonly string[] | undefined,
): Artifact[] {
  if (!ids?.length) return [];
  const index = artifactIndex(bundle);
  return ids.map((id) => index.get(id)).filter((a): a is Artifact => a !== undefined);
}

/** True when the bundle carries at least one section with real (available/partial) results. */
export function hasRealResults(bundle: AnalysisBundle): boolean {
  return Object.values(bundle.analyses).some(
    (section) => section && (section.status === "available" || section.status === "partial"),
  );
}
