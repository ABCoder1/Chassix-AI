/**
 * Branded identifier types. A plain string is never accepted where a typed ID is
 * expected, so a workspaceId cannot be passed where a runId is required.
 * These are compile-time only; at runtime they are strings.
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type UserId = Brand<string, "UserId">;
export type ProjectId = Brand<string, "ProjectId">;
export type GoalVersionId = Brand<string, "GoalVersionId">;
export type RunId = Brand<string, "RunId">;
export type BranchId = Brand<string, "BranchId">;
export type AttemptId = Brand<string, "AttemptId">;
export type EventId = Brand<string, "EventId">;
export type ArtifactId = Brand<string, "ArtifactId">;

/** Tag an existing string as a typed ID. Validation lives at the trust boundary (zod), not here. */
export const asId = <B extends string>(value: string): Brand<string, B> =>
  value as Brand<string, B>;
