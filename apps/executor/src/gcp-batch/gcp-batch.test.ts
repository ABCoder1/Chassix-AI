import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { RunManifest } from "@chassix/shared";
import { GcpBatchExecutor } from "./executor.js";
import {
  batchStateToExecutorStatus,
  renderBatchJob,
  sanitizeJobId,
  substitutionsFor,
} from "./template.js";
import type { BatchJobsClient, BatchJobState, GcpBatchConfig } from "./types.js";

const WORKFLOWS_DIR = fileURLToPath(new URL("../../../../workflows", import.meta.url));

const config: GcpBatchConfig = {
  projectId: "my-proj",
  region: "us-east1",
  gcsBucket: "my-bucket",
  workflowsDir: WORKFLOWS_DIR,
};

function manifest(branch: string): RunManifest {
  return {
    runId: "run-abcdef12-3456",
    branchId: "br-1",
    branch,
    inputs: [{ datasetVersionId: "dsv-1", checksum: "sha256:abc" }],
    parameters: {
      organism: {
        chassisId: "bacterium",
        taxonId: "511145",
        taxonName: "Escherichia coli",
        strainName: "K-12",
      },
      condition: { id: "aerobic-37c" },
    },
    toolVersions: { cobrapy: "0.29.0" },
    referenceVersions: {},
    command: "fba.py",
    createdAt: "2026-10-25T00:00:00.000Z",
    manifestHash: "deadbeefcafebabe",
  };
}

class FakeBatchClient implements BatchJobsClient {
  created: { parent: string; jobId: string; job: unknown }[] = [];
  deleted: string[] = [];
  state: BatchJobState = "RUNNING";
  async createJob(input: { parent: string; jobId: string; job: unknown }) {
    this.created.push(input);
    return { name: `${input.parent}/jobs/${input.jobId}` };
  }
  async getJobState(): Promise<BatchJobState> {
    return this.state;
  }
  async deleteJob(name: string): Promise<void> {
    this.deleted.push(name);
  }
}

describe("batch state mapping", () => {
  it("maps job states to normalized executor statuses", () => {
    expect(batchStateToExecutorStatus("QUEUED")).toBe("queued");
    expect(batchStateToExecutorStatus("RUNNING")).toBe("running");
    expect(batchStateToExecutorStatus("SUCCEEDED")).toBe("succeeded");
    expect(batchStateToExecutorStatus("FAILED")).toBe("failed");
    expect(batchStateToExecutorStatus("CANCELLED")).toBe("cancelled");
    expect(batchStateToExecutorStatus("STATE_UNSPECIFIED")).toBe("unknown");
  });
});

describe("renderBatchJob + sanitizeJobId", () => {
  it("replaces bare placeholder tokens everywhere, longest-first", () => {
    const tmpl = {
      a: "REGION-docker/PROJECT_ID/x",
      b: ["studies/RUN_ID/in"],
      c: { d: "GCS_BUCKET" },
    };
    const out = renderBatchJob(tmpl, {
      PROJECT_ID: "p",
      REGION: "r",
      GCS_BUCKET: "b",
      RUN_ID: "run1",
    });
    expect(out).toEqual({ a: "r-docker/p/x", b: ["studies/run1/in"], c: { d: "b" } });
  });
  it("sanitizes a job id to the Batch id grammar", () => {
    expect(sanitizeJobId("Chassix-Flux-RUN_ID!!")).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(sanitizeJobId("123-start")).toMatch(/^j-/);
  });
});

describe("substitutionsFor", () => {
  it("derives tokens from the manifest + config (unknown → safe label)", () => {
    const subs = substitutionsFor(manifest("flux"), config);
    expect(subs.PROJECT_ID).toBe("my-proj");
    expect(subs.GCS_BUCKET).toBe("my-bucket");
    expect(subs.RUN_ID).toBe("run-abcdef12-3456");
    expect(subs.TAXON_NAME).toBe("Escherichia coli");
    expect(subs.CONDITION_ID).toBe("aerobic-37c");
    expect(subs.CHASSIS_ID).toBe("bacterium");
    expect(substitutionsFor(manifest("flux") as RunManifest, config).STRAIN_ID).toBe("");
  });
});

describe("GcpBatchExecutor", () => {
  it("renders the real flux template and creates a Batch job (no placeholders left)", async () => {
    const client = new FakeBatchClient();
    const exec = new GcpBatchExecutor({ client, config });
    const sub = await exec.submit(manifest("flux"));

    expect(client.created).toHaveLength(1);
    const { parent, jobId, job } = client.created[0]!;
    expect(parent).toBe("projects/my-proj/locations/us-east1");
    expect(jobId.startsWith("chassix-flux-")).toBe(true);
    expect(jobId).toMatch(/^[a-z][a-z0-9-]*$/);

    const rendered = JSON.stringify(job);
    // Values substituted (env-var KEY names like CHASSIX_RUN_ID legitimately contain the tokens).
    expect(rendered).toContain("us-east1-docker.pkg.dev/my-proj/chassix/flux:latest");
    expect(rendered).toContain("studies/run-abcdef12-3456/outputs/bundle.flux.json");
    expect(rendered).toContain('"CHASSIX_CONDITION_ID":"aerobic-37c"');
    expect(rendered).toContain('"CHASSIX_ORGANISM_TAXON_NAME":"Escherichia coli"');
    expect(rendered).toContain('"remotePath":"my-bucket"');
    // No unsubstituted placeholder VALUES remain.
    expect(rendered).not.toContain("/PROJECT_ID/");
    expect(rendered).not.toContain("REGION-docker");
    expect(rendered).not.toContain('"RUN_ID"');
    expect(rendered).not.toContain('"GCS_BUCKET"');
    expect(sub.executorRef).toBe(`${parent}/jobs/${jobId}`);
  });

  it("polls job state and cancels via deleteJob", async () => {
    const client = new FakeBatchClient();
    client.state = "SUCCEEDED";
    const exec = new GcpBatchExecutor({ client, config });
    const poll = await exec.poll("projects/my-proj/locations/us-east1/jobs/j1");
    expect(poll.status).toBe("succeeded");
    expect(poll.reason).toBe("gcp-batch:SUCCEEDED");

    await exec.cancel("projects/my-proj/locations/us-east1/jobs/j1");
    expect(client.deleted).toEqual(["projects/my-proj/locations/us-east1/jobs/j1"]);
  });

  it("resolves a 'perturbation' branch to the transcriptomics workflow template", async () => {
    const client = new FakeBatchClient();
    const exec = new GcpBatchExecutor({ client, config });
    await exec.submit(manifest("perturbation"));
    const job = JSON.stringify(client.created[0]!.job);
    expect(job).toContain("chassix/transcriptomics:latest");
    expect(job).toContain('"CHASSIX_ORGANISM_CHASSIS":"bacterium"');
    expect(job).not.toContain("CHASSIS_ID");
  });

  it("throws a clear error for a branch with no template", async () => {
    const exec = new GcpBatchExecutor({ client: new FakeBatchClient(), config });
    await expect(exec.submit(manifest("does-not-exist"))).rejects.toThrow(/No GCP Batch template/);
  });
});
