/**
 * Drizzle-backed repository implementations — the only code that touches `@chassix/db`.
 *
 * Workspace, membership and audit persistence use the existing `workspaces`, `memberships`
 * and `audit_events` tables. Membership roles are stored through the PRD-role ⇄ db-enum
 * bijection in `rbac/roles.ts` (the db `membershipRoleEnum` predates the PRD §2 vocabulary
 * and must not be edited). Workspace-scoped access goes through `@chassix/db`'s `WorkspaceScope`
 * so a membership lookup can never read another tenant's rows.
 *
 * Note: `apps/api` cannot resolve `drizzle-orm` directly (it is a transitive dep isolated under
 * `packages/db`). We therefore filter via the relational query API's callback operators
 * (`where: (fields, { eq }) => ...`) and `WorkspaceScope`, never importing drizzle operators.
 *
 * Credentials: the `@chassix/db` `users.password_hash` column (added for Step 1.4) holds the
 * scrypt hash server-side; it is never returned to the client.
 */
import {
  type Database,
  WorkspaceScope,
  auditEvents,
  memberships,
  users,
  workspaces,
} from "@chassix/db";
import { asId } from "@chassix/shared";
import { DB_TO_ROLE, ROLE_TO_DB, type DbRole, type Role } from "../rbac/roles.js";
import type {
  AuditEventInput,
  AuditRepository,
  MembershipRecord,
  MembershipRepository,
  Repositories,
  UserRecord,
  UserRepository,
  WorkspaceRecord,
  WorkspaceRepository,
} from "./types.js";

const toWorkspaceScope = (db: Database, workspaceId: string): WorkspaceScope =>
  new WorkspaceScope(db, asId<"WorkspaceId">(workspaceId));

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db.query.users.findFirst({
      where: (u, { eq }) => eq(u.email, email.trim().toLowerCase()),
    });
    return row ? this.toRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, id) });
    return row ? this.toRecord(row) : null;
  }

  async create(input: {
    email: string;
    displayName?: string | null;
    passwordHash: string;
  }): Promise<UserRecord> {
    const values = {
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName ?? null,
      passwordHash: input.passwordHash,
    };
    const rows = await this.db.insert(users).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to create user.");
    return this.toRecord(row);
  }

  private toRecord(row: {
    id: string;
    email: string;
    displayName: string | null;
    passwordHash: string | null;
  }): UserRecord {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      passwordHash: row.passwordHash ?? "",
    };
  }
}

export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<WorkspaceRecord | null> {
    const row = await this.db.query.workspaces.findFirst({ where: (w, { eq }) => eq(w.id, id) });
    return row ? { id: row.id, name: row.name, slug: row.slug } : null;
  }

  async create(input: { name: string; slug: string }): Promise<WorkspaceRecord> {
    const rows = await this.db
      .insert(workspaces)
      .values({ name: input.name, slug: input.slug })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to create workspace.");
    return { id: row.id, name: row.name, slug: row.slug };
  }
}

export class DrizzleMembershipRepository implements MembershipRepository {
  constructor(private readonly db: Database) {}

  async find(workspaceId: string, userId: string): Promise<MembershipRecord | null> {
    // WorkspaceScope injects `workspace_id = $ws`, so this can never read another tenant.
    const rows = await toWorkspaceScope(this.db, workspaceId).select(memberships);
    const row = rows.find((r) => r.userId === userId);
    return row ? this.toRecord(row) : null;
  }

  async create(input: {
    workspaceId: string;
    userId: string;
    role: Role;
  }): Promise<MembershipRecord> {
    // Assign via a variable (not an object literal) so the generic `insert` signature does not
    // apply object-literal excess-property checking against its deferred `Omit<Infer…>` type.
    const values = { userId: input.userId, role: ROLE_TO_DB[input.role] };
    const rows = await toWorkspaceScope(this.db, input.workspaceId)
      .insert(memberships, values)
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to create membership.");
    return this.toRecord(row);
  }

  async listForUser(userId: string): Promise<MembershipRecord[]> {
    const rows = await this.db.query.memberships.findMany({
      where: (m, { eq }) => eq(m.userId, userId),
    });
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(row: {
    id: string;
    workspaceId: string;
    userId: string;
    role: string;
  }): MembershipRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      userId: row.userId,
      role: DB_TO_ROLE[row.role as DbRole],
    };
  }
}

export class DrizzleAuditRepository implements AuditRepository {
  constructor(private readonly db: Database) {}

  async record(input: AuditEventInput): Promise<void> {
    const values = {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      correlationId: input.correlationId,
    };
    await toWorkspaceScope(this.db, input.workspaceId).insert(auditEvents, values);
  }
}

/** Build a complete set of Drizzle-backed repositories for a live database. */
export const createDrizzleRepositories = (db: Database): Repositories => ({
  users: new DrizzleUserRepository(db),
  workspaces: new DrizzleWorkspaceRepository(db),
  memberships: new DrizzleMembershipRepository(db),
  audit: new DrizzleAuditRepository(db),
});
