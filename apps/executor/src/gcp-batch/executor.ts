import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ExecutorAdapter,
  ExecutorPoll,
  ExecutorSubmission,
  RunManifest,
} from "@chassix/shared";
import type { BatchJobsClient, GcpBatchConfig } from "./types.js";
import {
  batchStateToExecutorStatus,
  renderBatchJob,
  sanitizeJobId,
  substitutionsFor,
} from "./template.js";

/**
 * Branch name → workflow directory. "Transcriptomics / perturbation" is ONE branch (the DESeq2
 * differential-expression workflow IS the perturbation analysis), so a plan naming its branch
 * `perturbation` / `transcriptomics_perturbation` resolves to the `transcriptomics` workflow — there
 * is deliberately no separate `perturbation` workflow.
 */
const WORKFLOW_DIR_ALIAS: Readonly<Record<string, string>> = {
  perturbation: "transcriptomics",
  transcriptomicsperturbation: "transcriptomics",
};

function workflowDirFor(branch: string): string {
  const key = branch.toLowerCase().replace(/[^a-z]/g, "");
  return WORKFLOW_DIR_ALIAS[key] ?? branch;
}

/**
 * Live GCP Batch executor (ADR-D4). The only code path that submits real analyses to Google Cloud:
 * for each branch it renders `workflows/<branch>/batch-<branch>.json` with the run's values and
 * creates a Batch job; `poll` maps the job state; `cancel` deletes the job. The Batch API is reached
 * only through the injected `BatchJobsClient`, so this adapter is driven by fixtures in tests with
 * no SDK or credentials. Credentials never appear here — the real client uses Application Default
 * Credentials server-side.
 */
export class GcpBatchExecutor implements ExecutorAdapter {
  readonly id = "gcp-batch";
  readonly #client: BatchJobsClient;
  readonly #config: GcpBatchConfig;

  constructor(opts: { client: BatchJobsClient; config: GcpBatchConfig }) {
    this.#client = opts.client;
    this.#config = opts.config;
  }

  async submit(manifest: RunManifest): Promise<ExecutorSubmission> {
    const branch = manifest.branch;
    const dir = workflowDirFor(branch);
    const templatePath = join(this.#config.workflowsDir, dir, `batch-${dir}.json`);
    let template: unknown;
    try {
      template = JSON.parse(readFileSync(templatePath, "utf8"));
    } catch {
      throw new Error(`No GCP Batch template for branch '${branch}' at ${templatePath}`);
    }
    const job = renderBatchJob(template, substitutionsFor(manifest, this.#config));
    const jobId = sanitizeJobId(
      `chassix-${branch}-${manifest.runId.slice(0, 8)}-${randomUUID().slice(0, 8)}`,
    );
    const parent = `projects/${this.#config.projectId}/locations/${this.#config.region}`;
    const { name } = await this.#client.createJob({ parent, jobId, job });
    return { executorRef: name };
  }

  async poll(executorRef: string): Promise<ExecutorPoll> {
    const state = await this.#client.getJobState(executorRef);
    return {
      status: batchStateToExecutorStatus(state),
      progress: null,
      reason: `gcp-batch:${state}`,
    };
  }

  async cancel(executorRef: string): Promise<void> {
    await this.#client.deleteJob(executorRef);
  }
}
