import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { asId, type WorkspaceId } from "@chassix/shared";
import { createDbClient } from "./client.js";
import { WorkspaceScope, WorkspaceScopeError, forWorkspace } from "./scope.js";
import { projects } from "./schema.js";

// Lazy pg Pool — never connects, so we only build & inspect SQL (no live Postgres).
const { db } = createDbClient("postgresql://chassix:chassix@localhost:5432/chassix_test");
const ws = (id: string): WorkspaceId => asId<"WorkspaceId">(id);

describe("WorkspaceScope (Step 1.2 — cross-workspace access impossible at query layer)", () => {
  it("ALWAYS injects the workspace_id predicate into a built query", () => {
    const scope = new WorkspaceScope(db, ws("ws_alpha"));
    const { sql, params } = scope.select(projects).toSQL();
    expect(sql).toContain('"workspace_id"');
    expect(sql).toMatch(/"workspace_id"\s*=/);
    expect(params).toContain("ws_alpha");
  });

  it("binds different workspace ids to different params (no cross-tenant leakage)", () => {
    const a = forWorkspace(db, ws("ws_alpha")).select(projects).toSQL();
    const b = forWorkspace(db, ws("ws_beta")).select(projects).toSQL();
    expect(a.params).toContain("ws_alpha");
    expect(b.params).toContain("ws_beta");
    expect(a.params).not.toEqual(b.params);
  });

  it("AND-composes extra conditions while keeping the workspace predicate", () => {
    const scope = new WorkspaceScope(db, ws("ws_alpha"));
    const { sql, params } = scope.select(projects, eq(projects.name, "demo")).toSQL();
    expect(sql).toMatch(/"workspace_id"\s*=/);
    expect(sql.toLowerCase()).toContain(" and ");
    expect(params).toContain("ws_alpha");
    expect(params).toContain("demo");
  });

  it("scopes update and delete with the workspace predicate too", () => {
    const scope = new WorkspaceScope(db, ws("ws_alpha"));
    const upd = scope.update(projects, { name: "renamed" }).toSQL();
    const del = scope.delete(projects).toSQL();
    expect(upd.sql).toMatch(/"workspace_id"\s*=/);
    expect(upd.params).toContain("ws_alpha");
    expect(del.sql).toMatch(/"workspace_id"\s*=/);
    expect(del.params).toContain("ws_alpha");
  });

  it("stamps workspace_id on inserts", () => {
    const scope = new WorkspaceScope(db, ws("ws_alpha"));
    const { params } = scope.insert(projects, { name: "demo" }).toSQL();
    expect(params).toContain("ws_alpha");
  });

  it("cannot be constructed without a workspace id (runtime guard)", () => {
    expect(() => new WorkspaceScope(db, ws(""))).toThrow(WorkspaceScopeError);
    // @ts-expect-error — a WorkspaceScope requires a WorkspaceId; it cannot be omitted.
    expect(() => new WorkspaceScope(db)).toThrow();
    // @ts-expect-error — a raw string is not a branded WorkspaceId.
    expect(() => new WorkspaceScope(db, "not-branded")).not.toThrow();
  });
});
