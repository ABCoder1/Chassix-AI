/**
 * Public re-export of the domain pgEnums.
 *
 * The enums themselves are DEFINED in `schema.ts` (derived from the `@chassix/shared` §6
 * state machines — the single source of truth) because drizzle-kit's schema loader does not
 * resolve NodeNext `.js` extensions on cross-file relative imports. This module gives the
 * enums a stable import path for the public API and tests.
 */
export {
  projectFlowEnum,
  branchStateEnum,
  criticDispositionEnum,
  connectivityStatusEnum,
  membershipRoleEnum,
  claimTypeEnum,
  evidenceLinkTypeEnum,
  workflowPlanStatusEnum,
  attemptStatusEnum,
  fallbackDecisionEnum,
  chatRoleEnum,
  exportJobStatusEnum,
} from "./schema.js";
