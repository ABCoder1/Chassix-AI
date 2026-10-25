import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, StatusBadge, Drawer, Progress } from "@chassix/ui";
import { ConnectivityStatus, isBranchTerminal } from "@chassix/shared";
import { BrandBar } from "../components/BrandBar";
import { applyRunEvent, isRunComplete, runCursor, ScriptedRunEventSource } from "../runEvents";
import type { RunEventSource, RunRuntime, BranchRuntime } from "../runEvents";
import { createIllustrativeRun, ILLUSTRATIVE_TIMELINE } from "../runData";
import "./runs.css";

/**
 * Where "View results" sends the user when every branch has completed: the
 * visualizer workstation (separate app, dev port 5174). Override with
 * VITE_RESULTS_URL for other deployments.
 */
const RESULTS_URL =
  (import.meta.env.VITE_RESULTS_URL as string | undefined) ??
  "http://localhost:5174/demo/index.html";

/**
 * Step 3.5 — Run monitoring (Screen 5, PRD §E/§6).
 *
 * Per-branch cards show status (StatusBadge), current stage, elapsed time, remote
 * environment, a logs affordance and a cancel control. Branches update live from
 * a {@link RunEventSource}; the monitor consumes only that interface, so tests
 * inject a fake and drive events while the real screen uses an SSE source.
 *
 * Safety behaviors wired here (PRD §6):
 *  - live updates apply through `applyRunEvent`, which drops stale/duplicate events
 *    and only advances on legal forward transitions — so out-of-order delivery
 *    never moves a branch backward in the UI;
 *  - a lost heartbeat shows a "Connection uncertain" indicator (NOT a failure),
 *    and branches keep their last known state;
 *  - cancel is explicit and, absent a handler, enters a pending state — client
 *    loss never cancels, and a cancel is never shown as "failed".
 */

export interface RunMonitorPageProps {
  /** Event source to consume. Defaults to the scripted illustrative source. */
  eventSource?: RunEventSource;
  /** Initial run runtime. Defaults to the illustrative seed. */
  initialRun?: RunRuntime;
  /** Cancel handler. When omitted, cancel enters a local pending state. */
  onCancelBranch?: (branchId: string) => void;
}

