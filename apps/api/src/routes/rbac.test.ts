import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { ApiErrorSchema } from "@chassix/shared";
import {
  addMember,
  buildTestApp,
  createWorkspace,
  seedWorkspaceWithRoles,
  signUp,
} from "../testing/harness.js";
import type { Role } from "../rbac/roles.js";

let app: FastifyInstance;
let workspaceId: string;
let cookies: Record<Role, string>;

beforeAll(async () => {
  app = buildTestApp();
  const seeded = await seedWorkspaceWithRoles(app);
  workspaceId = seeded.workspaceId;
  cookies = seeded.cookies;
});

afterAll(async () => {
  await app.close();
});

const ALL_ROLES: Role[] = ["scientist", "computational_biologist", "research_lead", "admin"];

/** Representative guarded mutations and the roles the matrix allows. */
const ROUTES: Array<{ path: string; allowed: Role[] }> = [
  { path: "goals", allowed: ["scientist", "research_lead", "admin"] },
  { path: "plans", allowed: ["computational_biologist", "admin"] },
  { path: "runs", allowed: ["computational_biologist", "admin"] },
  { path: "exports", allowed: ["scientist", "research_lead", "admin"] },
];

describe("RBAC enforcement on protected mutations", () => {
  const cases = ROUTES.flatMap((r) =>
    ALL_ROLES.map((role) => ({ path: r.path, role, allowed: r.allowed.includes(role) })),
  );

  it.each(cases)(
    "POST /workspaces/:id/$path as $role → allowed=$allowed",
    async ({ path, role, allowed }) => {
      const res = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceId}/${path}`,
        headers: { cookie: cookies[role] },
        payload: {},
      });
      if (allowed) {
        expect(res.statusCode).toBe(202);
        expect(res.json().ok).toBe(true);
      } else {
        expect(res.statusCode).toBe(403);
        const body = res.json();
        expect(ApiErrorSchema.safeParse(body).success).toBe(true);
        expect(body.code).toBe("FORBIDDEN");
        expect(body.correlationId).toBeTruthy();
      }
    },
  );

  it("unauthenticated request to a protected mutation → 401 ApiError with correlationId", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/goals`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(body.correlationId).toBeTruthy();
  });

  it("member management is admin-only (non-admin roles → 403)", async () => {
    for (const role of ["scientist", "computational_biologist", "research_lead"] as Role[]) {
      const res = await app.inject({
        method: "POST",
        url: `/workspaces/${workspaceId}/members`,
        headers: { cookie: cookies[role] },
        payload: { userId: randomUUID(), role: "scientist" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe("FORBIDDEN");
    }
  });
});

describe("cross-workspace denial (PRD §11)", () => {
  it("a member of workspace A is denied a workspace B resource even with a valid id", async () => {
    // A different admin owns workspace B; the workspace A scientist is NOT a member of it.
    const outsider = await signUp(app, "owner-b@example.com");
    const workspaceB = await createWorkspace(app, outsider.cookie, "Lab B");

    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceB}/goals`,
      headers: { cookie: cookies.scientist },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.code).toBe("FORBIDDEN");
  });

  it("a guessed / non-existent workspace id is denied, not leaked as 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/workspaces/${randomUUID()}/goals`,
      headers: { cookie: cookies.scientist },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("FORBIDDEN");
  });

  it("an admin of A cannot manage members of B (no membership in B)", async () => {
    const outsider = await signUp(app, "owner-b2@example.com");
    const workspaceB = await createWorkspace(app, outsider.cookie, "Lab B2");
    const victim = await signUp(app, "victim@example.com");

    const status = await addMember(app, cookies.admin, workspaceB, victim.userId, "scientist");
    expect(status).toBe(403);
  });
});
