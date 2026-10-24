import type { DatasetVersion, UserId, BranchId, HostId } from "../types.js";
import {
  CompatClass,
  DEFAULT_COMPAT_POLICY,
  type CompatCheck,
  type CompatPolicy,
} from "./policy.js";
import { runCompatChecks, type BranchRequirement, type CompatFinding } from "./checks.js";

/** Audit event recorded when a scientist acknowledges a (warning-class) finding. */
export interface AcknowledgementAuditEvent {
  readonly type: "compatibility.acknowledged";
  readonly actor: UserId;
  readonly timestamp: string;
  readonly datasetId: DatasetVersion["id"];
  readonly branchId: BranchId;
  readonly hostId: HostId;
  readonly checkId: CompatCheck;
  readonly rationale: string;
  readonly message: string;
}

/** Raised when code attempts to acknowledge a blocking finding (not permitted). */
export class BlockingNotAcknowledgeableError extends Error {
  constructor(checkId: CompatCheck) {
    super(`Blocking compatibility finding "${checkId}" cannot be acknowledged`);
    this.name = "BlockingNotAcknowledgeableError";
  }
}

export interface CoverageCell {
  readonly datasetId: DatasetVersion["id"];
  readonly branchId: BranchId;
  readonly hostId: HostId;
  /** Worst status across this cell's findings. */
  readonly status: "ok" | "warning" | "blocked";
  readonly reachable: boolean;
  readonly findings: readonly CompatFinding[];
  /** Whether all warning-class findings in this cell have been acknowledged. */
  readonly acknowledged: boolean;
}

/** A selected (dataset → branch → host) assignment to evaluate. */
export interface Selection {
  readonly dataset: DatasetVersion;
  readonly requirement: BranchRequirement;
}

const ackKey = (
  datasetId: DatasetVersion["id"],
  branchId: BranchId,
  checkId: CompatCheck,
): string => `${datasetId}|${branchId}|${checkId}`;

/**
 * Compatibility service (Step 2.6). Evaluates findings, enforces reachability (a dataset with
 * any blocking finding cannot reach the affected branch — regardless of acknowledgement), and
 * records acknowledgements of warnings as auditable events. Builds the datasets→branch→host
 * coverage matrix.
 */
export class CompatibilityService {
  private readonly audit: AcknowledgementAuditEvent[] = [];
  private readonly acknowledged = new Set<string>();

  constructor(
    private readonly policy: CompatPolicy = DEFAULT_COMPAT_POLICY,
    private readonly now: () => Date = () => new Date(),
  ) {}

  evaluate(dataset: DatasetVersion, req: BranchRequirement): readonly CompatFinding[] {
    return runCompatChecks(dataset, req, this.policy);
  }

  /** A blocking finding means the dataset cannot reach this branch (PRD §C, Step 2.6 DoD). */
  isReachable(dataset: DatasetVersion, req: BranchRequirement): boolean {
    return !this.evaluate(dataset, req).some((f) => f.class === CompatClass.Blocking);
  }

  /**
   * Acknowledge a warning-class finding with a justification; records an audit event.
   * Acknowledging a blocking finding throws — blocking can never be cleared this way.
   */
  acknowledge(finding: CompatFinding, actor: UserId, rationale: string): AcknowledgementAuditEvent {
    if (finding.class === CompatClass.Blocking) {
      throw new BlockingNotAcknowledgeableError(finding.checkId);
    }
    const event: AcknowledgementAuditEvent = {
      type: "compatibility.acknowledged",
      actor,
      timestamp: this.now().toISOString(),
      datasetId: finding.datasetId,
      branchId: finding.branchId,
      hostId: finding.hostId,
      checkId: finding.checkId,
      rationale,
      message: finding.message,
    };
    this.audit.push(event);
    this.acknowledged.add(ackKey(finding.datasetId, finding.branchId, finding.checkId));
    return event;
  }

  isAcknowledged(finding: CompatFinding): boolean {
    return this.acknowledged.has(ackKey(finding.datasetId, finding.branchId, finding.checkId));
  }

  /** Immutable view of the acknowledgement audit log. */
  auditLog(): readonly AcknowledgementAuditEvent[] {
    return [...this.audit];
  }

  /** Build the coverage matrix for a set of selected (dataset → branch → host) assignments. */
  buildCoverageMatrix(selections: readonly Selection[]): readonly CoverageCell[] {
    return selections.map(({ dataset, requirement }) => {
      const findings = this.evaluate(dataset, requirement);
      const hasBlocking = findings.some((f) => f.class === CompatClass.Blocking);
      const warnings = findings.filter((f) => f.class === CompatClass.Warning);
      const allWarningsAcknowledged =
        warnings.length > 0 && warnings.every((f) => this.isAcknowledged(f));
      const status: CoverageCell["status"] = hasBlocking
        ? "blocked"
        : warnings.length > 0
          ? "warning"
          : "ok";
      return {
        datasetId: dataset.id,
        branchId: requirement.branchId,
        hostId: requirement.hostId,
        status,
        reachable: !hasBlocking,
        findings,
        acknowledged: allWarningsAcknowledged,
      };
    });
  }
}
