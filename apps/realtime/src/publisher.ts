import type { BranchStatusEvent } from "@chassix/shared";
import type { RunEventConnection, RunEventPublisher } from "./types.js";

/**
 * Publishes run events by calling the SpaceTimeDB `publish_run_event` reducer on a live
 * connection. The event is sent as a JSON string (the reducer parses + inserts the row); this
 * matches the single-argument reducer in `module/run_events.ts` and avoids coupling to generated
 * argument types. Writes go only through reducers (SpaceTimeDB clients cannot write tables directly).
 */
export function connectionPublisher(conn: RunEventConnection): RunEventPublisher {
  return {
    async publish(event: BranchStatusEvent): Promise<void> {
      conn.reducers.publishRunEvent(JSON.stringify(event));
    },
  };
}

/** In-memory publisher for tests / keyless dev — records events, no network. */
export class InMemoryRunEventPublisher implements RunEventPublisher {
  readonly published: BranchStatusEvent[] = [];
  async publish(event: BranchStatusEvent): Promise<void> {
    this.published.push(event);
  }
}
