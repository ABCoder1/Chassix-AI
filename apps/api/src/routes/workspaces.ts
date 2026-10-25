/**
 * Workspace routes: creation, membership management, and the representative per-workspace
 * mutations whose permission is enforced by the RBAC guard.
 *
 * Workspace creation makes the creator an `admin` of the new workspace. Membership management
 * is admin-only (`workspace.manage_members`). The domain mutations below are intentionally
 * thin for Step 1.4 — their persistence lands in later steps — but each is wrapped in the real
 * `requireWorkspace(action)` guard so the permission matrix and cross-workspace denial are
 * enforced and testable end to end. Every mutation records an audit event (cross-cutting rule).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { apiError } from "@chassix/shared";
import type { AuthGuards } from "../context.js";
import type { Action } from "../rbac/permissions.js";
import { ROLES, isRole } from "../rbac/roles.js";
import type { Repositories } from "../repositories/types.js";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `ws-${randomUUID().slice(0, 8)}`;

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(48).optional(),
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
});

/** Representative per-workspace mutations wired to their RBAC action (persistence: later steps). */
// NOTE: `runs` is intentionally absent — the real run-launch route (routes/runs.ts, Step 3.3)
// owns `POST /workspaces/:id/runs` and its own RBAC (`run.launch`) tests.
const DOMAIN_MUTATIONS: ReadonlyArray<{ path: string; action: Action }> = [
  { path: "goals", action: "goal.write" },
  { path: "plans", action: "plan.create" },
  { path: "exports", action: "export.request" },
];

export interface WorkspaceRouteDeps {
  repos: Repositories;
  guards: AuthGuards;
}

export const registerWorkspaceRoutes = (
  app: FastifyInstance,
  { repos, guards }: WorkspaceRouteDeps,
): void => {
  // Create a workspace; the creator becomes its admin.
  app.post("/workspaces", { preHandler: guards.requireUser }, async (req, reply) => {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("VALIDATION", "A workspace name is required.", {
          retryable: false,
          correlationId: req.id,
        }),
      );
    }
    const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(parsed.data.name);
    const workspace = await repos.workspaces.create({ name: parsed.data.name, slug });
    const membership = await repos.memberships.create({
      workspaceId: workspace.id,
      userId: req.authUser!.id,
      role: "admin",
    });
    await repos.audit.record({
      workspaceId: workspace.id,
      actorUserId: req.authUser!.id,
      action: "workspace.create",
      targetType: "workspace",
      targetId: workspace.id,
      correlationId: req.id,
    });
    return reply.status(201).send({ workspace, role: membership.role });
  });

  // Add a member — admin only (workspace.manage_members).
  app.post(
    "/workspaces/:workspaceId/members",
    { preHandler: guards.requireWorkspace("workspace.manage_members") },
    async (req, reply) => {
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success || !isRole(parsed.data.role)) {
        return reply.status(400).send(
          apiError("VALIDATION", "A userId and a valid role are required.", {
            retryable: false,
            correlationId: req.id,
          }),
        );
      }
      const target = await repos.users.findById(parsed.data.userId);
      if (!target) {
        return reply.status(404).send(
          apiError("USER_NOT_FOUND", "No such user to add to this workspace.", {
            retryable: false,
            correlationId: req.id,
          }),
        );
      }
      const existing = await repos.memberships.find(req.workspace!.workspaceId, parsed.data.userId);
      if (existing) {
        return reply.status(409).send(
          apiError("ALREADY_MEMBER", "That user is already a member of this workspace.", {
            retryable: false,
            correlationId: req.id,
          }),
        );
      }
      const membership = await repos.memberships.create({
        workspaceId: req.workspace!.workspaceId,
        userId: parsed.data.userId,
        role: parsed.data.role,
      });
      await repos.audit.record({
        workspaceId: req.workspace!.workspaceId,
        actorUserId: req.authUser!.id,
        action: "workspace.add_member",
        targetType: "membership",
        targetId: membership.id,
        correlationId: req.id,
      });
      return reply.status(201).send({ membership });
    },
  );

  // Representative guarded mutations (one per RBAC action under test).
  for (const { path, action } of DOMAIN_MUTATIONS) {
    app.post(
      `/workspaces/:workspaceId/${path}`,
      { preHandler: guards.requireWorkspace(action) },
      async (req, reply) => {
        await repos.audit.record({
          workspaceId: req.workspace!.workspaceId,
          actorUserId: req.authUser!.id,
          action,
          correlationId: req.id,
        });
        return reply
          .status(202)
          .send({ ok: true, action, workspaceId: req.workspace!.workspaceId });
      },
    );
  }
};
