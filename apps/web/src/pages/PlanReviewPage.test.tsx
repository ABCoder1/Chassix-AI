// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PlanReviewPage } from "./PlanReviewPage";
import { ILLUSTRATIVE_PLAN } from "../planData";

function renderPlan(onLaunch?: (runId: string) => void) {
  return render(
    <MemoryRouter initialEntries={["/plan"]}>
      <PlanReviewPage {...(onLaunch ? { onLaunch } : {})} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("PlanReviewPage (Step 3.2, Screen 4 / BF-05)", () => {
  it("renders selected hosts, datasets, proposed tools and parameters", () => {
    renderPlan();
    // Hosts + datasets.
    const hosts = screen.getByTestId("plan-hosts");
    expect(within(hosts).getByText(ILLUSTRATIVE_PLAN.hosts[0]!)).toBeInTheDocument();
    const datasets = screen.getByTestId("plan-datasets");
    expect(within(datasets).getByText(ILLUSTRATIVE_PLAN.datasets[0]!)).toBeInTheDocument();

    // Proposed tools for the first branch (name + pinned version).
    const branch = ILLUSTRATIVE_PLAN.branches[0]!;
    const tools = screen.getByTestId(`plan-tools-${branch.id}`);
    expect(tools).toHaveTextContent(branch.tools[0]!.name);
    expect(tools).toHaveTextContent(branch.tools[0]!.version);

    // A basic parameter is visible.
    expect(screen.getByText("Significance threshold (FDR)")).toBeInTheDocument();
  });

  it("shows the Start analyses button", () => {
    renderPlan();
    expect(screen.getByRole("button", { name: /Start analyses/i })).toBeEnabled();
  });

  it("shows the manifest-immutable / new-draft note", () => {
    renderPlan();
    const note = screen.getByTestId("immutable-note");
    expect(note).toHaveTextContent(/immutable once launched/i);
    expect(note).toHaveTextContent(/creates a new draft/i);
  });

  it("keeps advanced parameters collapsed until expanded", () => {
    renderPlan();
    expect(screen.queryByTestId("advanced-params")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show advanced parameters/i }));
    const advanced = screen.getByTestId("advanced-params");
    expect(within(advanced).getByText("Random seed")).toBeInTheDocument();
  });

  it("highlights unresolved assumptions and blocked branches", () => {
    renderPlan();
    expect(screen.getByTestId("unresolved-assumptions")).toBeInTheDocument();
    const blocked = screen.getByTestId("blocked-branches");
    expect(blocked).toHaveTextContent(/unknown/i);
  });

  it("freezes the manifest on launch and shows the launched (immutable) banner", () => {
    const onLaunch = vi.fn();
    renderPlan(onLaunch);
    const start = screen.getByRole("button", { name: /Start analyses/i });
    fireEvent.click(start);
    expect(onLaunch).toHaveBeenCalledWith(ILLUSTRATIVE_PLAN.runId);
    // Once launched, the plan is read-only: the launch button is disabled and the
    // frozen banner appears.
    expect(screen.getByTestId("launched-banner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Analyses started/i })).toBeDisabled();
  });
});
