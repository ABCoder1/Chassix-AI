/**
 * Repository interfaces (persistence behind small ports).
 *
 * Why: live credentials and the database live behind these interfaces (project rule), so the
 * Drizzle-backed implementation is the only thing that touches `@chassix/db`, and tests run
 * against the in-memory implementation with no Postgres. Routes and the auth/RBAC layer
 * depend only on these interfaces.
 */
import type { Role } from "../rbac/roles.js";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string | null;
  /** scrypt hash (`auth/password.ts` format). Never logged or returned to clients. */
  passwordHash: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
}

export interface MembershipRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
}

export interface AuditEventInput {
  workspaceId: string;
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  correlationId: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: {
    email: string;
    displayName?: string | null;
    passwordHash: string;
  }): Promise<UserRecord>;
}

export interface WorkspaceRepository {
  findById(id: string): Promise<WorkspaceRecord | null>;
  create(input: { name: string; slug: string }): Promise<WorkspaceRecord>;
}

export interface MembershipRepository {
  /** The per-request workspace-context lookup: a user's membership in one workspace, or null. */
  find(workspaceId: string, userId: string): Promise<MembershipRecord | null>;
  create(input: { workspaceId: string; userId: string; role: Role }): Promise<MembershipRecord>;
  listForUser(userId: string): Promise<MembershipRecord[]>;
}

export interface AuditRepository {
  record(input: AuditEventInput): Promise<void>;
}

export interface Repositories {
  users: UserRepository;
  workspaces: WorkspaceRepository;
  memberships: MembershipRepository;
  audit: AuditRepository;
}
