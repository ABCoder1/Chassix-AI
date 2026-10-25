/**
 * Workspace scoping — the single choke point every workspace-scoped query goes through
 * (Implementation Guide Step 1.2 DoD: "cross-workspace access is impossible at the query
 * layer").
 *
 * How the guarantee holds:
 *  - A `WorkspaceScope` cannot be constructed without a branded `WorkspaceId` (compile
 *    time) AND a non-empty string is required (runtime guard in the constructor).
 *  - Every read/write built through the scope injects `eq(table.workspace_id, wsId)` via
 *    `predicate()`, and `insert()` stamps the row's `workspace_id`. Callers never write the
 *    predicate by hand, so they cannot forget it or target another workspace.
 */
import { and, eq, type InferInsertModel, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { WorkspaceId } from "@chassix/shared";
import type { Database } from "./client.js";

/** A table that is workspace-owned: it must expose a `workspaceId` column. */
export type WorkspaceScopedTable = PgTable & { workspaceId: PgColumn };

export class WorkspaceScopeError extends Error {
  override readonly name = "WorkspaceScopeError";
}

export class WorkspaceScope {
  readonly workspaceId: WorkspaceId;

  constructor(
    private readonly db: Database,
    workspaceId: WorkspaceId,
  ) {
    // Runtime guard: branded types are erased at runtime, so defend against empty ids.
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      throw new WorkspaceScopeError(
        "A WorkspaceScope cannot be built without a non-empty workspace id.",
      );
    }
    this.workspaceId = workspaceId;
  }

  /** The mandatory `workspace_id = $ws` predicate, optionally AND-ed with more conditions. */
  predicate(table: WorkspaceScopedTable, extra?: SQL): SQL {
    const base = eq(table.workspaceId, this.workspaceId);
    return extra ? (and(base, extra) as SQL) : base;
  }

  select<T extends WorkspaceScopedTable>(table: T, extra?: SQL) {
    return this.db.select().from(table).where(this.predicate(table, extra));
  }

  update<T extends WorkspaceScopedTable>(table: T, set: PgUpdateSetSource<T>, extra?: SQL) {
    return this.db.update(table).set(set).where(this.predicate(table, extra));
  }

  delete<T extends WorkspaceScopedTable>(table: T, extra?: SQL) {
    return this.db.delete(table).where(this.predicate(table, extra));
  }

  /** Insert, stamping the scope's `workspace_id` so a row can never land in another tenant. */
  insert<T extends WorkspaceScopedTable>(
    table: T,
    values: Omit<InferInsertModel<T>, "workspaceId">,
  ) {
    return this.db
      .insert(table)
      .values({ ...values, workspaceId: this.workspaceId } as InferInsertModel<T>);
  }
}

/** Convenience factory mirroring the constructor. */
export const forWorkspace = (db: Database, workspaceId: WorkspaceId): WorkspaceScope =>
  new WorkspaceScope(db, workspaceId);
