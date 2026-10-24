import { BranchState, CriticDisposition, ConnectivityStatus } from "@chassix/shared";

/**
 * StatusBadge renders every lifecycle/review/connectivity state defined in
 * @chassix/shared. Accessibility rule (PRD §9, Step 1.3 DoD): the status is
 * ALWAYS conveyed by a visible text label, never by color alone. The colored
 * dot is decorative (aria-hidden); the label is the source of truth.
 */

export type StatusTone = "success" | "info" | "warning" | "accent" | "danger" | "neutral";

interface Descriptor {
  label: string;
  tone: StatusTone;
}

const CRITIC: Record<CriticDisposition, Descriptor> = {
  [CriticDisposition.Ready]: { label: "Ready", tone: "success" },
  [CriticDisposition.ReadyWithCaveats]: { label: "Ready with caveats", tone: "warning" },
  [CriticDisposition.NeedsReview]: { label: "Needs review", tone: "warning" },
};

const BRANCH: Record<BranchState, Descriptor> = {
  [BranchState.NotConfigured]: { label: "Not configured", tone: "neutral" },
  [BranchState.Validating]: { label: "Validating", tone: "info" },
  [BranchState.Ready]: { label: "Ready", tone: "success" },
  [BranchState.Queued]: { label: "Queued", tone: "info" },
  [BranchState.Running]: { label: "Running", tone: "info" },
  [BranchState.ValidatingOutputs]: { label: "Validating outputs", tone: "info" },
  [BranchState.Succeeded]: { label: "Succeeded", tone: "success" },
  [BranchState.Failed]: { label: "Failed", tone: "danger" },
  [BranchState.Cancelled]: { label: "Cancelled", tone: "neutral" },
  [BranchState.Skipped]: { label: "Skipped", tone: "neutral" },
};

const CONNECTIVITY: Record<ConnectivityStatus, Descriptor> = {
  [ConnectivityStatus.Connected]: { label: "Connected", tone: "success" },
  [ConnectivityStatus.ConnectionUncertain]: { label: "Connection uncertain", tone: "warning" },
};

export type StatusBadgeProps =
  | { kind: "critic"; status: CriticDisposition; className?: string }
  | { kind: "branch"; status: BranchState; className?: string }
  | { kind: "connectivity"; status: ConnectivityStatus; className?: string };

function resolve(props: StatusBadgeProps): Descriptor {
  switch (props.kind) {
    case "critic":
      return CRITIC[props.status];
    case "branch":
      return BRANCH[props.status];
    case "connectivity":
      return CONNECTIVITY[props.status];
  }
}

export function StatusBadge(props: StatusBadgeProps) {
  const { label, tone } = resolve(props);
  return (
    <span
      className={["bf-badge", props.className].filter(Boolean).join(" ")}
      data-tone={tone}
      role="status"
    >
      <span className="bf-badge__dot" aria-hidden="true" />
      <span className="bf-badge__label">{label}</span>
    </span>
  );
}
