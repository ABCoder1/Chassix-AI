import { describe, it, expect } from "vitest";
import { FallbackAction } from "./fallback.js";
import { makeHarness, launchRequest } from "./testing/harness.js";

describe("orchestrator barrier + failure decision wiring (Step 4.3/4.4)", () => {
  it("reports the barrier as not-ready with the launched branch pending", async () => {
    const h = makeHarness();
    const { runId } = await h.orch.launch(
      launchRequest({ branches: [branch("flux"), branch("metabolomics")] }),
    );
    const barrier = await h.orch.barrier(runId);
    expect(barrier.ready).toBe(false);
    expect([...barrier.pending].sort()).toEqual(["flux", "metabolomics"]);
  });

  it("derives traceable input metadata from branch manifests (checksums present)", async () => {
    const h = makeHarness();
    const { runId } = await h.orch.launch(launchRequest({ branches: [branch("flux")] }));
    const decision = await h.orch.failureDecision(runId);
    // Freshly launched: no branch validated yet ⇒ proceed is not allowed, but inputs are traceable
    // (so the blocked reason is the evidence count, not the metadata).
    expect(decision.canProceed).toBe(false);
    expect(decision.proceedBlockedReason).toMatch(/validated/);
    expect(decision.proceedBlockedReason).not.toMatch(/input metadata/);
    expect(decision.availableActions).toContain(FallbackAction.CancelRun);
  });
});

function branch(name: string) {
  return {
    name,
    inputs: [{ datasetVersionId: "dsv_1", checksum: "sha256:abc" }],
    parameters: { threads: 4 },
    toolVersions: { cobrapy: "0.29.0" },
    referenceVersions: {},
    command: "run.sh",
  };
}
