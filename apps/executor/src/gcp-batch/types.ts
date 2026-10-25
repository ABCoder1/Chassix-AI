/**
 * GCP Batch executor seam (ADR-D4, live engine). The orchestrator drives this through the shared
 * `ExecutorAdapter`; this file defines the small, credential-free interface the executor talks to,
 * so the whole adapter is testable WITHOUT the Google SDK or real credentials (project rule:
 * credentials live behind interfaces). The real `@google-cloud/batch`-backed implementation is in
 * `real-client.ts` and is the only file that imports the SDK.
 */

/** The GCP Batch job states we map from (see JobStatus.State in the Batch API). */
export type BatchJobState =
  | "STATE_UNSPECIFIED"
  | "QUEUED"
  | "SCHEDULED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "DELETION_IN_PROGRESS"
  | "CANCELLATION_IN_PROGRESS"
  | "CANCELLED";

/** Minimal Batch API surface the executor needs. The real client wraps `@google-cloud/batch`. */
export interface BatchJobsClient {
  /** Create a Batch job; returns its fully-qualified resource name (the executor ref). */
  createJob(input: { parent: string; jobId: string; job: unknown }): Promise<{ name: string }>;
  /** Current state of a job by resource name. */
  getJobState(name: string): Promise<BatchJobState>;
  /** Cancel/delete a job by resource name. */
  deleteJob(name: string): Promise<void>;
}

/** Deployment configuration (from the server's env; never contains secrets — creds come from ADC). */
export interface GcpBatchConfig {
  readonly projectId: string;
  readonly region: string;
  readonly gcsBucket: string;
  /** Absolute path to the repo's `workflows/` dir (holds `<branch>/batch-<branch>.json`). */
  readonly workflowsDir: string;
}
