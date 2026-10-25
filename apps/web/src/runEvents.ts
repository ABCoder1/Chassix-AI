import {
  BranchState,
  ConnectivityStatus,
  canBranchTransition,
  isBranchTerminal,
  isNewerEvent,
  BranchStatusEventSchema,
} from "@chassix/shared";
import type { BranchStatusEvent } from "@chassix/shared";

/**
 * Run-monitoring event abstraction (Phase 3 Wave 3B — Steps 3.4/3.5 UI).
 *
 * The run monitor never talks to a transport directly; it consumes this
 * `RunEventSource` interface. That seam lets the real screen use an SSE-backed
 * source while tests inject an in-memory fake (jsdom has no EventSource) and
 * drive events by hand. Reconnect-from-cursor and the connection-status signal
 * are part of the contract, so "gap-free replay" and the "Connection uncertain"
 * indicator (PRD §6/§7, BF-13) are exercised through the same interface.
 */

/** Callbacks a subscriber registers with a {@link RunEventSource}. */
export interface RunEventHandler {
  /** A branch status event arrived (already parsed into a typed event). */
  onEvent: (event: BranchStatusEvent) => void;
  /** The live connection changed between connected and "connection uncertain". */
  onConnection: (status: ConnectivityStatus) => void;
}

/**
 * A source of live run events with reconnect-from-cursor semantics.
 *
 * `subscribe` opens the stream and returns an unsubscribe function. `cursor` is
 * the last sequence the client has already applied; the source replays only
 * events with `sequence > cursor` so a reconnect is gap-free and never loses or
 * re-applies state (ADR-D8 / BF-13).
 */
export interface RunEventSource {
  subscribe: (handler: RunEventHandler, cursor?: number) => () => void;
}

/* -------------------------------------------------------------------------- */
/* Runtime model + reducer                                                    */
/* -------------------------------------------------------------------------- */

/** Per-branch runtime the monitor renders. Derived from applied events. */
export interface BranchRuntime {
  branchId: string;
  /** Human-readable branch name (e.g. the analysis + host). */
  label: string;
  /** Remote environment the branch executes in (illustrative). */
  environment: string;
  /** Current lifecycle state (PRD §6 BranchState). */
  state: BranchState;
  /** Highest applied sequence — the per-branch cursor guarding stale events. */
  lastSequence: number;
  /** Current stage name shown when no meaningful progress % is available. */
  stage: string;
  /** Reason/explanation attached to the latest applied event. */
  reason: string;
  /** Wall-clock ms the branch first started being tracked (for elapsed time). */
  startedAt: number;
  /** Timestamp (ms) of the latest applied event. */
  updatedAt: number;
}

/** Human labels for stages, keyed by the state a branch is entering. */
const STAGE_LABEL: Record<BranchState, string> = {
  [BranchState.NotConfigured]: "Not configured",
  [BranchState.Validating]: "Validating configuration",
  [BranchState.Ready]: "Ready to queue",
  [BranchState.Queued]: "Queued for remote execution",
  [BranchState.Running]: "Running analysis",
  [BranchState.ValidatingOutputs]: "Validating outputs",
  [BranchState.Succeeded]: "Completed",
  [BranchState.Failed]: "Failed",
  [BranchState.Cancelled]: "Cancelled",
  [BranchState.Skipped]: "Skipped",
};

/**
 * Apply one event to one branch, enforcing the two safety guards:
 *   1. stale/duplicate events (sequence <= lastSequence) are ignored, and
 *   2. a newer event only changes the state when it is a *legal forward*
 *      transition (PRD §6) — so out-of-order delivery can never move a branch
 *      backward in the UI.
 * A newer event always advances the cursor and refreshes reason/updatedAt even
 * when it carries the same state (e.g. a keep-alive), without regressing state.
 */
export function applyBranchEvent(current: BranchRuntime, event: BranchStatusEvent): BranchRuntime {
  if (!isNewerEvent(current.lastSequence, event.sequence)) {
    return current; // duplicate or stale — ignore entirely.
  }
  const updatedAt = Date.parse(event.timestamp);
  const base: BranchRuntime = {
    ...current,
    lastSequence: event.sequence,
    reason: event.reason,
    updatedAt: Number.isNaN(updatedAt) ? current.updatedAt : updatedAt,
  };
  if (canBranchTransition(current.state, event.state)) {
    return { ...base, state: event.state, stage: STAGE_LABEL[event.state] };
  }
  // Newer in sequence but not a legal forward move (same-state keep-alive or an
  // out-of-order event for an already-advanced branch): keep the current state.
  return base;
}

/** The monitor's full run state: branch runtimes keyed by branchId, in order. */
export interface RunRuntime {
  order: string[];
  branches: Record<string, BranchRuntime>;
}

