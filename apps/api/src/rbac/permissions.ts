/**
 * Permission matrix (role × action) — PRD §7 ("every mutation checks permission") and the
 * BF-14 requirement.
 *
 * Actions mirror the PRD §7 "proposed API surfaces" mutations plus workspace membership
 * management. The matrix maps each action to the set of PRD §2 roles allowed to perform it.
 * A reusable guard (`can`) is the single choke point used by every protected mutation, so a
 * route can never forget to check, and the whole matrix is table-driven and unit-tested.
 */
import type { Role } from "./roles.js";

export const ACTIONS = [
  "workspace.manage_members",
  "goal.write",
  "host.confirm",
  "dataset.discover",
  "dataset.upload",
  "mapping.validate",
  "plan.create",
  "plan.review",
  "run.launch",
  "run.retry_cancel",
  "fallback.decide",
  "export.request",
  "chat.query",
] as const;
export type Action = (typeof ACTIONS)[number];

const ALL: readonly Role[] = ["scientist", "computational_biologist", "research_lead", "admin"];

/**
 * Allowed roles per action. `admin` appears everywhere (workspace administrators manage
 * access and configuration, PRD §2). The rest follow the PRD §2 responsibilities:
 *  - scientist: defines goals, confirms hosts, discovers/uploads data, queries chat.
 *  - computational biologist: reviews plans/mappings/params, launches & controls runs.
 *  - research lead: reviews plans, decides fallbacks, exports reports.
 */
export const PERMISSION_MATRIX: Record<Action, readonly Role[]> = {
  "workspace.manage_members": ["admin"],
  "goal.write": ["scientist", "research_lead", "admin"],
  "host.confirm": ["scientist", "research_lead", "admin"],
  "dataset.discover": ["scientist", "computational_biologist", "admin"],
  "dataset.upload": ["scientist", "computational_biologist", "admin"],
  "mapping.validate": ["computational_biologist", "admin"],
  "plan.create": ["computational_biologist", "admin"],
  "plan.review": ["computational_biologist", "research_lead", "admin"],
  "run.launch": ["computational_biologist", "admin"],
  "run.retry_cancel": ["computational_biologist", "admin"],
  "fallback.decide": ["computational_biologist", "research_lead", "admin"],
  "export.request": ["scientist", "research_lead", "admin"],
  "chat.query": ALL,
};

/** The reusable guard: is `role` permitted to perform `action`? */
export const can = (role: Role, action: Action): boolean =>
  PERMISSION_MATRIX[action].includes(role);
