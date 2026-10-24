// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CanvasPage } from "./CanvasPage";
import { STAGES } from "../stages";
import { HOST_OPTIONS } from "../modules";
import { useSelectionStore, SELECTION_STORAGE_KEY } from "../store/selectionStore";

function renderCanvas() {
  return render(
    <MemoryRouter initialEntries={["/canvas"]}>
      <CanvasPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useSelectionStore.setState({ goalPrompt: "", selectedHostIds: [], selectedDatasetIds: [] });
});
afterEach(cleanup);

describe("CanvasPage (Screen 2, Phase 1 exit)", () => {
  it("renders the spatial canvas and the linear list from the same stage source", () => {
    renderCanvas();
    const canvas = screen.getByRole("group", { name: "Workflow canvas" });
    const list = screen.getByRole("navigation", { name: /Workflow stages \(linear\)/ });

    // Both views show every stage from the single STAGES source → parity.
    for (const stage of STAGES) {
      expect(within(canvas).getByText(stage.title)).toBeInTheDocument();
      expect(within(list).getByText(stage.title)).toBeInTheDocument();
    }
  });

  it("keeps the linear ordered list present for accessibility (narrow screens / AT)", () => {
    renderCanvas();
    const list = screen.getByRole("navigation", { name: /Workflow stages \(linear\)/ });
    // It is an ordered list with one item per stage.
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(STAGES.length);
  });

  it("drives both views from one active-stage selection", () => {
    renderCanvas();
    const list = screen.getByRole("navigation", { name: /Workflow stages \(linear\)/ });
    const discoveryBtn = within(list).getByRole("button", { name: /Host discovery/ });
    fireEvent.click(discoveryBtn);
    expect(discoveryBtn).toHaveAttribute("aria-current", "step");
    // The overview now exposes the host picker for the selected stage.
    expect(screen.getByText("Select hosts (illustrative)")).toBeInTheDocument();
  });

  it("persists host selections to the store and localStorage, surviving a remount", () => {
    const first = renderCanvas();
    const list = screen.getByRole("navigation", { name: /Workflow stages \(linear\)/ });
    fireEvent.click(within(list).getByRole("button", { name: /Host discovery/ }));

    const host = HOST_OPTIONS[0]!;
    fireEvent.click(screen.getByLabelText(host.name));

    expect(useSelectionStore.getState().selectedHostIds).toContain(host.id);
    // Persisted to localStorage → survives a real reload.
    expect(localStorage.getItem(SELECTION_STORAGE_KEY)).toContain(host.id);

    // Simulate navigation away and back (remount): the store is the single source.
    first.unmount();
    renderCanvas();
    const list2 = screen.getByRole("navigation", { name: /Workflow stages \(linear\)/ });
    fireEvent.click(within(list2).getByRole("button", { name: /Host discovery/ }));
    expect((screen.getByLabelText(host.name) as HTMLInputElement).checked).toBe(true);
  });

  it("rehydrates persisted selections from localStorage after a simulated reload", async () => {
    // Make and persist a selection, capturing the exact on-disk blob.
    useSelectionStore.getState().toggleDataset("ds-genome-1");
    const persisted = localStorage.getItem(SELECTION_STORAGE_KEY);
    expect(persisted).toContain("ds-genome-1");

    // Wipe in-memory state (as a fresh page load would). Restore the saved blob
    // (setState re-persists defaults) so localStorage looks like the prior
    // session, then rehydrate the way the persist middleware does on boot.
    useSelectionStore.setState({ selectedDatasetIds: [] });
    localStorage.setItem(SELECTION_STORAGE_KEY, persisted!);
    await useSelectionStore.persist.rehydrate();

    expect(useSelectionStore.getState().selectedDatasetIds).toContain("ds-genome-1");
  });

  it("exposes keyboard-operable zoom controls", () => {
    renderCanvas();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(screen.getByText("100%")).toBeInTheDocument();
    fireEvent.click(zoomIn);
    expect(screen.getByText("120%")).toBeInTheDocument();
    fireEvent.click(zoomOut);
    expect(screen.getByText("100%")).toBeInTheDocument();
    zoomIn.focus();
    expect(zoomIn).toHaveFocus();
  });
});
