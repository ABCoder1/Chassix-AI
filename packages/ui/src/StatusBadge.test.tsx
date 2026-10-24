// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BranchState, CriticDisposition, ConnectivityStatus } from "@chassix/shared";

afterEach(cleanup);
import { StatusBadge } from "./StatusBadge";

/** The full inventory of states the badge must cover, with their text labels. */
const CRITIC_LABELS: Record<CriticDisposition, string> = {
  [CriticDisposition.Ready]: "Ready",
  [CriticDisposition.ReadyWithCaveats]: "Ready with caveats",
  [CriticDisposition.NeedsReview]: "Needs review",
};
const BRANCH_LABELS: Record<BranchState, string> = {
  [BranchState.NotConfigured]: "Not configured",
  [BranchState.Validating]: "Validating",
  [BranchState.Ready]: "Ready",
  [BranchState.Queued]: "Queued",
  [BranchState.Running]: "Running",
  [BranchState.ValidatingOutputs]: "Validating outputs",
  [BranchState.Succeeded]: "Succeeded",
  [BranchState.Failed]: "Failed",
  [BranchState.Cancelled]: "Cancelled",
  [BranchState.Skipped]: "Skipped",
};
const CONNECTIVITY_LABELS: Record<ConnectivityStatus, string> = {
  [ConnectivityStatus.Connected]: "Connected",
  [ConnectivityStatus.ConnectionUncertain]: "Connection uncertain",
};

describe("StatusBadge", () => {
  it("shows a visible text label (not color alone) for every critic disposition", () => {
    for (const [status, label] of Object.entries(CRITIC_LABELS)) {
      const { unmount } = render(
        <StatusBadge kind="critic" status={status as CriticDisposition} />,
      );
      expect(screen.getByText(label)).toBeVisible();
      unmount();
    }
  });

  it("shows a visible text label for every branch state", () => {
    for (const [status, label] of Object.entries(BRANCH_LABELS)) {
      const { unmount } = render(<StatusBadge kind="branch" status={status as BranchState} />);
      expect(screen.getByText(label)).toBeVisible();
      unmount();
    }
  });

  it("shows a visible text label for every connectivity status", () => {
    for (const [status, label] of Object.entries(CONNECTIVITY_LABELS)) {
      const { unmount } = render(
        <StatusBadge kind="connectivity" status={status as ConnectivityStatus} />,
      );
      expect(screen.getByText(label)).toBeVisible();
      unmount();
    }
  });

  it("exposes the status to assistive tech via role=status", () => {
    render(<StatusBadge kind="connectivity" status={ConnectivityStatus.ConnectionUncertain} />);
    expect(screen.getByRole("status")).toHaveTextContent("Connection uncertain");
  });
});
