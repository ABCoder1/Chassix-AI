/**
 * In-memory repository implementations for tests and local dev. No Postgres required, so the
 * auth/RBAC test suite is hermetic. Behaviour mirrors the Drizzle implementation: unique
 * email, unique slug, one membership per (workspace, user).
 */
import { randomUUID } from "node:crypto";
import type { Role } from "../rbac/roles.js";
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

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, UserRecord>();

  async findByEmail(email: string): Promise<UserRecord | null> {
    const target = normalizeEmail(email);
    for (const user of this.byId.values()) {
      if (user.email === target) return { ...user };
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.byId.get(id);
    return user ? { ...user } : null;
  }

  async create(input: {
    email: string;
    displayName?: string | null;
    passwordHash: string;
  }): Promise<UserRecord> {
    const email = normalizeEmail(input.email);
    if (await this.findByEmail(email)) {
      throw new Error(`A user already exists for ${email}.`);
    }
    const record: UserRecord = {
      id: randomUUID(),
      email,
      displayName: input.displayName ?? null,
      passwordHash: input.passwordHash,
    };
    this.byId.set(record.id, record);
    return { ...record };
  }
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly byId = new Map<string, WorkspaceRecord>();

  async findById(id: string): Promise<WorkspaceRecord | null> {
    const ws = this.byId.get(id);
    return ws ? { ...ws } : null;
  }

  async create(input: { name: string; slug: string }): Promise<WorkspaceRecord> {
    for (const ws of this.byId.values()) {
      if (ws.slug === input.slug) throw new Error(`Workspace slug "${input.slug}" is taken.`);
    }
    const record: WorkspaceRecord = { id: randomUUID(), name: input.name, slug: input.slug };
    this.byId.set(record.id, record);
    return { ...record };
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly byId = new Map<string, MembershipRecord>();

  async find(workspaceId: string, userId: string): Promise<MembershipRecord | null> {
    for (const m of this.byId.values()) {
      if (m.workspaceId === workspaceId && m.userId === userId) return { ...m };
    }
    return null;
  }

  async create(input: {
    workspaceId: string;
    userId: string;
    role: Role;
  }): Promise<MembershipRecord> {
    if (await this.find(input.workspaceId, input.userId)) {
      throw new Error("User is already a member of this workspace.");
    }
    const record: MembershipRecord = { id: randomUUID(), ...input };
    this.byId.set(record.id, record);
    return { ...record };
  }

  async listForUser(userId: string): Promise<MembershipRecord[]> {
    const out: MembershipRecord[] = [];
    for (const m of this.byId.values()) {
      if (m.userId === userId) out.push({ ...m });
    }
    return out;
  }
}

export class InMemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventInput[] = [];
  async record(input: AuditEventInput): Promise<void> {
    this.events.push({ ...input });
  }
}

/** Build a complete set of in-memory repositories (used by the test suite). */
export const createInMemoryRepositories = (): Repositories => ({
  users: new InMemoryUserRepository(),
  workspaces: new InMemoryWorkspaceRepository(),
  memberships: new InMemoryMembershipRepository(),
  audit: new InMemoryAuditRepository(),
});