function formatElapsed(ms: number): string {
  if (ms < 0 || Number.isNaN(ms)) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RunMonitorPage({ eventSource, initialRun, onCancelBranch }: RunMonitorPageProps) {
  const params = useParams();
  const runId = params.runId ?? "run-ILLUSTRATIVE-0001";

  const [run, setRun] = useState<RunRuntime>(() => initialRun ?? createIllustrativeRun());
  const [connection, setConnection] = useState<ConnectivityStatus>(ConnectivityStatus.Connected);
  const [now, setNow] = useState<number>(() => Date.now());
  const [logsBranchId, setLogsBranchId] = useState<string | null>(null);
  const [cancelPending, setCancelPending] = useState<Set<string>>(() => new Set());

  // The reconnect cursor is derived from applied state; held in a ref so the
  // effect can resubscribe from it without re-running on every event.
  const cursorRef = useRef(0);
  cursorRef.current = runCursor(run);

  // Default source is the scripted illustrative timeline. `??` short-circuits so
  // the Scripted constructor (which arms timers) never runs when a source is
  // injected (tests inject a FakeRunEventSource).
  const source = useMemo(
    () => eventSource ?? new ScriptedRunEventSource(ILLUSTRATIVE_TIMELINE),
    [eventSource],
  );

  useEffect(() => {
    const unsubscribe = source.subscribe(
      {
        onEvent: (event) => setRun((prev) => applyRunEvent(prev, event)),
        onConnection: (status) => setConnection(status),
      },
      cursorRef.current,
    );
    return unsubscribe;
  }, [source]);

  // Ticking clock for elapsed time; stops once every branch is terminal.
  const complete = isRunComplete(run);
  useEffect(() => {
    if (complete) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [complete]);

  const branches = run.order.map((id) => run.branches[id]).filter(Boolean) as BranchRuntime[];
  const uncertain = connection === ConnectivityStatus.ConnectionUncertain;
  const logsBranch = logsBranchId ? run.branches[logsBranchId] : undefined;

  function handleCancel(branchId: string) {
    if (onCancelBranch) {
      onCancelBranch(branchId);
      return;
    }
    // No handler: explicit pending state. Cancellation is confirmed only by a
    // remote-acknowledged event, never optimistically, and never shown as failed.
    setCancelPending((prev) => new Set(prev).add(branchId));
  }

  return (
    <div className="runs">
      <BrandBar />
      <main className="runs__main" id="main">
        <div className="runs__head">
          <div>
            <h1 className="runs__title">Running analyses</h1>
            <p className="runs__subtitle">
              Run <code>{runId}</code> · parallel branches executing remotely.
            </p>
          </div>
          <div className="runs__head-status">
            <StatusBadge kind="connectivity" status={connection} />
          </div>
        </div>

        {uncertain && (
          <p className="runs__uncertain" role="status" data-testid="connection-uncertain">
            <strong>Connection uncertain.</strong> The live heartbeat was lost, so statuses below
            may be stale. This is a client-side display issue — the remote analyses keep running and
            nothing has failed or been cancelled. Reconnecting will replay any missed updates.
          </p>
        )}

        <section className="runs__list" aria-label="Analysis branches">
          {branches.map((b) => {
            const terminal = isBranchTerminal(b.state);
            const pending = cancelPending.has(b.branchId);
            const elapsed = formatElapsed((terminal ? b.updatedAt : now) - b.startedAt);
            return (
              <Card
                key={b.branchId}
                className="runs__branch"
                data-testid={`run-branch-${b.branchId}`}
                title={b.label}
                actions={<StatusBadge kind="branch" status={b.state} />}
              >
                <dl className="runs__branch-grid">
                  <div>
                    <dt>Current stage</dt>
                    <dd data-testid={`stage-${b.branchId}`}>{b.stage}</dd>
                  </div>
                  <div>
                    <dt>Elapsed</dt>
                    <dd data-testid={`elapsed-${b.branchId}`}>{elapsed}</dd>
                  </div>
                  <div>
                    <dt>Remote environment</dt>
                    <dd>{b.environment}</dd>
                  </div>
                  <div>
                    <dt>Latest update</dt>
                    <dd>{b.reason}</dd>
                  </div>
                </dl>

                {/* Stage-based status everywhere; no progress % is shown because the
                    event stream reports no meaningful progress (PRD §E). */}
                <Progress label={b.stage} />

                {pending && (
                  <p
                    className="runs__cancel-pending"
                    role="status"
                    data-testid={`cancel-pending-${b.branchId}`}
                  >
                    Cancel requested — awaiting remote acknowledgement.
                  </p>
                )}

                <div className="runs__branch-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setLogsBranchId(b.branchId)}
                  >
                    View logs
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={terminal || pending}
                    aria-label={`Cancel ${b.label}`}
                    data-testid={`cancel-${b.branchId}`}
                    onClick={() => handleCancel(b.branchId)}
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>

        {complete && (
          <div className="runs__complete" role="status" data-testid="run-complete">
            <div>
              <strong className="runs__complete-title">All analyses complete</strong>
              <p className="runs__complete-sub">
                Every branch finished successfully. Open the workstation to explore the
                condition-specific flux maps and multi-omics results.
              </p>
            </div>
            <a
              className="runs__results-link bf-focusable"
              href={RESULTS_URL}
              data-testid="view-results"
            >
              View results →
            </a>
          </div>
        )}
      </main>

      <Drawer
        open={logsBranch !== undefined}
        onClose={() => setLogsBranchId(null)}
        title={logsBranch ? `Logs — ${logsBranch.label}` : "Logs"}
      >
        {logsBranch && (
          <div className="runs__logs" data-testid="logs-drawer">
            <pre className="runs__log-body">
              {[
                `attempt ${logsBranch.branchId}-attempt-1`,
                `stage: ${logsBranch.stage}`,
                `state: ${logsBranch.state}`,
                `reason: ${logsBranch.reason}`,
              ].join("\n")}
            </pre>
          </div>
        )}
      </Drawer>
    </div>
  );
}
