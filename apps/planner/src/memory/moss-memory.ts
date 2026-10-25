import { MossClient } from "@moss-js/moss";

/**
 * Agentic memory for Chassix, backed by Moss (semantic retrieval layer).
 *
 * The agentic steps (goal interpretation, host discovery, results reasoning, run outcomes) write
 * their state here as memory records; later steps can recall semantically-related prior state. Moss
 * stores the text + metadata and serves fast similarity search over it, so "memory" is just an index
 * of agent-state documents we add to and query.
 *
 * Credentials come from the environment (MOSS_PROJECT_ID / MOSS_PROJECT_KEY) via the factory; they
 * are never passed from the client or logged. Memory is BEST-EFFORT: every call is wrapped so a Moss
 * outage or a cold index never breaks an agent flow. When the keys are absent the factory returns a
 * no-op store, so the app runs keyless and tests need no Moss account.
 */
export interface AgentMemoryRecord {
  /** Stable id; re-using an id upserts (so re-running a step overwrites, not duplicates). */
  readonly id: string;
  /** The text that is embedded and later matched against a recall query. */
  readonly text: string;
  /** Small string-keyed metadata (kind, runId, organism, timestamp, …). */
  readonly metadata?: Record<string, string>;
}

export interface AgentMemoryHit {
  readonly id: string;
  readonly text: string;
  readonly score: number;
  readonly metadata?: Record<string, string>;
}

export interface AgentMemoryStore {
  /** True when backed by a live Moss project (false for the no-op store). */
  readonly live: boolean;
  /** Persist one agent-state record (best-effort; never throws). */
  remember(record: AgentMemoryRecord): Promise<void>;
  /** Recall the most semantically-related prior records (best-effort; [] on any failure). */
  recall(query: string, options?: { topK?: number; minScore?: number }): Promise<AgentMemoryHit[]>;
}

const INDEX_NAME = process.env.MOSS_MEMORY_INDEX ?? "chassix-agent-memory";

/** No-op store used when Moss is not configured, so agent flows run unchanged keyless. */
export class NullMemoryStore implements AgentMemoryStore {
  readonly live = false;
  async remember(): Promise<void> {}
  async recall(): Promise<AgentMemoryHit[]> {
    return [];
  }
}

export class MossMemoryStore implements AgentMemoryStore {
  readonly live = true;
  readonly #client: MossClient;
  readonly #indexName: string;
  /** One-shot "the index exists" guarantee, shared across concurrent calls. */
  #ensured: Promise<void> | null = null;

  constructor(projectId: string, projectKey: string, indexName: string = INDEX_NAME) {
    if (!projectId || !projectKey) {
      throw new Error("MossMemoryStore requires MOSS_PROJECT_ID and MOSS_PROJECT_KEY.");
    }
    this.#client = new MossClient(projectId, projectKey);
    this.#indexName = indexName;
  }

  /** Create the index on first use (idempotent; the seed record, if given, becomes its first doc). */
  #ensureIndex(seed?: AgentMemoryRecord): Promise<void> {
    if (!this.#ensured) {
      this.#ensured = (async () => {
        const indexes = await this.#client.listIndexes().catch(() => []);
        if (!indexes.some((i) => i.name === this.#indexName)) {
          await this.#client.createIndex(this.#indexName, [
            seed ?? {
              id: "chassix-memory-seed",
              text: "Chassix agent memory initialized.",
              metadata: { kind: "seed" },
            },
          ]);
        }
      })().catch((err) => {
        // Let a later call retry rather than caching the failure forever.
        this.#ensured = null;
        throw err;
      });
    }
    return this.#ensured;
  }

  async remember(record: AgentMemoryRecord): Promise<void> {
    try {
      await this.#ensureIndex(record);
      await this.#client.addDocs(this.#indexName, [record], { upsert: true });
    } catch (err) {
      console.error("[moss] remember failed (ignored):", err instanceof Error ? err.message : err);
    }
  }

  async recall(
    query: string,
    options: { topK?: number; minScore?: number } = {},
  ): Promise<AgentMemoryHit[]> {
    try {
      await this.#ensureIndex();
      await this.#client.loadIndex(this.#indexName);
      const result = await this.#client.query(this.#indexName, query, {
        topK: options.topK ?? 5,
        ...(options.minScore != null ? { minScore: options.minScore } : {}),
      });
      return result.docs
        .filter((d) => d.metadata?.kind !== "seed")
        .map((d) => ({
          id: d.id,
          text: d.text,
          score: d.score,
          ...(d.metadata ? { metadata: d.metadata } : {}),
        }));
    } catch (err) {
      console.error("[moss] recall failed (ignored):", err instanceof Error ? err.message : err);
      return [];
    }
  }
}

/**
 * Live Moss-backed memory when MOSS_PROJECT_ID + MOSS_PROJECT_KEY are set, else a no-op store so the
 * app runs keyless (same pattern as createPlanner / createReasoner).
 */
export function createAgentMemoryStore(): AgentMemoryStore {
  const projectId = process.env.MOSS_PROJECT_ID;
  const projectKey = process.env.MOSS_PROJECT_KEY;
  if (projectId && projectKey) return new MossMemoryStore(projectId, projectKey);
  return new NullMemoryStore();
}
