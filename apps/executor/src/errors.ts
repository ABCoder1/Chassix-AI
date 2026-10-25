/**
 * Executor adapter errors. Kept local to this package (we never edit `@chassix/shared`).
 * None of these ever carry credentials or raw engine payloads in their messages.
 */

/**
 * Thrown by an adapter whose real engine integration is deliberately deferred.
 * Per ADR-D10 (exact scientific tools per branch) the live executor is OPEN pending
 * scientific-owner sign-off, so the Nextflow adapter is a typed stub, not a stub that
 * silently fabricates results ("unknown stays unknown / no fabricated results").
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/** Thrown when a caller references an `executorRef` the adapter has never issued. */
export class UnknownExecutorRefError extends Error {
  constructor(executorRef: string) {
    super(`No executor job for ref: ${executorRef}`);
    this.name = "UnknownExecutorRefError";
  }
}

/** Thrown when cancel is attempted on a job that has already finished (succeeded/failed). */
export class CannotCancelError extends Error {
  constructor(executorRef: string) {
    super(`Cannot cancel a completed job: ${executorRef}`);
    this.name = "CannotCancelError";
  }
}
