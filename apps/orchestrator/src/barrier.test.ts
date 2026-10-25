import { describe, it, expect } from "vitest";
import { BranchState } from "@chassix/shared";
import { computeBarrier, type BranchLike } from "./barrier.js";

const b = (name: string, state: BranchState): BranchLike => ({ name, state });

describe("computeBarrier (BF-07)", () => {
  it("is not ready while any branch is non-terminal, and lists the pending ones", () => {
    const result = computeBarrier([
      b("flux", BranchState.Succeeded),
      b("metabolomics", BranchState.Running),
      b("transcriptomics", BranchState.Queued),
    ]);
    expect(result.ready).toBe(false);
    expect(result.pending).toEqual(["metabolomics", "transcriptomics"]);
  });

  it("is ready once every branch is terminal (any terminal kind)", () => {
    const result = computeBarrier([
      b("flux", BranchState.Succeeded),
      b("metabolomics", BranchState.Failed),
      b("pathways", BranchState.Cancelled),
      b("genomics", BranchState.Skipped),
    ]);
    expect(result.ready).toBe(true);
    expect(result.pending).toEqual([]);
    expect(result.terminal).toEqual({ succeeded: 1, failed: 1, cancelled: 1, skipped: 1 });
  });

  it("only gates on the required subset; others may still run", () => {
    const branches = [b("flux", BranchState.Succeeded), b("metabolomics", BranchState.Running)];
    expect(computeBarrier(branches, ["flux"]).ready).toBe(true);
    expect(computeBarrier(branches, ["flux", "metabolomics"]).ready).toBe(false);
  });

  it("treats a required branch that does not exist yet as pending", () => {
    const result = computeBarrier([b("flux", BranchState.Succeeded)], ["flux", "yield"]);
    expect(result.ready).toBe(false);
    expect(result.pending).toEqual(["yield"]);
  });
});
