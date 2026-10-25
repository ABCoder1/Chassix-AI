import { describe, it, expect } from "vitest";
import { BranchState, ConnectivityStatus } from "@chassix/shared";
import type { RunManifest } from "@chassix/shared";
import { parseAnalysisBundle, type GeneExpression } from "@chassix/analysis-bundle";
import {
  asRunId,
  asBranchId,
  asWorkspaceId,
  asAttemptId,
  type BranchRecord,
  type RunRecord,
} from "@chassix/orchestrator";
import { buildRunBundle, deriveRunStatus, normalizeBranchName, resolveContext } from "./bundle.js";

const WS = "ws-1";

function manifest(branch: string, parameters: Record<string, unknown> = {}): RunManifest {
  return {
    runId: "run-1",
    branchId: `br-${branch}`,
    branch,
    inputs: [],
    parameters,
    toolVersions: { cobrapy: "0.29.0" },
    referenceVersions: {},
    command: `${branch}.sh`,
    createdAt: "2026-10-24T18:00:00.000Z",
    manifestHash: "deadbeef",
  };
}

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: asRunId("run-1"),
    workspaceId: asWorkspaceId(WS),
    projectId: "proj-1",
    planId: "plan-1",
    idempotencyKey: "idem-1",
    version: 1,
    createdAt: "2026-10-24T18:00:00.000Z",
    startedAt: "2026-10-24T18:00:01.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function makeBranch(
  name: string,
  state: BranchState,
  parameters: Record<string, unknown> = {},
): BranchRecord {
  return {
    id: asBranchId(`br-${name}`),
    runId: asRunId("run-1"),
    workspaceId: asWorkspaceId(WS),
    name,
    state,
    connectivity: ConnectivityStatus.Connected,
    sequence: 1,
    reason: null,
    currentAttemptId: asAttemptId(`at-${name}`),
    executorRef: null,
    manifest: manifest(name, parameters),
  };
}

describe("branch → analysis mapping", () => {
  it("normalizes branch names so spacing/casing do not matter", () => {
    expect(normalizeBranchName("Flux analysis")).toBe("fluxanalysis");
    expect(normalizeBranchName("transcriptomics_perturbation")).toBe("transcriptomicsperturbation");
  });
});

describe("deriveRunStatus", () => {
  it("is queued before the run starts", () => {
    expect(
      deriveRunStatus(makeRun({ startedAt: null }), [makeBranch("flux", BranchState.Queued)]),
    ).toBe("queued");
  });
  it("is running while a branch is non-terminal", () => {
    expect(deriveRunStatus(makeRun(), [makeBranch("flux", BranchState.Running)])).toBe("running");
  });
  it("is completed when all branches succeeded", () => {
    expect(
      deriveRunStatus(makeRun(), [
        makeBranch("flux", BranchState.Succeeded),
        makeBranch("metabolomics", BranchState.Succeeded),
      ]),
    ).toBe("completed");
  });
  it("is partial when some succeeded and some failed", () => {
    expect(
      deriveRunStatus(makeRun(), [
        makeBranch("flux", BranchState.Succeeded),
        makeBranch("metabolomics", BranchState.Failed),
      ]),
    ).toBe("partial");
  });
  it("is failed when no branch succeeded", () => {
    expect(
      deriveRunStatus(makeRun(), [
        makeBranch("flux", BranchState.Failed),
        makeBranch("metabolomics", BranchState.Cancelled),
      ]),
    ).toBe("failed");
  });
});

describe("resolveContext", () => {
  it("reads organism/condition from a branch manifest when present", () => {
    const branch = makeBranch("flux", BranchState.Running, {
      organism: { chassisId: "yeast", taxonName: "Saccharomyces cerevisiae", strainName: "S288C" },
      condition: { id: "heat-37c", temperatureC: 37, pH: 5.5 },
    });
    const ctx = resolveContext(makeRun(), [branch]);
    expect(ctx.organism.chassisId).toBe("yeast");
    expect(ctx.organism.taxonName).toBe("Saccharomyces cerevisiae");
    expect(ctx.condition.temperatureC).toBe(37);
    expect(ctx.modelVersions).toEqual([{ id: "cobrapy", version: "0.29.0" }]);
  });
  it("leaves organism explicitly unspecified when not derivable (unknown stays unknown)", () => {
    const ctx = resolveContext(makeRun(), [makeBranch("flux", BranchState.Running)]);
    expect(ctx.organism.chassisId).toBe("other");
    expect(ctx.organism.taxonName).toBe("Unspecified organism");
    expect(ctx.organism.taxonId).toBeNull();
  });
});

describe("buildRunBundle", () => {
  it("maps a flux branch to flux + yield sections with explicit status, no fabricated rows", () => {
    const branches = [makeBranch("flux", BranchState.Succeeded)];
    const bundle = buildRunBundle({
      run: makeRun(),
      branches,
      context: resolveContext(makeRun(), branches),
      sections: {},
      artifacts: [],
    });
    expect(bundle.analyses.flux?.status).toBe("partial");
    expect(bundle.analyses.flux?.results).toHaveLength(0);
    expect(bundle.analyses.yield?.status).toBe("partial");
    // Always a valid schema-1.0.0 bundle.
    expect(() => parseAnalysisBundle(bundle)).not.toThrow();
  });

  it("marks a failed branch's section as failed", () => {
    const branches = [makeBranch("metabolomics", BranchState.Failed)];
    const bundle = buildRunBundle({
      run: makeRun(),
      branches,
      context: resolveContext(makeRun(), branches),
      sections: {},
      artifacts: [],
    });
    expect(bundle.analyses.metabolomics?.status).toBe("failed");
  });

  it("falls back to all-five not_run when only section-less branches (genomics) exist", () => {
    const branches = [makeBranch("genomics", BranchState.Succeeded)];
    const bundle = buildRunBundle({
      run: makeRun(),
      branches,
      context: resolveContext(makeRun(), branches),
      sections: {},
      artifacts: [],
    });
    expect(Object.keys(bundle.analyses).sort()).toEqual([
      "flux",
      "geneExpression",
      "interactions",
      "metabolomics",
      "yield",
    ]);
    expect(bundle.analyses.flux?.status).toBe("not_run");
  });

  it("lets an ingested fragment win over the branch-state placeholder", () => {
    const fragment: GeneExpression = {
      status: "available",
      method: "DESeq2 1.44.0",
      contrastId: "heat_vs_ref",
      artifactIds: [],
      results: [
        {
          featureId: "YLL026W",
          symbol: "HSP104",
          featureType: "gene",
          log2FoldChange: 3.4,
          pValue: 1e-10,
          adjustedPValue: 1e-8,
        },
      ],
    };
    const branches = [makeBranch("transcriptomics", BranchState.Succeeded)];
    const bundle = buildRunBundle({
      run: makeRun(),
      branches,
      context: resolveContext(makeRun(), branches),
      sections: { geneExpression: fragment },
      artifacts: [],
    });
    expect(bundle.analyses.geneExpression?.status).toBe("available");
    expect(bundle.analyses.geneExpression?.results).toHaveLength(1);
  });
});
