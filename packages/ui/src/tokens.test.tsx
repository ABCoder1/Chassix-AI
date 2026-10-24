// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, cleanup } from "@testing-library/react";
import { Button, Card, StatusBadge, Tag, Progress } from "./index";
import { CriticDisposition } from "@chassix/shared";

afterEach(cleanup);

// Read the token stylesheet directly (vitest resolves CSS imports to empty
// modules, so inspect the file on disk). Vitest runs from the repo root.
const tokensCss = readFileSync(join(process.cwd(), "packages/ui/src/tokens.css"), "utf8");

const EXPECTED_TOKENS = [
  "--color-bg",
  "--color-surface",
  "--color-text",
  "--color-primary", // mint
  "--color-info", // blue
  "--color-warning", // amber
  "--color-accent", // violet
  "--color-danger",
  "--canvas-dot",
  "--radius-md",
  "--radius-lg",
  "--space-2",
  "--font-sans",
  "--focus-ring",
];

const HEX_IN_INLINE_STYLE = /style="[^"]*#[0-9a-fA-F]{3,8}/;

describe("design tokens", () => {
  it("tokens.css defines every expected design variable on :root", () => {
    expect(tokensCss).toMatch(/:root\s*{/);
    for (const token of EXPECTED_TOKENS) {
      expect(tokensCss, `missing ${token}`).toContain(`${token}:`);
    }
  });

  it("components emit no hardcoded hex colors in inline styles (tokens only)", () => {
    const { container } = render(
      <div>
        <Button>Primary</Button>
        <Card title="Panel" subtitle="Subtitle">
          body
        </Card>
        <StatusBadge kind="critic" status={CriticDisposition.ReadyWithCaveats} />
        <Tag>modality</Tag>
        <Progress value={40} label="Loading" />
      </div>,
    );
    expect(container.innerHTML).not.toMatch(HEX_IN_INLINE_STYLE);
  });

  it("any inline color reference uses a CSS custom property", () => {
    const { container } = render(
      <Card title="Panel" actions={<Button size="sm">act</Button>}>
        body
      </Card>,
    );
    const styled = container.querySelectorAll<HTMLElement>("[style]");
    styled.forEach((el) => {
      const style = el.getAttribute("style") ?? "";
      if (/color|background/i.test(style)) {
        expect(style).toMatch(/var\(--/);
      }
    });
  });
});
