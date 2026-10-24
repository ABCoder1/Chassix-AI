import { describe, it, expect, afterAll } from "vitest";
import { ApiErrorSchema } from "@chassix/shared";
import { buildTestApp, sessionCookie, signUp } from "../testing/harness.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSessionManager } from "./session.js";

const app = buildTestApp();
afterAll(async () => {
  await app.close();
});

describe("password hashing (scrypt)", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces a distinct hash per call (random salt)", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
});

describe("session manager (jose HS256)", () => {
  it("round-trips a user id and rejects a tampered token", async () => {
    const s = createSessionManager("a-sufficiently-long-test-secret-value");
    const token = await s.issue("user-123");
    expect(await s.verify(token)).toBe("user-123");
    await expect(s.verify(token + "x")).rejects.toThrow();
  });
});

describe("auth routes", () => {
  it("rejects an unauthenticated request to a protected route with 401 + ApiError", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(body.correlationId).toBeTruthy();
  });

  it("signs up and issues a session cookie usable on a protected route", async () => {
    const { cookie } = await signUp(app, "alice@example.com", "password123");
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe("alice@example.com");
  });

  it("fails sign-in with the wrong password (401), succeeds with the correct one (cookie)", async () => {
    await signUp(app, "bob@example.com", "password123");

    const wrong = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: "bob@example.com", password: "nope-wrong" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().code).toBe("INVALID_CREDENTIALS");

    const right = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: "bob@example.com", password: "password123" },
    });
    expect(right.statusCode).toBe(200);
    const cookie = sessionCookie(
      right as unknown as { cookies: Array<{ name: string; value: string }> },
    );
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe("bob@example.com");
  });

  it("does not leak whether an email exists (generic message on unknown email)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/sign-in",
      payload: { email: "ghost@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Email or password is incorrect.");
  });

  it("sign-out clears the session cookie", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/sign-out" });
    expect(res.statusCode).toBe(200);
    const cleared = res.cookies.find((c) => c.name === "chassix_session");
    expect(cleared?.value).toBe("");
  });
});
