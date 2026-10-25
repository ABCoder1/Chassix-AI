/**
 * @chassix/orchestrator — the durable run orchestrator (Steps 3.2–3.6).
 *
 * A single DB-backed state machine that is the ONE source of job truth (ADR-D3, PRD §7):
 * frozen manifests (3.2), idempotent launch + run/branch/attempt state (3.3), append-only
 * event log with reconnect replay (3.4), the artifact-validation gate (3.5), and audited
 * cancel/retry (3.6). Persistence, the workflow engine, the live event transport, and the
 * artifact validator are all injected ports.
 */

// Domain types + repository/validator PORTS
export * from "./types.js";

// Step 3.2 — frozen manifest
export * from "./manifest.js";

// Step 3.5 — artifact-validation gate
export * from "./validation.js";

// Step 4.3 — integration barrier (BF-07)
export * from "./barrier.js";

// Step 4.4 — failure decision + minimum-evidence policy (BF-08)
export * from "./fallback.js";

// Core orchestrator (3.3/3.4/3.6)
export * from "./orchestrator.js";

// Ports — implementations
export * from "./repository/in-memory.js";
export * from "./repository/drizzle.js";
export * from "./transport/in-memory.js";

// Test support (inline fake executor — ExecutorAdapter impl)
export * from "./testing/fake-executor.js";
