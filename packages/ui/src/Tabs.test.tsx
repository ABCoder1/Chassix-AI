// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Tabs } from "./Tabs";

afterEach(cleanup);

const items = [
  { id: "a", label: "Genomics", content: "Genomics panel" },
  { id: "b", label: "Transcriptomics", content: "Transcriptomics panel" },
  { id: "c", label: "Pathways", content: "Pathways panel" },
];

describe("Tabs", () => {
  it("shows the first tab's panel by default", () => {
    render(<Tabs aria-label="Modalities" items={items} />);
    expect(screen.getByText("Genomics panel")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Genomics" })).toHaveAttribute("aria-selected", "true");
  });

  it("is keyboard navigable with ArrowRight / ArrowLeft", () => {
    render(<Tabs aria-label="Modalities" items={items} />);
    const first = screen.getByRole("tab", { name: "Genomics" });
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowRight" });
    const second = screen.getByRole("tab", { name: "Transcriptomics" });
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveFocus();
    expect(screen.getByText("Transcriptomics panel")).toBeVisible();

    fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Genomics" })).toHaveAttribute("aria-selected", "true");
  });

  it("supports Home and End keys", () => {
    render(<Tabs aria-label="Modalities" items={items} />);
    const first = screen.getByRole("tab", { name: "Genomics" });
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(screen.getByRole("tab", { name: "Pathways" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Pathways" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "Genomics" })).toHaveAttribute("aria-selected", "true");
  });
});
