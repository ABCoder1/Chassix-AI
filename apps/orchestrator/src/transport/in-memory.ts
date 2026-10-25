/**
 * In-memory `EventTransport` (ADR-D8). The authoritative log lives in `EventLogRepository`;
 * a transport only FANS events out to live subscribers. This impl is used in tests and
 * single-process dev; the live SpaceTimeDB transport (or SSE) sits behind the same shared
 * seam. Delivery is at-least-once, so subscribers dedupe by `sequence`/`eventId` — see
 * `projectSnapshot` for an idempotent reducer.
 */
import type { EventTransport } from "@chassix/shared";
import type { BranchStatusEvent } from "@chassix/shared";

export type EventSubscriber = (event: BranchStatusEvent) => void;

export class InMemoryEventTransport implements EventTransport {
  /** Everything published, in publish order (may contain duplicates — delivery is at-least-once). */
  readonly published: BranchStatusEvent[] = [];
  private readonly subscribers = new Set<EventSubscriber>();

  subscribe(fn: EventSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  async publish(event: BranchStatusEvent): Promise<void> {
    this.published.push(event);
    for (const fn of this.subscribers) fn(event);
  }
}
