// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HostDiscoveryPage } from "./HostDiscoveryPage";
import { HOST_CANDIDATES } from "../hosts";
import { useSelectionStore, SELECTION_STORAGE_KEY } from "../store/selectionStore";

function renderHosts() {
  return render(
    <MemoryRouter initialEntries={["/hosts"]}>
      <HostDiscoveryPage />
    </MemoryRouter>,
  );
}

const HOST_A = HOST_CANDIDATES[0]!;
const HOST_B = HOST_CANDIDATES[1]!;

beforeEach(() => {
  localStorage.clear();
  useSelectionStore.setState({ goalPrompt: "", selectedHostIds: [], selectedDatasetIds: [] });
});
afterEach(cleanup);

describe("HostDiscoveryPage (Step 2.3, Screen 2 / BF-02)", () => {
  it("renders each host card with its score AND a suitability label (not just a number)", () => {
    renderHosts();
    const card = screen.getByTestId(`score-${HOST_A.id}`);
    // The numeric score is present...
    expect(within(card).getByText(String(Math.round(HOST_A.score * 100)))).toBeInTheDocument();
    // ...and so is the human-readable suitability label.
    expect(within(card).getByText(HOST_A.suitabilityLabel)).toBeInTheDocument();
    expect(within(card).getByText(/suitability estimate/i)).toBeInTheDocument();
  });

  it("disables Continue with 0 hosts selected and enables it after selecting at least one", () => {
    renderHosts();
    const continueBtn = screen.getByRole("button", { name: /Continue with selected hosts/i });
    expect(continueBtn).toBeDisabled();
    expect(screen.getByTestId("selection-count")).toHaveTextContent("0 hosts selected");

    fireEvent.click(screen.getByLabelText(`Select ${HOST_A.organism}`));

    expect(continueBtn).toBeEnabled();
    expect(screen.getByTestId("selection-count")).toHaveTextContent("1 host selected");
    // Persisted to the shared selection store + localStorage.
    expect(useSelectionStore.getState().selectedHostIds).toContain(HOST_A.id);
    expect(localStorage.getItem(SELECTION_STORAGE_KEY)).toContain(HOST_A.id);
  });

  it("opens the citation drawer showing the source passage and retrieval date", () => {
    renderHosts();
    // Drawer is closed initially.
    expect(screen.queryByTestId("citation-drawer")).toBeNull();

    const card = screen.getByTestId(`score-${HOST_A.id}`).closest(".bf-card")!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: /View citations/i }));

    const drawer = screen.getByTestId("citation-drawer");
    const firstCite = HOST_A.citations[0]!;
    expect(within(drawer).getByText(firstCite.passage)).toBeInTheDocument();
    // Retrieval date is shown (a host may have several sources retrieved the same day).
    expect(within(drawer).getAllByText(firstCite.retrievalDate).length).toBeGreaterThanOrEqual(1);
    // Bibliographic metadata + claim linkage are present too.
    expect(within(drawer).getByText(firstCite.title)).toBeInTheDocument();
    expect(within(drawer).getByText(firstCite.claimLinkage)).toBeInTheDocument();
  });

  it("shows a compare view with at least two hosts side by side", () => {
    renderHosts();
    const compareBtn = screen.getByRole("button", { name: /Compare selected/i });
    // Compare needs >= 2 hosts; disabled with fewer.
    expect(compareBtn).toBeDisabled();

    fireEvent.click(screen.getByLabelText(`Select ${HOST_A.organism}`));
    fireEvent.click(screen.getByLabelText(`Select ${HOST_B.organism}`));
    expect(compareBtn).toBeEnabled();

    fireEvent.click(compareBtn);
    const compare = screen.getByTestId("compare-view");
    expect(within(compare).getByText(HOST_A.organism)).toBeInTheDocument();
    expect(within(compare).getByText(HOST_B.organism)).toBeInTheDocument();
  });

  it("renders an explicit conflicting-findings marker when a host has conflicts", () => {
    renderHosts();
    const conflictHost = HOST_CANDIDATES.find((h) => h.conflictingFindings.length > 0)!;
    const block = screen.getByTestId(`conflict-${conflictHost.id}`);
    expect(within(block).getByText("Conflicting findings")).toBeInTheDocument();
    expect(within(block).getByText(conflictHost.conflictingFindings[0]!)).toBeInTheDocument();
  });

  it("marks hosts with sparse/unsupported evidence explicitly", () => {
    renderHosts();
    const sparseHost = HOST_CANDIDATES.find((h) => h.evidenceQuality === "sparse")!;
    expect(screen.getByTestId(`evidence-marker-${sparseHost.id}`)).toHaveTextContent(/Sparse/i);
  });
});
