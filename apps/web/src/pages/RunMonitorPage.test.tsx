// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BranchState, ConnectivityStatus } from "@chassix/shared";
import type { BranchStatusEvent } from "@chassix/shared";
import { RunMonitorPage } from "./RunMonitorPage";
import { FakeRunEventSource } from "../runEvents";
import { createIllustrativeRun } from "../runData";

const BRANCH = "branch-genome-bl01"; // seeded as Queued.

function ev(sequence: number, state: BranchState, reason = "test"): BranchStatusEvent {
  return {
    runId: "run-ILLUSTRATIVE-0001",
    branchId: BRANCH,
    attemptId: `${BRANCH}-attempt-1`,
    eventId: `${BRANCH}-${sequence}`,
    sequence,
    timestamp: new Date().toISOString(),
    state,
    reason,
  };
}

function renderMonitor(fake: FakeRunEventSource, onCancelBranch?: (id: string) => void) {
  return render(
    <MemoryRouter initialEntries={["/runs/run-ILLUSTRATIVE-0001"]}>
      <RunMonitorPage
        eventSource={fake}
        initialRun={createIllustrativeRun(0)}
        {...(onCancelBranch ? { onCancelBranch } : {})}
      />
    </MemoryRouter>,
  );
}

/** The branch StatusBadge within a given branch card. */
function branchBadge(branchId: string) {
  const card = screen.getByTestId(`run-branch-${branchId}`);
  return within(card).getByRole("status");
}

afterEach(cleanup);

describe("RunMonitorPage (Step 3.5, Screen 5 / BF-06, BF-13)", () => {
  it("advances a branch Running → Validating outputs → Succeeded as events arrive", () => {
    const fake = new FakeRunEventSource();
    renderMonitor(fake);

    // Seeded as Queued.
    expect(branchBadge(BRANCH)).toHaveTextContent("Queued");

    act(() => fake.emit(ev(1, BranchState.Running)));
    expect(branchBadge(BRANCH)).toHaveTextContent("Running");

    act(() => fake.emit(ev(2, BranchState.ValidatingOutputs)));
    expect(branchBadge(BRANCH)).toHaveTextContent("Validating outputs");

    act(() => fake.emit(ev(3, BranchState.Succeeded)));
    expect(branchBadge(BRANCH)).toHaveTextContent("Succeeded");
  });

  it("shows 'Connection uncertain' on heartbeat loss, without failing any branch", () => {
    const fake = new FakeRunEventSource();
    renderMonitor(fake);

    act(() => fake.emit(ev(1, BranchState.Running)));
    expect(screen.queryByTestId("connection-uncertain")).toBeNull();

    act(() => fake.setConnection(ConnectivityStatus.ConnectionUncertain));

    // The indicator appears...
    expect(screen.getByTestId("connection-uncertain")).toBeInTheDocument();
    // ...and the connectivity badge reflects it.
    expect(screen.getAllByText(/Connection uncertain/i).length).toBeGreaterThanOrEqual(1);
    // ...but the branch is NOT marked failed — it keeps its last known state.
    expect(branchBadge(BRANCH)).toHaveTextContent("Running");
  });

  it("ignores stale/duplicate and out-of-order events (never moves a branch backward)", () => {
    const fake = new FakeRunEventSource();
    renderMonitor(fake);

    act(() => fake.emit(ev(1, BranchState.Running)));
    act(() => fake.emit(ev(2, BranchState.ValidatingOutputs)));
    expect(branchBadge(BRANCH)).toHaveTextContent("Validating outputs");

    // Duplicate of an already-applied sequence — ignored.
    act(() => fake.emit(ev(2, BranchState.ValidatingOutputs)));
    // Stale/out-of-order: lower sequence trying to regress to Running — ignored.
    act(() => fake.emit(ev(1, BranchState.Running)));
    // Newer sequence but an illegal backward transition — state must not regress.
    act(() => fake.emit(ev(3, BranchState.Queued)));

    expect(branchBadge(BRANCH)).toHaveTextContent("Validating outputs");
  });

  it("renders a cancel control that calls the injected handler", () => {
    const fake = new FakeRunEventSource();
    const onCancel = vi.fn();
    renderMonitor(fake, onCancel);

    const cancelBtn = screen.getByTestId(`cancel-${BRANCH}`);
    expect(cancelBtn).toBeInTheDocument();
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledWith(BRANCH);
  });

  it("replays only post-cursor events to a late subscriber (reconnect semantics)", () => {
    const fake = new FakeRunEventSource();
    // Buffer two events before the monitor mounts.
    fake.emit(ev(1, BranchState.Running));
    fake.emit(ev(2, BranchState.ValidatingOutputs));

    renderMonitor(fake); // subscribes with cursor 0 → replays both in order.
    expect(branchBadge(BRANCH)).toHaveTextContent("Validating outputs");
  });
});
