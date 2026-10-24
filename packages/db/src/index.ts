/** @chassix/db — domain schema, enums, client factory, and the workspace-scoping helper. */
// `schema.js` exports the tables AND the domain pgEnums (see `enums.ts` for the rationale),
// so it covers the "re-export schema + enums" requirement without a duplicate star export.
export * from "./schema.js";
export * from "./client.js";
export * from "./scope.js";
