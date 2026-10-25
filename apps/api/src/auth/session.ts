/**
 * JWT session management with `jose` (HS256). The signed token travels in an httpOnly,
 * SameSite=Lax cookie (set via `@fastify/cookie`), so it is never readable by client JS and
 * the secret stays server-side only (PRD §8: server-side secrets, no secrets in logs).
 *
 * The signing key is derived with SHA-256 from the configured secret so any configured
 * `JWT_SECRET` string yields a valid 32-byte HS256 key.
 */
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "chassix_session";
const ALG = "HS256";
/** 8 hours. */
export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

export class SessionError extends Error {
  override readonly name = "SessionError";
}

const deriveKey = (secret: string): Uint8Array =>
  new Uint8Array(createHash("sha256").update(secret).digest());

export interface SessionManager {
  readonly ttlSeconds: number;
  issue(userId: string): Promise<string>;
  verify(token: string): Promise<string>;
}

export const createSessionManager = (
  secret: string,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS,
): SessionManager => {
  const key = deriveKey(secret);
  return {
    ttlSeconds,
    async issue(userId: string): Promise<string> {
      return new SignJWT({})
        .setProtectedHeader({ alg: ALG })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key);
    },
    async verify(token: string): Promise<string> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
        if (typeof payload.sub !== "string" || payload.sub.length === 0) {
          throw new SessionError("Session token has no subject.");
        }
        return payload.sub;
      } catch (err) {
        if (err instanceof SessionError) throw err;
        throw new SessionError("Session token is invalid or expired.");
      }
    },
  };
};
