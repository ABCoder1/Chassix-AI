/**
 * @chassix/datasets — dataset metadata discovery (Step 2.4), private upload & validation
 * (Step 2.5), and compatibility checks (Step 2.6). Pure, testable TS: no live network, no
 * DB. All fixture data is illustrative (ADR-D10).
 */

// Shared types
export * from "./types.js";

// Step 2.4 — metadata discovery
export * from "./metadata/repository-adapter.js";
export * from "./metadata/fixture-adapter.js";
export * from "./metadata/metadata-cache.js";
export * from "./metadata/dataset-service.js";

// Step 2.5 — upload & validation
export * from "./upload/checksum.js";
export * from "./upload/format-inspector.js";
export * from "./upload/upload-service.js";

// Step 2.6 — compatibility checks
export * from "./compat/policy.js";
export * from "./compat/checks.js";
export * from "./compat/compat-service.js";
