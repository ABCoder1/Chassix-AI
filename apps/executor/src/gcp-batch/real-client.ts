/**
 * The real `@google-cloud/batch`-backed {@link BatchJobsClient}. This is the ONLY file that imports
 * the Google SDK, so the executor and its tests stay SDK-free. Authentication is Application Default
 * Credentials (GOOGLE_APPLICATION_CREDENTIALS, or `gcloud auth application-default login`) — no
 * credentials are passed or logged here.
 */
import { BatchServiceClient, protos } from "@google-cloud/batch";
import type { BatchJobsClient, BatchJobState } from "./types.js";

type IJob = protos.google.cloud.batch.v1.IJob;
const StateEnum = protos.google.cloud.batch.v1.JobStatus.State;

/** gapic may return an enum state as a string or a number; normalize to our string union. */
function normalizeState(state: unknown): BatchJobState {
  if (state == null) return "STATE_UNSPECIFIED";
  if (typeof state === "string") return state as BatchJobState;
  if (typeof state === "number") {
    const key = StateEnum[state];
    return (key as BatchJobState) ?? "STATE_UNSPECIFIED";
  }
  return "STATE_UNSPECIFIED";
}

/** Build the live Batch client. Construction does not open a connection or require env at import. */
export function createBatchJobsClient(): BatchJobsClient {
  const client = new BatchServiceClient();
  return {
    async createJob({ parent, jobId, job }) {
      const [created] = await client.createJob({ parent, jobId, job: job as IJob });
      return { name: created.name ?? "" };
    },
    async getJobState(name) {
      const [job] = await client.getJob({ name });
      return normalizeState(job.status?.state);
    },
    async deleteJob(name) {
      await client.deleteJob({ name });
    },
  };
}
