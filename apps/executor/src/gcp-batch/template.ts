import { ExecutorStatus } from "@chassix/shared";
import type { RunManifest } from "@chassix/shared";
import type { BatchJobState, GcpBatchConfig } from "./types.js";

/**
 * Map a GCP Batch job state onto the normalized `ExecutorStatus` (which the orchestrator maps to a
 * PRD §6 branch state). `STATE_UNSPECIFIED` / unknown → `Unknown`, so a transient/indeterminate
 * read never moves a branch backward or fabricates a terminal state ("unknown stays unknown").
 */
export function batchStateToExecutorStatus(state: BatchJobState): ExecutorStatus {
  switch (state) {
    case "QUEUED":
    case "SCHEDULED":
      return ExecutorStatus.Queued;
    case "RUNNING":
      return ExecutorStatus.Running;
    case "SUCCEEDED":
      return ExecutorStatus.Succeeded;
    case "FAILED":
      return ExecutorStatus.Failed;
    case "CANCELLED":
    case "CANCELLATION_IN_PROGRESS":
    case "DELETION_IN_PROGRESS":
      return ExecutorStatus.Cancelled;
    default:
      return ExecutorStatus.Unknown;
  }
}

/** The bare placeholder tokens the `batch-<branch>.json` templates carry (see workflows/README.md). */
export type Substitutions = Record<string, string>;

/** Build the substitution map from a run manifest + deployment config. Unknown → a safe label. */
export function substitutionsFor(manifest: RunManifest, config: GcpBatchConfig): Substitutions {
  const params = manifest.parameters as Record<string, unknown>;
  const organism = (params.organism ?? {}) as Record<string, unknown>;
  const condition = (params.condition ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" && v.length > 0 ? v : "");
  return {
    PROJECT_ID: config.projectId,
    REGION: config.region,
    GCS_BUCKET: config.gcsBucket,
    RUN_ID: manifest.runId,
    WORKFLOW_VERSION: str(params.workflowVersion) || manifest.manifestHash.slice(0, 12),
    CONDITION_ID: str(condition.id) || "condition",
    TAXON_ID: str(organism.taxonId),
    TAXON_NAME: str(organism.taxonName) || "unspecified",
    STRAIN_ID: str(organism.strainId),
    STRAIN_NAME: str(organism.strainName),
  };
}

/**
 * Deep-render a loaded batch-job template, replacing every bare placeholder token in every string
 * with its value. Tokens are replaced longest-first so one can never partially match another.
 * Pure: returns a new object, never mutates the input.
 */
export function renderBatchJob(template: unknown, subs: Substitutions): unknown {
  const tokens = Object.keys(subs).sort((a, b) => b.length - a.length);
  const replaceStr = (s: string): string => {
    let out = s;
    for (const token of tokens) out = out.split(token).join(subs[token] ?? "");
    return out;
  };
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return replaceStr(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  return walk(template);
}

/** A GCP Batch job id must be `[a-z]([a-z0-9-]{0,61})`. Normalize a candidate into that shape. */
export function sanitizeJobId(candidate: string): string {
  const cleaned = candidate
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "");
  const withLetter = /^[a-z]/.test(cleaned) ? cleaned : `j-${cleaned}`;
  return withLetter.slice(0, 63).replace(/-+$/, "") || "chassix-job";
}
