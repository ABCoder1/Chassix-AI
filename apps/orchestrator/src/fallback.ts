/**
 * Failure decision + minimum-evidence policy (Phase 4, Step 4.4 / BF-08, PRD §F).
 *
 * When a branch fails, the run pauses for a human decision. This module is the pure policy
 * behind that modal: which actions are available, and specifically whether "Proceed with
 * collected evidence" is allowed. The MVP minimum-evidence policy (scientific sign-off,
 * `docs/scientific-contracts.md`): proceed only with ≥1 validated analytical branch AND
 * traceable input metadata. The decision itself is persisted as an auditable, replayable
 * `FallbackDecisionRecord`.
 */
import { isBranchTerminal, type BranchState } from "@chassix/shared";
import type { BranchLike } from "./barrier.js";

/** Actions offered on the failure-decision modal (PRD §F / Screen 6). */
export const FallbackAction = {
  RetryFailed: "retry_failed",
  ReviewInputs: "review_inputs",
  ProceedWithEvidence: "proceed_with_evidence",
  CancelRun: "cancel_run",
} as const;
export type FallbackAction = (typeof FallbackAction)[keyof typeof FallbackAction];

/** Minimum-evidence policy (BF-08). Tunable later; MVP defaults encoded here. */
export interface MinEvidencePolicy {
  /** Minimum count of validated (succeeded) analytical branches required to proceed. */
  readonly minValidatedBranches: number;
  /** Whether proceeding also requires traceable input metadata. */
  readonly requireInputMetadata: boolean;
}

export const DEFAULT_MIN_EVIDENCE_POLICY: MinEvidencePolicy = {
  minValidatedBranches: 1,
  requireInputMetadata: true,
};

export interface FailureDecisionInput {
  readonly branches: readonly BranchLike[];
  /** Whether the run's inputs carry traceable metadata (dataset versions + checksums). */
  readonly hasTraceableInputMetadata: boolean;
  readonly policy?: MinEvidencePolicy;
}

export interface FailureDecision {
  /** Validated (succeeded) branch names — the evidence that would be carried forward. */
  readonly validatedBranches: readonly string[];
  readonly failedBranches: readonly string[];
  /** Branches that would be omitted if the run proceeds (any non-succeeded branch). */
  readonly omittedBranches: readonly string[];
  /** Whether "Proceed with collected evidence" is allowed under the policy. */
  readonly canProceed: boolean;
  /** Human-readable reason proceed is disabled, or null when it is allowed. */
  readonly proceedBlockedReason: string | null;
  /** Actions to surface on the modal, in display order. */
  readonly availableActions: readonly FallbackAction[];
}

const SUCCEEDED: BranchState = "succeeded";

/**
 * Evaluate the failure decision for a run. Pure: no persistence, no side effects.
 * "Proceed" is allowed only when the minimum-evidence policy is satisfied; otherwise the
 * returned `proceedBlockedReason` explains exactly which condition failed.
 */
export function evaluateFailureDecision(input: FailureDecisionInput): FailureDecision {
  const policy = input.policy ?? DEFAULT_MIN_EVIDENCE_POLICY;
  const validatedBranches = input.branches.filter((b) => b.state === SUCCEEDED).map((b) => b.name);
  const failedBranches = input.branches.filter((b) => b.state === "failed").map((b) => b.name);
  const omittedBranches = input.branches.filter((b) => b.state !== SUCCEEDED).map((b) => b.name);

  const reasons: string[] = [];
  if (validatedBranches.length < policy.minValidatedBranches) {
    reasons.push(
      `needs at least ${policy.minValidatedBranches} validated branch(es), have ${validatedBranches.length}`,
    );
  }
  if (policy.requireInputMetadata && !input.hasTraceableInputMetadata) {
    reasons.push("input metadata is not traceable");
  }
  const canProceed = reasons.length === 0;

  const availableActions: FallbackAction[] = [];
  if (failedBranches.length > 0) availableActions.push(FallbackAction.RetryFailed);
  availableActions.push(FallbackAction.ReviewInputs);
  if (canProceed) availableActions.push(FallbackAction.ProceedWithEvidence);
  availableActions.push(FallbackAction.CancelRun);

  return {
    validatedBranches,
    failedBranches,
    omittedBranches,
    canProceed,
    proceedBlockedReason: canProceed ? null : `Cannot proceed: ${reasons.join("; ")}.`,
    availableActions,
  };
}

/** A snapshot of the evidence available at decision time, persisted with the decision. */
export interface EvidenceSnapshot {
  readonly validatedBranches: readonly string[];
  readonly omittedBranches: readonly string[];
  readonly hasTraceableInputMetadata: boolean;
}

/**
 * The persisted FallbackDecision (PRD §F): actor, time, run version, omitted branches, the
 * evidence snapshot, and the rationale — enough to replay the decision and to drive the
 * persistent "Partial evidence" labels on the dashboard / chat / exports.
 */
export interface FallbackDecisionRecord {
  readonly id: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: FallbackAction;
  readonly decidedAt: string;
  readonly runVersion: number;
  readonly omittedBranches: readonly string[];
  readonly evidenceSnapshot: EvidenceSnapshot;
  readonly rationale: string | null;
}

export interface BuildFallbackDecisionInput {
  readonly id: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly action: FallbackAction;
  readonly runVersion: number;
  readonly decision: FailureDecision;
  readonly hasTraceableInputMetadata: boolean;
  readonly rationale?: string | null;
  readonly now?: string;
}

/**
 * Build an auditable FallbackDecisionRecord from an evaluated decision. Rejects a
 * "proceed" action that the policy did not allow, so an off-policy proceed can never be recorded.
 */
export function buildFallbackDecision(input: BuildFallbackDecisionInput): FallbackDecisionRecord {
  if (input.action === FallbackAction.ProceedWithEvidence && !input.decision.canProceed) {
    throw new Error(
      `proceed-with-evidence is not permitted: ${input.decision.proceedBlockedReason ?? "policy unmet"}`,
    );
  }
  return {
    id: input.id,
    runId: input.runId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: input.action,
    decidedAt: input.now ?? new Date().toISOString(),
    runVersion: input.runVersion,
    omittedBranches: input.decision.omittedBranches,
    evidenceSnapshot: {
      validatedBranches: input.decision.validatedBranches,
      omittedBranches: input.decision.omittedBranches,
      hasTraceableInputMetadata: input.hasTraceableInputMetadata,
    },
    ...(input.rationale !== undefined ? { rationale: input.rationale } : { rationale: null }),
  };
}

/** True when every branch is terminal and at least one failed — i.e. a decision is warranted. */
export function needsFailureDecision(branches: readonly BranchLike[]): boolean {
  if (branches.length === 0) return false;
  const anyFailed = branches.some((b) => b.state === "failed");
  const allTerminal = branches.every((b) => isBranchTerminal(b.state));
  return anyFailed && allTerminal;
}
