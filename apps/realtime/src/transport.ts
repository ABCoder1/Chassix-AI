import type { BranchStatusEvent, EventTransport } from "@chassix/shared";
import type { RunEventPublisher } from "./types.js";

/**
 * A shared `EventTransport` (from `@chassix/shared`) backed by the SpaceTimeDB live layer. The
 * orchestrator publishes each `BranchStatusEvent` here after writing it to the authoritative
 * Postgres log; this forwards it to SpaceTimeDB (via a `RunEventPublisher`) for live client sync.
 * Swap `InMemoryEventTransport` for this in the orchestrator wiring once a host is configured.
 */
export class SpaceTimeDBEventTransport implements EventTransport {
  constructor(private readonly publisher: RunEventPublisher) {}

  async publish(event: BranchStatusEvent): Promise<void> {
    await this.publisher.publish(event);
  }
}
