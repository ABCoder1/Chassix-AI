import { inspect } from "node:util";
import type {
  ExecutorAdapter,
  ExecutorPoll,
  ExecutorSubmission,
  RunManifest,
} from "@chassix/shared";
import { NotImplementedError } from "./errors.js";

/**
 * Scoped, server-side-only credentials/config for the live engine. Held by the adapter and
 * NEVER returned, logged, or serialized (see redaction below). This is the ONLY type in the
 * codebase that carries engine secrets.
 */
export interface NextflowCredentials {
  /** Least-privilege engine identity (PRD §8 "least-privilege executor identities"). */
  readonly identity: string;
  /** Short-lived token / key material. Server-side only. */
  readonly token: string;
}

export interface NextflowExecutorConfig {
  /** Remote engine endpoint. */
  readonly engineUrl: string;
  /** Scoped credentials — stay inside the adapter. */
  readonly credentials: NextflowCredentials;
  /** Executor id → environment mapping (resource tier, queue, etc.); no secrets. */
  readonly environment?: string;
}

const REDACTED = "[redacted]";

/**
 * Live Nextflow adapter (ADR-D4: Nextflow over bioconda, one remote executor).
 *
 * STUB — intentionally not implemented. This is the ONLY place that will ever talk to the
 * workflow engine; the orchestrator calls submit → poll → cancel and never addresses the
 * engine directly. The real integration is DEFERRED behind ADR-D10 (exact scientific tools /
 * I/O schemas are OPEN pending scientific-owner sign-off), so every method throws rather than
 * fabricating a run. Implement it here, and only here, once the live-executor sign-off lands.
 *
 * Credentials are stored in an ECMAScript-private field and additionally redacted from
 * `JSON.stringify`, `util.inspect`, and `String(...)`, so they can never leak into logs or
 * return values (PRD §8 / Step 3.1 DoD: server-side only, never in client or logs).
 */
export class NextflowExecutor implements ExecutorAdapter {
  readonly id: string;
  readonly engineUrl: string;
  readonly environment: string | null;
  readonly #credentials: NextflowCredentials;

  constructor(config: NextflowExecutorConfig) {
    this.id = "nextflow";
    this.engineUrl = config.engineUrl;
    this.environment = config.environment ?? null;
    this.#credentials = config.credentials;
  }

  async submit(_manifest: RunManifest): Promise<ExecutorSubmission> {
    throw this.#deferred("submit");
  }

  async poll(_executorRef: string): Promise<ExecutorPoll> {
    throw this.#deferred("poll");
  }

  async cancel(_executorRef: string): Promise<void> {
    throw this.#deferred("cancel");
  }

  #deferred(method: string): NotImplementedError {
    return new NotImplementedError(
      `NextflowExecutor.${method} is not implemented: the live engine is deferred pending ` +
        `ADR-D10 / live-executor scientific-owner sign-off. Use FakeExecutor for Phase 3.`,
    );
  }

  /** Redact secrets from JSON serialization (logs, event payloads, API responses). */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      engineUrl: this.engineUrl,
      environment: this.environment,
      // Reads the stored secret only to report presence — the value itself is never emitted.
      credentials: this.#credentials.token ? REDACTED : null,
    };
  }

  /** Redact secrets from `String(...)` / template interpolation. */
  toString(): string {
    return `NextflowExecutor(id=${this.id}, engineUrl=${this.engineUrl}, credentials=${REDACTED})`;
  }

  /** Redact secrets from `console.log` / `util.inspect`. */
  [inspect.custom](): string {
    return this.toString();
  }
}
