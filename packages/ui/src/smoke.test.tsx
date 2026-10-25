// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Card, Table, Progress, Tag, EmptyState } from "./index";

afterEach(cleanup);

describe("component smoke render", () => {
  it("renders a Card", () => {
    render(
      <Card title="Host candidate A" subtitle="illustrative">
        content
      </Card>,
    );
    expect(screen.getByText("Host candidate A")).toBeVisible();
  });

  it("renders a Table with semantic headers and rows", () => {
    render(
      <Table
        caption="Candidates (illustrative)"
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Host", render: (r) => r.name },
          { key: "score", header: "Score", numeric: true, render: (r) => r.score },
        ]}
        rows={[
          { id: "1", name: "Host A", score: "0.82" },
          { id: "2", name: "Host B", score: "0.71" },
        ]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Host" })).toBeVisible();
    expect(screen.getByText("Host A")).toBeVisible();
  });

  it("renders a determinate Progress with ARIA value", () => {
    render(<Progress value={65} label="Running" />);
    const bar = screen.getByRole("progressbar", { name: "Running" });
    expect(bar).toHaveAttribute("aria-valuenow", "65");
  });

  it("renders an indeterminate Progress without a value", () => {
    render(<Progress label="Working" />);
    const bar = screen.getByRole("progressbar", { name: "Working" });
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("renders a Tag and an EmptyState", () => {
    render(
      <div>
        <Tag>genomics</Tag>
        <EmptyState title="No datasets found" description="Adjust filters to see results." />
      </div>,
    );
    expect(screen.getByText("genomics")).toBeVisible();
    expect(screen.getByText("No datasets found")).toBeVisible();
  });
});
