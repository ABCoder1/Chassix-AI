import { describe, it, expect } from "vitest";
import { ACTIONS, PERMISSION_MATRIX, can, type Action } from "./permissions.js";
import { ROLES, type Role } from "./roles.js";

/**
 * Table-driven permission matrix: assert every (role, action) cell of `can` agrees with the
 * declared matrix, and spot-check a few key cells so the intended policy is pinned explicitly.
 */
describe("permission matrix (role × action)", () => {
  const cells: Array<{ role: Role; action: Action; allowed: boolean }> = [];
  for (const role of ROLES) {
    for (const action of ACTIONS) {
      cells.push({ role, action, allowed: PERMISSION_MATRIX[action].includes(role) });
    }
  }

  it.each(cells)("role=$role action=$action → allowed=$allowed", ({ role, action, allowed }) => {
    expect(can(role, action)).toBe(allowed);
  });

  it("admin may perform every action", () => {
    for (const action of ACTIONS) expect(can("admin", action)).toBe(true);
  });

  const expectations: Array<{ role: Role; action: Action; allowed: boolean }> = [
    { role: "scientist", action: "goal.write", allowed: true },
    { role: "scientist", action: "run.launch", allowed: false },
    { role: "scientist", action: "plan.create", allowed: false },
    { role: "computational_biologist", action: "run.launch", allowed: true },
    { role: "computational_biologist", action: "goal.write", allowed: false },
    { role: "research_lead", action: "export.request", allowed: true },
    { role: "research_lead", action: "run.launch", allowed: false },
    { role: "scientist", action: "workspace.manage_members", allowed: false },
    { role: "research_lead", action: "workspace.manage_members", allowed: false },
    { role: "computational_biologist", action: "chat.query", allowed: true },
  ];
  it.each(expectations)("policy: $role $action → $allowed", ({ role, action, allowed }) => {
    expect(can(role, action)).toBe(allowed);
  });
});
