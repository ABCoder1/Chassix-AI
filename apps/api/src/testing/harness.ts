/**
 * Test harness helpers (not a test file). Build an app with in-memory repositories and a fixed
 * session secret, then drive the auth/workspace flows through `app.inject` — no Postgres.
 */
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { createInMemoryRepositories } from "../repositories/memory.js";
import { SESSION_COOKIE } from "../auth/session.js";
import type { Role } from "../rbac/roles.js";

const TEST_SECRET = "test-secret-chassix-abc123-abc123-abc123";

export const buildTestApp = (): FastifyInstance =>
  buildServer({ repos: createInMemoryRepositories(), sessionSecret: TEST_SECRET });

interface InjectLike {
  cookies: Array<{ name: string; value: string }>;
}

export const sessionCookie = (res: InjectLike): string => {
  const c = res.cookies.find((x) => x.name === SESSION_COOKIE);
  if (!c) throw new Error("no session cookie on response");
  return `${SESSION_COOKIE}=${c.value}`;
};

export const signUp = async (
  app: FastifyInstance,
  email: string,
  password = "password123",
): Promise<{ cookie: string; userId: string }> => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/sign-up",
    payload: { email, password },
  });
  if (res.statusCode !== 201) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  return { cookie: sessionCookie(res as unknown as InjectLike), userId: res.json().user.id };
};

export const createWorkspace = async (
  app: FastifyInstance,
  cookie: string,
  name = "Lab A",
): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/workspaces",
    headers: { cookie },
    payload: { name },
  });
  if (res.statusCode !== 201)
    throw new Error(`create workspace failed: ${res.statusCode} ${res.body}`);
  return res.json().workspace.id;
};

export const addMember = async (
  app: FastifyInstance,
  adminCookie: string,
  workspaceId: string,
  userId: string,
  role: Role,
): Promise<number> => {
  const res = await app.inject({
    method: "POST",
    url: `/workspaces/${workspaceId}/members`,
    headers: { cookie: adminCookie },
    payload: { userId, role },
  });
  return res.statusCode;
};

/**
 * Build a workspace owned by an admin, plus one signed-in user per PRD role who is a member of
 * that workspace with that role. Returns the workspace id and a cookie per role.
 */
export const seedWorkspaceWithRoles = async (
  app: FastifyInstance,
): Promise<{ workspaceId: string; adminCookie: string; cookies: Record<Role, string> }> => {
  const admin = await signUp(app, "admin@example.com");
  const workspaceId = await createWorkspace(app, admin.cookie);

  const roles: Role[] = ["scientist", "computational_biologist", "research_lead"];
  const cookies: Record<Role, string> = {
    admin: admin.cookie,
    scientist: "",
    computational_biologist: "",
    research_lead: "",
  };
  for (const role of roles) {
    const u = await signUp(app, `${role}@example.com`);
    const status = await addMember(app, admin.cookie, workspaceId, u.userId, role);
    if (status !== 201) throw new Error(`addMember(${role}) failed: ${status}`);
    cookies[role] = u.cookie;
  }
  return { workspaceId, adminCookie: admin.cookie, cookies };
};
