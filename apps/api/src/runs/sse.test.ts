import { describe, it, expect } from "vitest";
import { BranchState } from "@chassix/shared";
import type { BranchStatusEvent } from "@chassix/shared";
import type { AttemptRecord } from "@chassix/orchestrator";
import {
  asRunId,
  asBranchId,
  asAttemptId,
  asWorkspaceId,
  AttemptStatus,
} from "@chassix/orchestrator";
import {
  serializeSseEvent,
  serializeReplay,
  parseCursor,
  projectBranchLogs,
  SSE_EVENT_NAME,
} from "./sse.js";
import { createRunOrchestrator } from "./service.js";

const ev = (
  sequence: number,
  state: BranchState,
  branchId = "b1",
  attemptId = "a1",
): BranchStatusEvent => ({
  runId: "r1",
  branchId,
  attemptId,
  eventId: `e${sequence}`,
  sequence,
  timestamp: "2026-10-24T00:00:00.000Z",
  state,
  reason: "",
});

describe("SSE serialization (Step 3.4)", () => {
  it("emits an SSE frame whose id: equals the event sequence", () => {
    const frame = serializeSseEvent(ev(7, BranchState.Running));
    expect(frame).toContain("id: 7\n");
    expect(frame).toContain(`event: ${SSE_EVENT_NAME}\n`);
    expect(frame.endsWith("\n\n")).toBe(true);
    const dataLine = frame.split("\n").find((l) => l.startsWith("data: "))!;
    expect(JSON.parse(dataLine.slice(6)).sequence).toBe(7);
  });

  it("serializes a replay batch ordered and gap-free with ascending ids", () => {
    const out = serializeReplay([
      ev(3, BranchState.Running),
      ev(1, BranchState.Queued),
      ev(2, BranchState.Running),
    ]);
    const ids = [...out.matchAll(/id: (\d+)/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([1, 2, 3]);
  });
});

describe("parseCursor (reconnect)", () => {
  it("prefers Last-Event-ID, falls back to ?cursor=, defaults to 0", () => {
    expect(parseCursor("5", undefined)).toBe(5);
    expect(parseCursor(["9", "x"], undefined)).toBe(9);
    expect(parseCursor(undefined, "4")).toBe(4);
    expect(parseCursor(undefined, undefined)).toBe(0);
    expect(parseCursor("not-a-number", undefined)).toBe(0);
    expect(parseCursor("-3", undefined)).toBe(0);
  });
});

describe("projectBranchLogs (Step 3.6)", () => {
  const attempt = (id: string, n: number, status: AttemptStatus): AttemptRecord => ({
    id: asAttemptId(id),
    runId: asRunId("r1"),
    branchId: asBranchId("b1"),
    workspaceId: asWorkspaceId("w1"),
    attemptNumber: n,
    status,
    reason: null,
    executorRef: null,
    startedAt: null,
    finishedAt: null,
  });

  it("joins attempts with their events, ordered by attempt then sequence", () => {
    const attempts = [
      attempt("a2", 2, AttemptStatus.Running),
      attempt("a1", 1, AttemptStatus.Failed),
    ];
    const events = [
      ev(1, BranchState.Queued, "b1", "a1"),
      ev(2, BranchState.Running, "b1", "a2"),
      ev(3, BranchState.Running, "other", "aX"),
    ];
    const logs = projectBranchLogs(attempts, events, "b1");
    expect(logs.map((l) => l.attemptNumber)).toEqual([1, 2]);
    expect(logs[0]!.events.map((e) => e.sequence)).toEqual([1]);
    expect(logs[1]!.events.map((e) => e.sequence)).toEqual([2]);
  });
});

describe("replay-from-cursor over real orchestrator events (Step 3.4)", () => {
  it("is gap-free and ordered, and a cursor skips already-seen events", async () => {
    const bundle = createRunOrchestrator();
    const { runId } = await bundle.orchestrator.launch({
      workspaceId: "w1",
      projectId: "p1",
      planId: "plan1",
      idempotencyKey: "k-replay",
      branches: [
        {
          name: "assembly",
          inputs: [],
          parameters: {},
          toolVersions: {},
          referenceVersions: {},
          command: "run",
        },
      ],
    });
    const all = await bundle.orchestrator.replayFrom(runId, 0);
    const ids = all.map((e) => e.sequence);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    // Contiguous from 1 (gap-free).
    expect(ids).toEqual(ids.map((_, i) => i + 1));
    // Cursor after seq 1 skips it.
    const fromCursor = await bundle.orchestrator.replayFrom(runId, 1);
    expect(fromCursor.every((e) => e.sequence > 1)).toBe(true);
  });
});
