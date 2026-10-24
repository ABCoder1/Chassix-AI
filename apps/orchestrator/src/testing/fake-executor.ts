/**
 * Inline fake executor for tests — implements the shared `ExecutorAdapter` so the orchestrator
 * stays decoupled from `@chassix/executor` (per the Step 3.x constraints). It records every
 * submit/cancel call (to assert "exactly one submission") and returns scripted poll results
 * per executor ref (to drive reconciliation).
 */
import type {
  ExecutorAdapter,
  ExecutorSubmission,
  ExecutorPoll,
  ExecutorStatus,
  RunManifest,
} from "@chassix/shared";

export class FakeExecutor implements ExecutorAdapter {
  readonly id = "fake-executor";
  readonly submissions: RunManifest[] = [];
  readonly cancels: string[] = [];
  private seq = 0;
  private readonly pollResults = new Map<string, ExecutorPoll>();

  constructor(private readonly onSubmit?: (manifest: RunManifest) => void | Promise<void>) {}

  async submit(manifest: RunManifest): Promise<ExecutorSubmission> {
    // The hook lets a test assert state is already persisted BEFORE submission is acknowledged.
    if (this.onSubmit) await this.onSubmit(manifest);
    this.submissions.push(manifest);
    const executorRef = `ref_${manifest.branchId}_${this.seq++}`;
    this.pollResults.set(executorRef, { status: "queued", progress: null, reason: "queued" });
    return { executorRef };
  }

  async poll(executorRef: string): Promise<ExecutorPoll> {
    return (
      this.pollResults.get(executorRef) ?? {
        status: "unknown",
        progress: null,
        reason: "no-status",
      }
    );
  }

  async cancel(executorRef: string): Promise<void> {
    this.cancels.push(executorRef);
    this.pollResults.set(executorRef, {
      status: "cancelled",
      progress: null,
      reason: "cancelled",
    });
  }

  /** Test control: set what the next poll of this ref returns. */
  setPoll(executorRef: string, status: ExecutorStatus, reason = ""): void {
    this.pollResults.set(executorRef, { status, progress: null, reason });
  }

  /** The executor ref minted for a given branch id (first submission), if any. */
  refForBranch(branchId: string): string | undefined {
    for (const ref of this.pollResults.keys()) {
      if (ref.includes(branchId)) return ref;
    }
    return undefined;
  }
}
