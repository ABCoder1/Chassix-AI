import { describe, it, expect } from "vitest";
import { BranchState } from "@chassix/shared";
import type { BranchLike } from "./barrier.js";
import {
  FallbackAction,
  buildFallbackDecision,
  evaluateFailureDecision,
  needsFailureDecision,
} from "./fallback.js";

const b = (name: string, state: BranchState): BranchLike => ({ name, state });

describe("evaluateFailureDecision (BF-08 minimum-evidence policy)", () => {
  it("allows proceed with >=1 validated branch and traceable input metadata", () => {
    const d = evaluateFailureDecision({
      branches: [b("flux", BranchState.Succeeded), b("metabolomics", BranchState.Failed)],
      hasTraceableInputMetadata: true,
    });
    expect(d.canProceed).toBe(true);
    expect(d.validatedBranches).toEqual(["flux"]);
    expect(d.failedBranches).toEqual(["metabolomics"]);
    expect(d.omittedBranches).toEqual(["metabolomics"]);
    expect(d.availableActions).toContain(FallbackAction.ProceedWithEvidence);
    expect(d.availableActions).toContain(FallbackAction.RetryFailed);
  });

  it("disables proceed when all branches failed (no validated evidence)", () => {
    const d = evaluateFailureDecision({
      branches: [b("flux", BranchState.Failed), b("metabolomics", BranchState.Failed)],
      hasTraceableInputMetadata: true,
    });
    expect(d.canProceed).toBe(false);
    expect(d.proceedBlockedReason).toMatch(/at least 1 validated/);
    expect(d.availableActions).not.toContain(FallbackAction.ProceedWithEvidence);
    expect(d.availableActions).toContain(FallbackAction.CancelRun);
  });

  it("disables proceed when input metadata is not traceable", () => {
    const d = evaluateFailureDecision({
      branches: [b("flux", BranchState.Succeeded)],
      hasTraceableInputMetadata: false,
    });
    expect(d.canProceed).toBe(false);
    expect(d.proceedBlockedReason).toMatch(/input metadata/);
  });

  it("honors a stricter policy (needs two validated branches)", () => {
    const d = evaluateFailureDecision({
      branches: [b("flux", BranchState.Succeeded), b("metabolomics", BranchState.Failed)],
      hasTraceableInputMetadata: true,
      policy: { minValidatedBranches: 2, requireInputMetadata: true },
    });
    expect(d.canProceed).toBe(false);
  });
});

describe("buildFallbackDecision", () => {
  it("records an auditable proceed decision with evidence snapshot", () => {
    const decision = evaluateFailureDecision({
      branches: [b("flux", BranchState.Succeeded), b("metabolomics", BranchState.Failed)],
      hasTraceableInputMetadata: true,
    });
    const record = buildFallbackDecision({
      id: "fd-1",
      runId: "run-1",
      workspaceId: "ws-1",
      actorUserId: "user-1",
      action: FallbackAction.ProceedWithEvidence,
      runVersion: 1,
      decision,
      hasTraceableInputMetadata: true,
      rationale: "Flux result is sufficient for the decision.",
      now: "2026-10-24T20:00:00.000Z",
    });
    expect(record.omittedBranches).toEqual(["metabolomics"]);
    expect(record.evidenceSnapshot.validatedBranches).toEqual(["flux"]);
    expect(record.decidedAt).toBe("2026-10-24T20:00:00.000Z");
  });

  it("refuses to record an off-policy proceed", () => {
    const decision = evaluateFailureDecision({
      branches: [b("flux", BranchState.Failed)],
      hasTraceableInputMetadata: true,
    });
    expect(() =>
      buildFallbackDecision({
        id: "fd-2",
        runId: "run-1",
        workspaceId: "ws-1",
        actorUserId: null,
        action: FallbackAction.ProceedWithEvidence,
        runVersion: 1,
        decision,
        hasTraceableInputMetadata: true,
      }),
    ).toThrow(/not permitted/);
  });
});

describe("needsFailureDecision", () => {
  it("is true only when all branches are terminal and at least one failed", () => {
    expect(
      needsFailureDecision([b("flux", BranchState.Succeeded), b("m", BranchState.Failed)]),
    ).toBe(true);
    expect(needsFailureDecision([b("flux", BranchState.Running), b("m", BranchState.Failed)])).toBe(
      false,
    );
    expect(needsFailureDecision([b("flux", BranchState.Succeeded)])).toBe(false);
    expect(needsFailureDecision([])).toBe(false);
  });
});
