/**
 * Authentication routes: sign-up, sign-in, sign-out, and the current-user probe.
 *
 * Sessions are JWTs (HS256, `jose`) carried in an httpOnly, SameSite=Lax cookie set via
 * `@fastify/cookie`. Passwords are hashed with scrypt. Credentials are never logged and never
 * returned to the client; sign-in failures are intentionally generic so they do not reveal
 * whether an email exists.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { apiError } from "@chassix/shared";
import type { AuthGuards } from "../context.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { SessionManager } from "../auth/session.js";
import { SESSION_COOKIE } from "../auth/session.js";
import type { Repositories, UserRecord } from "../repositories/types.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().min(1).max(200).optional(),
});

const publicUser = (user: UserRecord) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
});

const setSessionCookie = (reply: FastifyReply, token: string, ttlSeconds: number): void => {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlSeconds,
  });
};

export interface AuthRouteDeps {
  repos: Repositories;
  sessions: SessionManager;
  guards: AuthGuards;
}

export const registerAuthRoutes = (
  app: FastifyInstance,
  { repos, sessions, guards }: AuthRouteDeps,
): void => {
  app.post("/auth/sign-up", async (req, reply) => {
    const parsed = signUpSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError(
          "VALIDATION",
          "A valid email and a password of at least 8 characters are required.",
          {
            retryable: false,
            correlationId: req.id,
          },
        ),
      );
    }
    const existing = await repos.users.findByEmail(parsed.data.email);
    if (existing) {
      return reply.status(409).send(
        apiError("EMAIL_TAKEN", "An account already exists for this email. Try signing in.", {
          retryable: false,
          correlationId: req.id,
        }),
      );
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await repos.users.create({
      email: parsed.data.email,
      passwordHash,
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
    });
    const token = await sessions.issue(user.id);
    setSessionCookie(reply, token, sessions.ttlSeconds);
    return reply.status(201).send({ user: publicUser(user) });
  });

  app.post("/auth/sign-in", async (req, reply) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("VALIDATION", "Provide your email and password.", {
          retryable: false,
          correlationId: req.id,
        }),
      );
    }
    const user = await repos.users.findByEmail(parsed.data.email);
    const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
    if (!user || !ok) {
      return reply.status(401).send(
        apiError("INVALID_CREDENTIALS", "Email or password is incorrect.", {
          retryable: true,
          correlationId: req.id,
        }),
      );
    }
    const token = await sessions.issue(user.id);
    setSessionCookie(reply, token, sessions.ttlSeconds);
    return reply.status(200).send({ user: publicUser(user) });
  });

  app.post("/auth/sign-out", async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.status(200).send({ ok: true });
  });

  app.get("/auth/me", { preHandler: guards.requireUser }, async (req, reply) => {
    // requireUser guarantees authUser is set.
    return reply.status(200).send({ user: publicUser(req.authUser!) });
  });
};
