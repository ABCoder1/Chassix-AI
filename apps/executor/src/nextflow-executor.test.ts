import { inspect } from "node:util";
import { describe, it, expect } from "vitest";
import type { RunManifest } from "@chassix/shared";
import { NextflowExecutor } from "./nextflow-executor.js";
import { NotImplementedError } from "./errors.js";

const SECRET = "super-secret-token-value";

const make = (): NextflowExecutor =>
  new NextflowExecutor({
    engineUrl: "https://engine.internal/nf",
    environment: "pilot-genomics",
    credentials: { identity: "svc-executor", token: SECRET },
  });

const manifest: RunManifest = {
  runId: "run-1",
  branchId: "branch-genomics",
  branch: "genomics",
  inputs: [],
  parameters: {},
  toolVersions: {},
  referenceVersions: {},
  command: "nextflow run main.nf",
  createdAt: "2026-10-24T00:00:00.000Z",
  manifestHash: "sha256:deadbeef",
};

describe("NextflowExecutor stub", () => {
  it("submit throws NotImplemented referencing the sign-off", async () => {
    const x = make();
    await expect(x.submit(manifest)).rejects.toBeInstanceOf(NotImplementedError);
    await expect(x.submit(manifest)).rejects.toThrow(/ADR-D10|sign-off/i);
  });

  it("poll throws NotImplemented", async () => {
    await expect(make().poll("ref")).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("cancel throws NotImplemented", async () => {
    await expect(make().cancel("ref")).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("never exposes credentials via JSON, inspect, or String", async () => {
    const x = make();
    expect(JSON.stringify(x)).not.toContain(SECRET);
    expect(inspect(x)).not.toContain(SECRET);
    expect(String(x)).not.toContain(SECRET);
    expect(`${x}`).not.toContain(SECRET);
  });

  it("never leaks credentials in a thrown error message", async () => {
    const x = make();
    const err = await x.submit(manifest).catch((e: unknown) => e);
    expect(String(err)).not.toContain(SECRET);
  });
});
