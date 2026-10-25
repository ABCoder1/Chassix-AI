// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WelcomePage } from "./WelcomePage";
import { MODULES, EXAMPLE_GOAL } from "../modules";
import { useSelectionStore, SELECTION_STORAGE_KEY } from "../store/selectionStore";

function renderWelcome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <WelcomePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSelectionStore.setState({ goalPrompt: "", selectedHostIds: [], selectedDatasetIds: [] });
});
afterEach(cleanup);

describe("WelcomePage (Screen 1, BF-01)", () => {
  it("shows the exact prompt and supporting copy", () => {
    renderWelcome();
    expect(screen.getByRole("heading", { name: "what do you want to build?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Describe your end goal out of an experiment in plain language. We'll assemble the tools, parameters and workflow for you.",
      ),
    ).toBeInTheDocument();
  });

  it("disables 'Build my workflow' while the prompt is empty and enables it after typing", () => {
    renderWelcome();
    const submit = screen.getByRole("button", { name: "Build my workflow" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Your goal"), {
      target: { value: "a thermotolerant host" },
    });
    expect(submit).toBeEnabled();

    // Whitespace-only must not count as a goal.
    fireEvent.change(screen.getByLabelText("Your goal"), { target: { value: "   " } });
    expect(submit).toBeDisabled();
  });

  it("fills the composer from the example flow", () => {
    renderWelcome();
    const composer = screen.getByLabelText("Your goal") as HTMLTextAreaElement;
    expect(composer.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Choose an example" }));
    expect(composer.value).toBe(EXAMPLE_GOAL);
    expect(screen.getByRole("button", { name: "Build my workflow" })).toBeEnabled();
  });

  it("renders every supported module card before submitting", () => {
    renderWelcome();
    for (const m of MODULES) {
      expect(screen.getByText(m.title)).toBeInTheDocument();
    }
    // sanity: submit still disabled, so modules are visible pre-submit
    expect(screen.getByRole("button", { name: "Build my workflow" })).toBeDisabled();
  });

  it("offers a keyboard-focusable journey (composer, modules area, submit)", () => {
    renderWelcome();
    const composer = screen.getByLabelText("Your goal");
    composer.focus();
    expect(composer).toHaveFocus();

    const example = screen.getByRole("button", { name: "Choose an example" });
    example.focus();
    expect(example).toHaveFocus();

    // Recent project entry is reachable and focusable.
    const recent = screen.getByRole("button", { name: /Thermotolerant host draft/ });
    recent.focus();
    expect(recent).toHaveFocus();
  });

  it("persists the goal to the selection store on submit", () => {
    renderWelcome();
    fireEvent.change(screen.getByLabelText("Your goal"), {
      target: { value: "  draft goal text  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build my workflow" }));
    expect(useSelectionStore.getState().goalPrompt).toBe("draft goal text");
    expect(localStorage.getItem(SELECTION_STORAGE_KEY)).toContain("draft goal text");
  });

  it("recent project entry is within a labelled recent-projects region", () => {
    renderWelcome();
    const region = screen.getByRole("heading", { name: "Recent projects" });
    expect(region).toBeInTheDocument();
    const recent = screen.getByRole("button", { name: /Thermotolerant host draft/ });
    expect(within(recent).getByText(/open workflow canvas/)).toBeInTheDocument();
  });
});
