import { describe, it, expect } from "vitest";
import { ExecutorStatus, executorStatusToBranchState, RunManifestSchema } from "./execution.js";
import { BranchState, isBranchTerminal } from "./state.js";

describe("executorStatusToBranchState", () => {
  it("advances a raw executor 'succeeded' to ValidatingOutputs, never straight to Succeeded", () => {
    // Succeeded is recorded only after artifact validation (Step 3.5).
    expect(executorStatusToBranchState[ExecutorStatus.Succeeded]).toBe(
      BranchState.ValidatingOutputs,
    );
    expect(executorStatusToBranchState[ExecutorStatus.Succeeded]).not.toBe(BranchState.Succeeded);
  });

  it("maps failure and cancellation to terminal states", () => {
    expect(isBranchTerminal(executorStatusToBranchState[ExecutorStatus.Failed]!)).toBe(true);
    expect(isBranchTerminal(executorStatusToBranchState[ExecutorStatus.Cancelled]!)).toBe(true);
  });

  it("maps a lost-heartbeat 'unknown' to no state change (not an automatic failure)", () => {
    expect(executorStatusToBranchState[ExecutorStatus.Unknown]).toBeNull();
  });
});

describe("RunManifestSchema", () => {
  const manifest = {
    runId: "run_1",
    branchId: "branch_1",
    branch: "genomics",
    inputs: [{ datasetVersionId: "dsv_1", checksum: "sha256:abc" }],
    parameters: { threads: 4 },
    toolVersions: { fastqc: "0.12.1" },
    referenceVersions: { genome: "GRCh38" },
    command: "nextflow run main.nf",
    createdAt: "2026-10-24T00:00:00.000Z",
    manifestHash: "sha256:deadbeef",
  };

  it("accepts a complete manifest", () => {
    expect(RunManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("rejects a manifest missing its hash", () => {
    const { manifestHash: _omit, ...rest } = manifest;
    expect(RunManifestSchema.safeParse(rest).success).toBe(false);
  });
});
