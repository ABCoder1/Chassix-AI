import { describe, it, expect } from "vitest";
import { ExecutorStatus } from "@chassix/shared";
import type { RunManifest } from "@chassix/shared";
import { FakeExecutor, FakeScenario } from "./fake-executor.js";
import { CannotCancelError, UnknownExecutorRefError } from "./errors.js";

const manifest = (over: Partial<RunManifest> = {}): RunManifest => ({
  runId: "run-1",
  branchId: "branch-genomics",
  branch: "genomics",
  inputs: [{ datasetVersionId: "dsv-1", checksum: "sha256:abc" }],
  parameters: {},
  toolVersions: { nextflow: "24.04.0" },
  referenceVersions: { ASM18260v1: "1" },
  command: "nextflow run main.nf",
  createdAt: "2026-10-24T00:00:00.000Z",
  manifestHash: "sha256:deadbeef",
  ...over,
});

const drain = async (x: FakeExecutor, ref: string, n: number): Promise<ExecutorStatus[]> => {
  const out: ExecutorStatus[] = [];
  for (let i = 0; i < n; i++) {
    out.push((await x.poll(ref)).status);
  }
  return out;
};

describe("FakeExecutor happy path", () => {
  it("submit returns an opaque ref carrying no secrets", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    expect(executorRef).toBeTruthy();
    expect(executorRef).toContain("branch-genomics");
  });

  it("poll progresses queued → running → succeeded deterministically", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    expect(await drain(x, executorRef, 3)).toEqual([
      ExecutorStatus.Queued,
      ExecutorStatus.Running,
      ExecutorStatus.Succeeded,
    ]);
  });

  it("is stable/monotonic once terminal — extra polls stay succeeded", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    await drain(x, executorRef, 3);
    expect((await x.poll(executorRef)).status).toBe(ExecutorStatus.Succeeded);
    expect((await x.poll(executorRef)).status).toBe(ExecutorStatus.Succeeded);
  });

  it("reports progress as null (stage-based status only, never fabricated %)", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    const poll = await x.poll(executorRef);
    expect(poll.progress).toBeNull();
    expect(poll.reason).toBeTruthy();
  });

  it("isolates separate jobs by ref", async () => {
    const x = new FakeExecutor();
    const a = (await x.submit(manifest({ branchId: "a" }))).executorRef;
    const b = (await x.submit(manifest({ branchId: "b" }))).executorRef;
    expect(a).not.toBe(b);
    await x.poll(a); // advance only a
    expect((await x.poll(b)).status).toBe(ExecutorStatus.Queued);
  });
});

describe("FakeExecutor forced scenarios", () => {
  it("forced failure surfaces ExecutorStatus.Failed", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    x.program(executorRef, FakeScenario.ForcedFailure);
    expect(await drain(x, executorRef, 3)).toEqual([
      ExecutorStatus.Queued,
      ExecutorStatus.Running,
      ExecutorStatus.Failed,
    ]);
  });

  it("forced cancellation surfaces ExecutorStatus.Cancelled via the script", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    x.program(executorRef, FakeScenario.ForcedCancellation);
    expect(await drain(x, executorRef, 3)).toEqual([
      ExecutorStatus.Queued,
      ExecutorStatus.Running,
      ExecutorStatus.Cancelled,
    ]);
  });

  it("can be constructed with an alternate default scenario", async () => {
    const x = new FakeExecutor({ defaultScenario: FakeScenario.ForcedFailure });
    const { executorRef } = await x.submit(manifest());
    expect(await drain(x, executorRef, 3)).toEqual([
      ExecutorStatus.Queued,
      ExecutorStatus.Running,
      ExecutorStatus.Failed,
    ]);
  });
});

describe("FakeExecutor heartbeat loss", () => {
  it("yields ExecutorStatus.Unknown and stays stuck there", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    x.program(executorRef, FakeScenario.HeartbeatLoss);
    expect(await drain(x, executorRef, 4)).toEqual([
      ExecutorStatus.Queued,
      ExecutorStatus.Running,
      ExecutorStatus.Unknown,
      ExecutorStatus.Unknown,
    ]);
  });
});

describe("FakeExecutor cancel", () => {
  it("transitions a running job to cancelled", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    await x.poll(executorRef); // queued
    expect((await x.poll(executorRef)).status).toBe(ExecutorStatus.Running);
    await x.cancel(executorRef);
    expect((await x.poll(executorRef)).status).toBe(ExecutorStatus.Cancelled);
  });

  it("is reachable from a queued job", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    await x.cancel(executorRef);
    expect((await x.poll(executorRef)).status).toBe(ExecutorStatus.Cancelled);
  });

  it("is idempotent", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    await x.cancel(executorRef);
    await expect(x.cancel(executorRef)).resolves.toBeUndefined();
  });

  it("refuses to cancel a job that already succeeded", async () => {
    const x = new FakeExecutor();
    const { executorRef } = await x.submit(manifest());
    await drain(x, executorRef, 3); // reach succeeded
    await expect(x.cancel(executorRef)).rejects.toBeInstanceOf(CannotCancelError);
  });
});

describe("FakeExecutor unknown ref", () => {
  it("throws on poll of an unissued ref", async () => {
    const x = new FakeExecutor();
    await expect(x.poll("nope")).rejects.toBeInstanceOf(UnknownExecutorRefError);
  });

  it("throws on cancel of an unissued ref", async () => {
    const x = new FakeExecutor();
    await expect(x.cancel("nope")).rejects.toBeInstanceOf(UnknownExecutorRefError);
  });
});
