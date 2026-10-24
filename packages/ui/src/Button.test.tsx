// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("renders a native, focusable button", () => {
    render(<Button>Launch</Button>);
    const btn = screen.getByRole("button", { name: "Launch" });
    expect(btn.tagName).toBe("BUTTON");
    // Keyboard-operable: a native button is in the tab order and is focusable.
    btn.focus();
    expect(btn).toHaveFocus();
    // Carries the shared class that renders a visible focus ring.
    expect(btn).toHaveClass("bf-focusable");
  });

  it("invokes onClick (pointer and keyboard activation both route here)", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.keyUp(btn, { key: "Enter" });
    expect(onClick).toHaveBeenCalled();
  });

  it("is not activatable when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Disabled" });
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(btn).toBeDisabled();
  });
});
