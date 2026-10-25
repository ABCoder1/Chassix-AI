/**
 * Per-request authentication + workspace context (PRD §7 "request-level workspace context").
 *
 * Two reusable Fastify preHandlers, built over the repository ports and the session manager:
 *
 *  - `requireUser`: verifies the httpOnly session cookie and attaches the authenticated user
 *    to `req.authUser`. No session / invalid session → 401 with an actionable ApiError body.
 *
 *  - `requireWorkspace(action?)`: resolves the authenticated user's membership (and therefore
 *    role) in the `:workspaceId` named by the route and attaches `{ workspaceId, role }` to
 *    `req.workspace`. If the user has no membership in that workspace → 403 (this is what
 *    denies cross-workspace access even with a valid/guessed id: authorization is driven by
 *    the membership row, never by the id in the URL). When an `action` is given, the RBAC
 *    guard (`can`) must also permit the user's role or the request is denied with 403.
 *
 * Every error body is the shared `@chassix/shared` ApiError envelope: code, actionable
 * message, retryability, and the request's correlation id.
 */
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { apiError } from "@chassix/shared";
import type { Action } from "./rbac/permissions.js";
import { can } from "./rbac/permissions.js";
import type { Role } from "./rbac/roles.js";
import type { SessionManager } from "./auth/session.js";
import { SESSION_COOKIE } from "./auth/session.js";
import type { Repositories, UserRecord } from "./repositories/types.js";

export interface WorkspaceContext {
  workspaceId: string;
  role: Role;
}

// Fastify request augmentation — the resolved context attached per request.
declare module "fastify" {
  interface FastifyRequest {
    authUser?: UserRecord;
    workspace?: WorkspaceContext;
  }
}

const unauthorized = (req: FastifyRequest, reply: FastifyReply): FastifyReply =>
  reply.status(401).send(
    apiError("UNAUTHENTICATED", "Sign in to continue. No valid session was found.", {
      retryable: false,
      correlationId: req.id,
    }),
  );

const forbidden = (req: FastifyRequest, reply: FastifyReply, message: string): FastifyReply =>
  reply
    .status(403)
    .send(apiError("FORBIDDEN", message, { retryable: false, correlationId: req.id }));

export interface AuthDeps {
  repos: Repositories;
  sessions: SessionManager;
}

export interface AuthGuards {
  requireUser: preHandlerHookHandler;
  requireWorkspace: (action?: Action) => preHandlerHookHandler;
}

export const createAuthGuards = ({ repos, sessions }: AuthDeps): AuthGuards => {
  const requireUser: preHandlerHookHandler = async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return unauthorized(req, reply);
    let userId: string;
    try {
      userId = await sessions.verify(token);
    } catch {
      return unauthorized(req, reply);
    }
    const user = await repos.users.findById(userId);
    if (!user) return unauthorized(req, reply);
    req.authUser = user;
  };

  const requireWorkspace =
    (action?: Action): preHandlerHookHandler =>
    async (req, reply) => {
      // requireUser must run first; defend anyway so this guard is safe to use alone.
      if (!req.authUser) {
        const token = req.cookies?.[SESSION_COOKIE];
        if (!token) return unauthorized(req, reply);
        try {
          const userId = await sessions.verify(token);
          const user = await repos.users.findById(userId);
          if (!user) return unauthorized(req, reply);
          req.authUser = user;
        } catch {
          return unauthorized(req, reply);
        }
      }
      const workspaceId = (req.params as { workspaceId?: string }).workspaceId;
      if (!workspaceId) {
        return forbidden(req, reply, "This route requires a workspace context.");
      }
      const membership = await repos.memberships.find(workspaceId, req.authUser.id);
      if (!membership) {
        // Cross-workspace / non-member: denied regardless of whether the id is valid.
        return forbidden(
          req,
          reply,
          "You do not have access to this workspace, or it does not exist.",
        );
      }
      req.workspace = { workspaceId, role: membership.role };
      if (action && !can(membership.role, action)) {
        return forbidden(
          req,
          reply,
          `Your role (${membership.role}) is not permitted to perform "${action}".`,
        );
      }
    };

  return { requireUser, requireWorkspace };
};
