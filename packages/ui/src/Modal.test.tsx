// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Modal } from "./Modal";

afterEach(cleanup);
import { Button } from "./Button";

describe("Modal", () => {
  it("renders title and content when open", () => {
    render(
      <Modal open onClose={() => {}} title="Confirm launch">
        <p>Body text</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Confirm launch")).toBeVisible();
    expect(screen.getByText("Body text")).toBeVisible();
  });

  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves focus into the dialog (focus trap engaged)", () => {
    render(
      <Modal open onClose={() => {}} title="Trap" footer={<Button>OK</Button>}>
        <Button>Inside</Button>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("wraps focus at the boundaries (Tab from last -> first, Shift+Tab from first -> last)", () => {
    render(
      <Modal open onClose={() => {}} title="Wrap">
        <Button>Alpha</Button>
      </Modal>,
    );
    // DOM order of focusables: [Close dialog, Alpha]. Close is first, Alpha last.
    const closeBtn = screen.getByRole("button", { name: "Close dialog" });
    const alpha = screen.getByRole("button", { name: "Alpha" });

    // Tab from the last focusable wraps to the first.
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "Tab" });
    expect(closeBtn).toHaveFocus();

    // Shift+Tab from the first focusable wraps to the last.
    closeBtn.focus();
    fireEvent.keyDown(closeBtn, { key: "Tab", shiftKey: true });
    expect(alpha).toHaveFocus();
  });

  it("is dismissible with the Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Esc">
        <p>Body</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
