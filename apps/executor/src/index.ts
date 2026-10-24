/**
 * @chassix/executor — the remote executor adapter (Step 3.1, PRD §7 / ADR-D4).
 *
 * The ONLY code path that talks to a workflow engine. The orchestrator drives adapters through
 * the `ExecutorAdapter` contract (submit → poll → cancel) from `@chassix/shared` and never
 * addresses the engine directly. Two adapters ship:
 *   - FakeExecutor:     deterministic in-memory engine Phase 3 is built on (ADR-D10 deferral).
 *   - NextflowExecutor: typed stub for the live engine (ADR-D4), throws NotImplemented.
 */

export { FakeExecutor, FakeScenario } from "./fake-executor.js";
export {
  NextflowExecutor,
  type NextflowExecutorConfig,
  type NextflowCredentials,
} from "./nextflow-executor.js";
export {
  statusToBranchState,
  pollToBranchState,
  isConnectionUncertain,
  executorStatusToBranchState,
} from "./status-mapping.js";
export { NotImplementedError, UnknownExecutorRefError, CannotCancelError } from "./errors.js";
