import { describe, it, expect, vi } from "vitest";
import { BranchState } from "@chassix/shared";
import type { BranchStatusEvent } from "@chassix/shared";
import { SpaceTimeDBEventTransport } from "./transport.js";
import { InMemoryRunEventPublisher, connectionPublisher } from "./publisher.js";
import { subscribeToRunEvents } from "./subscribe.js";
import type { RunEventConnection, RunEventRow } from "./types.js";

const event = (overrides: Partial<BranchStatusEvent> = {}): BranchStatusEvent => ({
  runId: "run_1",
  branchId: "branch_1",
  attemptId: "attempt_1",
  eventId: "evt_1",
  sequence: 1,
  timestamp: "2026-10-24T00:00:00.000Z",
  state: BranchState.Running,
  reason: "started",
  ...overrides,
});

describe("SpaceTimeDBEventTransport", () => {
  it("forwards shared events to the publisher", async () => {
    const pub = new InMemoryRunEventPublisher();
    const transport = new SpaceTimeDBEventTransport(pub);
    await transport.publish(event());
    await transport.publish(event({ eventId: "evt_2", sequence: 2 }));
    expect(pub.published.map((e) => e.eventId)).toEqual(["evt_1", "evt_2"]);
  });
});

describe("connectionPublisher", () => {
  it("calls the publish_run_event reducer with the event as JSON", async () => {
    const publishRunEvent = vi.fn();
    const conn = { reducers: { publishRunEvent } } as unknown as RunEventConnection;
    await connectionPublisher(conn).publish(event());
    expect(publishRunEvent).toHaveBeenCalledOnce();
    expect(JSON.parse(publishRunEvent.mock.calls[0]![0] as string)).toMatchObject({
      runId: "run_1",
      eventId: "evt_1",
    });
  });
});

describe("subscribeToRunEvents", () => {
  it("subscribes to the run's rows and forwards matching inserts only", () => {
    let insertCb: ((ctx: unknown, row: RunEventRow) => void) | undefined;
    const subscribe = vi.fn();
    const conn: RunEventConnection = {
      reducers: { publishRunEvent: vi.fn() },
      db: { runEvent: { onInsert: (cb) => (insertCb = cb) } },
      subscriptionBuilder: () => ({ subscribe }),
      disconnect: vi.fn(),
    };
    const seen: string[] = [];
    subscribeToRunEvents(conn, "run_1", (row) => seen.push(row.eventId));

    const row = (runId: string, eventId: string): RunEventRow => ({
      runId,
      branchId: "b",
      attemptId: "a",
      eventId,
      sequence: 1,
      state: "running",
      reason: "",
      timestamp: "2026-10-24T00:00:00.000Z",
    });
    insertCb!(null, row("run_1", "keep"));
    insertCb!(null, row("run_2", "drop"));

    expect(seen).toEqual(["keep"]);
    expect(subscribe).toHaveBeenCalledWith("SELECT * FROM run_event WHERE run_id = 'run_1'");
  });
});
