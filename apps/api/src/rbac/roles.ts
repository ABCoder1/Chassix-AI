/**
 * Workspace roles (PRD §2).
 *
 * The product defines four user roles: experimental scientists / strain engineers who
 * define goals and assess evidence; computational biologists who review plans, mappings and
 * parameters; research leads who compare hypotheses and export reports; and workspace
 * administrators who manage access and remote-execution config.
 *
 * NOTE / PRD-vs-schema deviation: `@chassix/db`'s `memberships.role` pgEnum predates the
 * PRD §2 role vocabulary and uses the generic collaboration labels
 * `owner | admin | member | viewer`. We are not allowed to edit `@chassix/db`, so the
 * Drizzle repository encodes the PRD roles onto that enum through the lossless bijection
 * below (`ROLE_TO_DB` / `DB_TO_ROLE`). The application layer only ever speaks PRD roles.
 */

export const ROLES = ["scientist", "computational_biologist", "research_lead", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);

/** A membership-role value as stored by `@chassix/db` (`membershipRoleEnum`). */
export type DbRole = "owner" | "admin" | "member" | "viewer";

/** Lossless bijection PRD role -> stored db enum value (see note above). */
export const ROLE_TO_DB: Record<Role, DbRole> = {
  admin: "admin",
  research_lead: "owner",
  computational_biologist: "member",
  scientist: "viewer",
};

/** Inverse bijection: stored db enum value -> PRD role. */
export const DB_TO_ROLE: Record<DbRole, Role> = {
  admin: "admin",
  owner: "research_lead",
  member: "computational_biologist",
  viewer: "scientist",
};
