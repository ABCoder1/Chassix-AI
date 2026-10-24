import { describe, it, expect } from "vitest";
import { freezeManifest, hashManifest, isManifestFrozen, verifyManifestHash } from "./manifest.js";
import type { FreezeManifestInput } from "./manifest.js";

const base: FreezeManifestInput = {
  runId: "run_1",
  branchId: "branch_1",
  branch: "genomics",
  inputs: [{ datasetVersionId: "dsv_1", checksum: "sha256:abc" }],
  parameters: { threads: 4, mode: "paired" },
  toolVersions: { fastqc: "0.12.1" },
  referenceVersions: { genome: "GRCh38" },
  command: "nextflow run main.nf",
  createdAt: "2026-10-24T00:00:00.000Z",
};

describe("freezeManifest (Step 3.2)", () => {
  it("is write-once: the frozen manifest and its nested objects cannot be mutated", () => {
    const manifest = freezeManifest(base);
    expect(isManifestFrozen(manifest)).toBe(true);
    expect(() => {
      // Intentionally attempting an illegal mutation of a frozen manifest.
      manifest.command = "rm -rf /";
    }).toThrow();
    expect(() => {
      // Nested mutation must also fail.
      manifest.parameters.threads = 999;
    }).toThrow();
    expect(manifest.command).toBe("nextflow run main.nf");
  });

  it("hashes stably regardless of key order (canonical serialization)", () => {
    const reordered: FreezeManifestInput = {
      createdAt: base.createdAt,
      command: base.command,
      referenceVersions: base.referenceVersions,
      toolVersions: base.toolVersions,
      parameters: { mode: "paired", threads: 4 },
      inputs: base.inputs,
      branch: base.branch,
      branchId: base.branchId,
      runId: base.runId,
    };
    expect(hashManifest(base)).toBe(hashManifest(reordered));
    expect(verifyManifestHash(freezeManifest(base))).toBe(true);
  });

  it("a revision produces a NEW manifest with a different hash (no in-place edit)", () => {
    const original = freezeManifest(base);
    const revised = freezeManifest({ ...base, parameters: { threads: 8, mode: "paired" } });
    expect(revised.manifestHash).not.toBe(original.manifestHash);
    // original is untouched
    expect(original.parameters.threads).toBe(4);
    expect(verifyManifestHash(revised)).toBe(true);
  });
});
