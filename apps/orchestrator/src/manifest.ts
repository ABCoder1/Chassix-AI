/**
 * Step 3.2 — immutable, write-once frozen manifest (BF-05, PRD §D).
 *
 * `Start analyses` snapshots everything needed to reproduce a run into a `RunManifest`
 * (shared schema) and stamps a content hash computed with `node:crypto` over a CANONICAL
 * serialization (recursively key-sorted), so the hash is stable regardless of key order.
 * Once frozen the object is deeply `Object.freeze`-d: it cannot be mutated. A revision does
 * not edit a launched manifest — it calls `freezeManifest` again, which yields a NEW manifest
 * with a NEW hash (the caller makes a new run/branch draft from it).
 */
import { createHash } from "node:crypto";
import type { RunManifest } from "@chassix/shared";

/** Everything a manifest needs except the derived `manifestHash`. */
export type FreezeManifestInput = Omit<RunManifest, "manifestHash">;

/** Recursively key-sorted JSON so the hash never depends on property insertion order. */
export const canonicalize = (value: unknown): string => {
  const encode = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(encode);
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, val] of entries) out[k] = encode(val);
    return out;
  };
  return JSON.stringify(encode(value));
};

/** Content hash of a manifest body (excluding the hash field itself). */
export const hashManifest = (input: FreezeManifestInput): string =>
  `sha256:${createHash("sha256").update(canonicalize(input)).digest("hex")}`;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
};

/**
 * Produce the write-once manifest: compute its content hash, then DEEP-FREEZE it. Any later
 * mutation throws in strict mode (all ESM modules are strict), which is how "immutable after
 * launch" is enforced at runtime (Step 3.2 DoD).
 */
export const freezeManifest = (input: FreezeManifestInput): RunManifest => {
  const manifestHash = hashManifest(input);
  return deepFreeze({ ...input, manifestHash }) as RunManifest;
};

/** True iff a manifest has been frozen (write-once) — used by assertions/tests. */
export const isManifestFrozen = (manifest: RunManifest): boolean =>
  Object.isFrozen(manifest) &&
  Object.isFrozen(manifest.parameters) &&
  Object.isFrozen(manifest.inputs);

/** Verify a manifest's stored hash matches its content (reproducibility check). */
export const verifyManifestHash = (manifest: RunManifest): boolean => {
  const { manifestHash: _omit, ...body } = manifest;
  return hashManifest(body as FreezeManifestInput) === manifest.manifestHash;
};
