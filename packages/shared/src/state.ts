/**
 * State machines from PRD §6. Encoded as typed enums + explicit transition maps so
 * state is never a free string and "duplicate/stale events cannot move a branch
 * backward" is enforceable. PRD is the source of truth — if these diverge, the PRD wins.
 */

/**
 * Project flow (PRD §6):
 * Draft goal → Discovering evidence → Selecting hosts → Selecting inputs → Plan ready →
 * Running → (Awaiting decision | Integrating) → Critic review →
 * (Results ready | Results with caveats | Needs review).
 * Failed launch and cancelled runs are distinct terminal states.
 */
export const ProjectFlow = {
  DraftGoal: "draft_goal",
  DiscoveringEvidence: "discovering_evidence",
  SelectingHosts: "selecting_hosts",
  SelectingInputs: "selecting_inputs",
  PlanReady: "plan_ready",
  Running: "running",
  AwaitingDecision: "awaiting_decision",
  Integrating: "integrating",
  CriticReview: "critic_review",
  ResultsReady: "results_ready",
  ResultsWithCaveats: "results_with_caveats",
  NeedsReview: "needs_review",
  FailedLaunch: "failed_launch",
  Cancelled: "cancelled",
} as const;
export type ProjectFlow = (typeof ProjectFlow)[keyof typeof ProjectFlow];

/**
 * Branch state (PRD §6):
 * Not configured → Validating → Ready → Queued → Running → Validating outputs → Succeeded.
 * Failure, cancellation, and intentional skip are separate states.
 * "Connection uncertain" is NOT a branch state — see ConnectivityStatus.
 */
export const BranchState = {
  NotConfigured: "not_configured",
  Validating: "validating",
  Ready: "ready",
  Queued: "queued",
  Running: "running",
  ValidatingOutputs: "validating_outputs",
  Succeeded: "succeeded",
  Failed: "failed",
  Cancelled: "cancelled",
  Skipped: "skipped",
} as const;
export type BranchState = (typeof BranchState)[keyof typeof BranchState];

/**
 * A lost remote heartbeat means "Connection uncertain," not automatic scientific
 * failure (PRD §6). Modeled as an overlay on a branch, independent of BranchState.
 */
export const ConnectivityStatus = {
  Connected: "connected",
  ConnectionUncertain: "connection_uncertain",
} as const;
export type ConnectivityStatus = (typeof ConnectivityStatus)[keyof typeof ConnectivityStatus];

/**
 * Critic disposition for a recommendation (PRD §F / Implementation Guide Step 1.3, 5.3).
 * These are the published review outcomes, distinct from branch execution state.
 */
export const CriticDisposition = {
  Ready: "ready",
  ReadyWithCaveats: "ready_with_caveats",
  NeedsReview: "needs_review",
} as const;
export type CriticDisposition = (typeof CriticDisposition)[keyof typeof CriticDisposition];

export const BRANCH_TERMINAL_STATES: ReadonlySet<BranchState> = new Set([
  BranchState.Succeeded,
  BranchState.Failed,
  BranchState.Cancelled,
  BranchState.Skipped,
]);

export const isBranchTerminal = (state: BranchState): boolean => BRANCH_TERMINAL_STATES.has(state);

/** Allowed forward transitions. Anything not listed is backward or illegal and must be rejected. */
const BRANCH_TRANSITIONS: Readonly<Record<BranchState, readonly BranchState[]>> = {
  [BranchState.NotConfigured]: [BranchState.Validating, BranchState.Skipped, BranchState.Cancelled],
  [BranchState.Validating]: [BranchState.Ready, BranchState.Failed, BranchState.Cancelled],
  [BranchState.Ready]: [BranchState.Queued, BranchState.Skipped, BranchState.Cancelled],
  [BranchState.Queued]: [BranchState.Running, BranchState.Failed, BranchState.Cancelled],
  [BranchState.Running]: [BranchState.ValidatingOutputs, BranchState.Failed, BranchState.Cancelled],
  [BranchState.ValidatingOutputs]: [BranchState.Succeeded, BranchState.Failed],
  [BranchState.Succeeded]: [],
  [BranchState.Failed]: [],
  [BranchState.Cancelled]: [],
  [BranchState.Skipped]: [],
};

/**
 * Whether `to` is a legal forward transition from `from`. Returns false for same-state,
 * backward, and unknown transitions — the guard behind "stale events cannot move a
 * branch backward" (PRD §6, BF-06).
 */
export const canBranchTransition = (from: BranchState, to: BranchState): boolean =>
  BRANCH_TRANSITIONS[from].includes(to);
