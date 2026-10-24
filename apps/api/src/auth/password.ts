/**
 * Password hashing with node:crypto `scrypt` (no new dependencies).
 *
 * Format: `scrypt$<saltHex>$<hashHex>`. A random 16-byte salt per password; verification is
 * constant-time (`timingSafeEqual`). Plaintext passwords are never logged or stored.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
};