/** Apply an event to the whole run (no-op for unknown branches). */
export function applyRunEvent(run: RunRuntime, event: BranchStatusEvent): RunRuntime {
  const current = run.branches[event.branchId];
  if (!current) return run;
  const next = applyBranchEvent(current, event);
  if (next === current) return run;
  return { ...run, branches: { ...run.branches, [event.branchId]: next } };
}

/** The highest applied sequence across all branches — the reconnect cursor. */
export function runCursor(run: RunRuntime): number {
  return run.order.reduce((max, id) => {
    const b = run.branches[id];
    return b && b.lastSequence > max ? b.lastSequence : max;
  }, 0);
}

/** True once every branch has reached a terminal state. */
export function isRunComplete(run: RunRuntime): boolean {
  return run.order.every((id) => {
    const b = run.branches[id];
    return b ? isBranchTerminal(b.state) : true;
  });
}

/* -------------------------------------------------------------------------- */
/* Fake in-memory source (tests + illustrative demo)                          */
/* -------------------------------------------------------------------------- */

/**
 * In-memory {@link RunEventSource} for tests and the illustrative demo. Events
 * pushed via {@link emit} are buffered so a late subscriber (or a reconnect with
 * a cursor) replays exactly the missed, in-order tail. Tests drive the monitor
 * by calling `emit`/`setConnection` directly.
 */
export class FakeRunEventSource implements RunEventSource {
  private readonly buffer: BranchStatusEvent[] = [];
  private handler: RunEventHandler | null = null;
  private connection: ConnectivityStatus = ConnectivityStatus.Connected;

  subscribe(handler: RunEventHandler, cursor = 0): () => void {
    this.handler = handler;
    // Reconnect replay: deliver only buffered events newer than the cursor.
    for (const event of this.buffer) {
      if (event.sequence > cursor) handler.onEvent(event);
    }
    handler.onConnection(this.connection);
    return () => {
      if (this.handler === handler) this.handler = null;
    };
  }

  /** Push an event as if it arrived from the server (validated like the real wire). */
  emit(event: BranchStatusEvent): void {
    const parsed = BranchStatusEventSchema.parse(event);
    this.buffer.push(parsed);
    this.handler?.onEvent(parsed);
  }

  /** Signal a connectivity change (heartbeat lost → ConnectionUncertain, etc.). */
  setConnection(status: ConnectivityStatus): void {
    this.connection = status;
    this.handler?.onConnection(status);
  }
}

/* -------------------------------------------------------------------------- */
/* Scripted source (default illustrative animation)                           */
/* -------------------------------------------------------------------------- */

/**
 * Plays a fixed, clearly-illustrative timeline of events on wall-clock timers so
 * the monitor animates without a backend. Not used in tests (they inject a
 * {@link FakeRunEventSource}); it exists only so visiting the route shows the
 * live-update behavior. No fabricated scientific results — only lifecycle chrome.
 */
export class ScriptedRunEventSource implements RunEventSource {
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly timeline: ReadonlyArray<{ at: number; event: BranchStatusEvent }>) {}

  subscribe(handler: RunEventHandler, cursor = 0): () => void {
    handler.onConnection(ConnectivityStatus.Connected);
    for (const { at, event } of this.timeline) {
      if (event.sequence <= cursor) continue;
      this.timers.push(setTimeout(() => handler.onEvent(event), at));
    }
    return () => {
      for (const t of this.timers) clearTimeout(t);
      this.timers.length = 0;
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Real SSE source (the later-swap production implementation)                 */
/* -------------------------------------------------------------------------- */

/**
 * Real {@link RunEventSource} backed by the browser's EventSource (SSE). The run
 * monitor consumes the interface, so swapping the fake/scripted source for this
 * one is the only change needed to go live. Reconnect sends the cursor as a query
 * param so the server replays from it; the native `error`/`open` events drive the
 * connection signal (error → ConnectionUncertain, NOT a scientific failure).
 *
 * Construction is lazy (no EventSource until `subscribe`), so this module stays
 * importable under jsdom where EventSource is undefined.
 */
export class SseRunEventSource implements RunEventSource {
  constructor(private readonly url: string) {}

  subscribe(handler: RunEventHandler, cursor = 0): () => void {
    if (typeof EventSource === "undefined") {
      throw new Error("EventSource is not available in this environment");
    }
    const sep = this.url.includes("?") ? "&" : "?";
    const es = new EventSource(`${this.url}${sep}cursor=${cursor}`);
    es.onopen = () => handler.onConnection(ConnectivityStatus.Connected);
    es.onerror = () => handler.onConnection(ConnectivityStatus.ConnectionUncertain);
    es.onmessage = (msg: MessageEvent) => {
      try {
        const parsed = BranchStatusEventSchema.parse(JSON.parse(msg.data as string));
        handler.onEvent(parsed);
      } catch {
        // Malformed frames are ignored; the authoritative snapshot endpoint
        // (Step 3.4) remains the source of truth on reconnect.
      }
    };
    return () => es.close();
  }
}
