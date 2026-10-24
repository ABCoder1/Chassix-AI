import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Selection-state store (Step 1.7). Holds the draft goal prompt plus the user's
 * host and dataset selections. Persisted to localStorage via zustand's `persist`
 * middleware so selections survive tab/navigation changes AND a full reload
 * (Phase 1 exit criterion: "selections survive tab changes and reload").
 */
export interface SelectionState {
  /** The plain-language goal captured on the welcome screen. */
  goalPrompt: string;
  /** Ids of selected host candidates. */
  selectedHostIds: string[];
  /** Ids of selected datasets. */
  selectedDatasetIds: string[];
  setGoalPrompt: (prompt: string) => void;
  toggleHost: (id: string) => void;
  toggleDataset: (id: string) => void;
  clearSelections: () => void;
}

const STORAGE_KEY = "chassix.selection.v1";

const toggle = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set) => ({
      goalPrompt: "",
      selectedHostIds: [],
      selectedDatasetIds: [],
      setGoalPrompt: (prompt) => set({ goalPrompt: prompt }),
      toggleHost: (id) => set((s) => ({ selectedHostIds: toggle(s.selectedHostIds, id) })),
      toggleDataset: (id) => set((s) => ({ selectedDatasetIds: toggle(s.selectedDatasetIds, id) })),
      clearSelections: () => set({ selectedHostIds: [], selectedDatasetIds: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const SELECTION_STORAGE_KEY = STORAGE_KEY;
