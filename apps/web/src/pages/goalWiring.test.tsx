// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { GoalVersionDraft } from "@chassix/shared";

const draft: GoalVersionDraft = {
  organismConstraints: { value: "Microbial host", status: "extracted" },
  desiredPhenotype: { value: null, status: "unknown" },
  productContext: { value: null, status: "unknown" },
  analysisObjectives: [],
  successMeasures: [],
  assumptions: [],
  clarifyingQuestions: [],
  unknowns: ["desiredPhenotype"],
};

// Mock the API client so the landing page exercises the success path without a server.
vi.mock("../api", () => ({
  interpretGoal: vi.fn(async (prompt: string) => ({
    originalPrompt: prompt,
    draft,
    provider: "anthropic",
    illustrative: false,
  })),
}));

import { WelcomePage } from "./WelcomePage";
import { GoalReviewPage } from "./GoalReviewPage";
import { useSelectionStore } from "../store/selectionStore";

beforeEach(() => {
  localStorage.clear();
  useSelectionStore.setState({
    goalPrompt: "",
    goalInterpretation: null,
    selectedHostIds: [],
    selectedDatasetIds: [],
  });
});
afterEach(cleanup);

describe("goal landing → planner wiring (Step 1.6)", () => {
  it("submits the goal to the planner and stores the interpretation", async () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Your goal"), {
      target: { value: "a thermotolerant host for an enzyme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build my workflow" }));

    await waitFor(() =>
      expect(useSelectionStore.getState().goalInterpretation?.provider).toBe("anthropic"),
    );
    expect(useSelectionStore.getState().goalInterpretation?.illustrative).toBe(false);
  });

  it("renders the live interpretation on the review screen", () => {
    useSelectionStore.setState({
      goalInterpretation: {
        originalPrompt: "my live goal",
        draft,
        provider: "anthropic",
        illustrative: false,
      },
    });
    render(
      <MemoryRouter>
        <GoalReviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/my live goal/)).toBeInTheDocument();
    expect(screen.getByText("Microbial host")).toBeInTheDocument();
  });
});
