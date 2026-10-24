import { createHash } from "node:crypto";

/** sha256 hex digest of a byte buffer or string (PRD §C upload checksums; node:crypto). */
export const sha256 = (data: Uint8Array | string): string =>
  createHash("sha256").update(data).digest("hex");

export interface ChecksumResult {
  readonly ok: boolean;
  readonly expected: string;
  readonly actual: string;
}

/** Verify computed sha256 against a declared one (case-insensitive hex compare). */
export const verifyChecksum = (data: Uint8Array, expected: string): ChecksumResult => {
  const actual = sha256(data);
  return { ok: actual.toLowerCase() === expected.toLowerCase(), expected, actual };
};
