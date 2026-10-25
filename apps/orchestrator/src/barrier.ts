/**
 * Integration barrier (Phase 4, Step 4.3 / BF-07).
 *
 * Harmonization must not start while any REQUIRED branch is still non-terminal. The barrier
 * is a pure projection over branch states: it answers "can we integrate yet, and if not, which
 * branches are we waiting on". Unaffected branches keep running, but integration still waits for
 * their terminal state (succeeded / failed / cancelled / skipped — PRD §6).
 */
import { isBranchTerminal, type BranchState } from "@chassix/shared";

/** The minimal branch view the barrier needs. */
export interface BranchLike {
  readonly name: string;
  readonly state: BranchState;
}

export interface BarrierState {
  /** True once every required branch has reached a terminal state. */
  readonly ready: boolean;
  /** Required branches still non-terminal (the "waiting on…" list shown in the UI). */
  readonly pending: readonly string[];
  /** Terminal branch-state tallies, for the barrier summary. */
  readonly terminal: {
    readonly succeeded: number;
    readonly failed: number;
    readonly cancelled: number;
    readonly skipped: number;
  };
}

/**
 * Compute the barrier over a run's branches.
 *
 * @param branches all branches in the run.
 * @param required the branch names that must be terminal before integration; defaults to every
 *   branch in the run. Names not present in `branches` are treated as pending (not yet created).
 */
export function computeBarrier(
  branches: readonly BranchLike[],
  required?: readonly string[],
): BarrierState {
  const byName = new Map(branches.map((b) => [b.name, b]));
  const requiredNames = required ?? branches.map((b) => b.name);

  const pending: string[] = [];
  for (const name of requiredNames) {
    const branch = byName.get(name);
    if (!branch || !isBranchTerminal(branch.state)) pending.push(name);
  }

  const terminal = { succeeded: 0, failed: 0, cancelled: 0, skipped: 0 };
  for (const b of branches) {
    switch (b.state) {
      case "succeeded":
        terminal.succeeded++;
        break;
      case "failed":
        terminal.failed++;
        break;
      case "cancelled":
        terminal.cancelled++;
        break;
      case "skipped":
        terminal.skipped++;
        break;
      default:
        break;
    }
  }

  return { ready: pending.length === 0, pending, terminal };
}
