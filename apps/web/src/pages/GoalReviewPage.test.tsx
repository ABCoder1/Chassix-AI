// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GoalReviewPage } from "./GoalReviewPage";
import { ILLUSTRATIVE_GOAL_DRAFT } from "../goalDraft";
import { useSelectionStore } from "../store/selectionStore";

function renderGoal() {
  return render(
    <MemoryRouter initialEntries={["/goal"]}>
      <GoalReviewPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSelectionStore.setState({ goalPrompt: "", selectedHostIds: [], selectedDatasetIds: [] });
});
afterEach(cleanup);

describe("GoalReviewPage (Step 1.6, BF-01 / PRD §A)", () => {
  it("renders the interpreted-goal review screen", () => {
    renderGoal();
    expect(screen.getByRole("heading", { name: "Review interpreted goal" })).toBeInTheDocument();
  });

  it("renders an explicit 'unknown' marker for every unknown and never fabricates a value for it", () => {
    renderGoal();
    const unknownsRegion = screen
      .getByRole("heading", { name: "Marked unknown" })
      .closest("section")!;
    // Each named unknown appears with an explicit "Unknown" marker.
    for (const u of ILLUSTRATIVE_GOAL_DRAFT.unknowns) {
      expect(within(unknownsRegion).getByText(u)).toBeInTheDocument();
    }
    // At least one explicit "Unknown" badge is present (never a fabricated value).
    expect(within(unknownsRegion).getAllByText(/Unknown/i).length).toBeGreaterThanOrEqual(
      ILLUSTRATIVE_GOAL_DRAFT.unknowns.length,
    );
    // The critical missing details are NOT shown as filled-in field values.
    expect(screen.queryByDisplayValue(/Target operating temperature range/i)).toBeNull();
  });

  it("shows assumptions as editable assumptions, explicitly not asserted facts", () => {
    renderGoal();
    const region = screen
      .getByRole("heading", { name: "Proposed assumptions" })
      .closest("section")!;
    // The section states these are assumptions, not facts.
    expect(within(region).getByText(/assumptions, not facts/i)).toBeInTheDocument();
    // Each assumption is an editable text input tagged "Assumption".
    expect(within(region).getAllByText("Assumption").length).toBe(
      ILLUSTRATIVE_GOAL_DRAFT.assumptions.length,
    );
    const firstEditor = within(region).getByLabelText("Edit assumption 1") as HTMLInputElement;
    expect(firstEditor.value).toBe(ILLUSTRATIVE_GOAL_DRAFT.assumptions[0]!.text);
    fireEvent.change(firstEditor, { target: { value: "My corrected assumption" } });
    expect((within(region).getByLabelText("Edit assumption 1") as HTMLInputElement).value).toBe(
      "My corrected assumption",
    );
  });

  it("renders every targeted clarifying question instead of guessing", () => {
    renderGoal();
    const region = screen
      .getByRole("heading", { name: "Clarifying questions" })
      .closest("section")!;
    for (const q of ILLUSTRATIVE_GOAL_DRAFT.clarifyingQuestions) {
      expect(within(region).getByText(q)).toBeInTheDocument();
    }
  });

  it("makes every extracted field editable with a visible status", () => {
    renderGoal();
    // Each extracted field exposes its status control and an editable value.
    const orgValue = screen.getByLabelText("Edit Organism constraints") as HTMLTextAreaElement;
    expect(orgValue.value).toBe(ILLUSTRATIVE_GOAL_DRAFT.organismConstraints.value);
    fireEvent.change(orgValue, { target: { value: "Fungal host only" } });
    expect((screen.getByLabelText("Edit Organism constraints") as HTMLTextAreaElement).value).toBe(
      "Fungal host only",
    );

    // Changing a field's status to Unknown replaces its value editor with an explicit marker.
    const statusSelect = screen.getByLabelText("Change status for Product context");
    fireEvent.change(statusSelect, { target: { value: "unknown" } });
    expect(screen.getByTestId("unknown-productContext")).toBeInTheDocument();
    expect(screen.queryByLabelText("Edit Product context")).toBeNull();
  });
});
