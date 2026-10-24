/**
 * Chassix domain data model (PRD §7 data entities, Implementation Guide Step 1.2).
 *
 * Multi-tenancy model:
 *  - `workspaces` is the tenant root; its own `id` IS the tenant key, so it carries no
 *    redundant `workspace_id`.
 *  - `users` are GLOBAL identities (a person may belong to several workspaces via
 *    `memberships`), so a user is not owned by one workspace — this is why `memberships`
 *    exists (PRD §7). Users therefore carry no `workspace_id`.
 *  - EVERY other (data-bearing) entity carries `workspace_id` and goes through the
 *    `WorkspaceScope` helper, which makes cross-workspace access impossible at the query
 *    layer (Step 1.2 DoD). See `scope.ts`.
 *
 * Every record carries `created_at` / `updated_at`; entities the PRD versions carry an
 * integer `version`. "Unknown stays unknown": open/uncomputed fields (e.g. ranking
 * scores, blocked on ADR-D10) are nullable with no fabricated default.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { ProjectFlow, BranchState, CriticDisposition, ConnectivityStatus } from "@chassix/shared";

/**
 * Postgres enums.
 *
 * The PRD §6 state machines (ProjectFlow, BranchState, CriticDisposition) and the
 * ConnectivityStatus overlay are the single source of truth in `@chassix/shared`. We
 * derive the pgEnum values FROM those const objects — never re-listing literals — so the
 * database enums can never silently drift from the contracts (`enums.test.ts` enforces
 * this). They are defined here (not a sibling file) so drizzle-kit, whose loader does not
 * resolve NodeNext `.js` extensions on cross-file imports, can read the schema; `enums.ts`
 * re-exports them for the public API.
 *
 * Enums that are plain bounded data (not §6 state machines) are declared locally so domain
 * columns are "never free strings" (Step 1.2 DoD).
 */
const valuesOf = <T extends string>(o: Record<string, T>): [T, ...T[]] => {
  const values = Object.values(o);
  if (values.length === 0) throw new Error("enum source has no values");
  return values as [T, ...T[]];
};

// --- PRD §6 state machines (derived from @chassix/shared — do not re-list literals) ---
export const projectFlowEnum = pgEnum("project_flow", valuesOf(ProjectFlow));
export const branchStateEnum = pgEnum("branch_state", valuesOf(BranchState));
export const criticDispositionEnum = pgEnum("critic_disposition", valuesOf(CriticDisposition));
export const connectivityStatusEnum = pgEnum("connectivity_status", valuesOf(ConnectivityStatus));

// --- Local bounded-data enums (not §6 state machines, but never free strings) ---
export const membershipRoleEnum = pgEnum("membership_role", ["owner", "admin", "member", "viewer"]);
/** EvidenceClaim.claim type — PRD §7 ("observed/inferred/hypothesis"). */
export const claimTypeEnum = pgEnum("claim_type", ["observed", "inferred", "hypothesis"]);
export const evidenceLinkTypeEnum = pgEnum("evidence_link_type", ["supporting", "contradicting"]);
export const workflowPlanStatusEnum = pgEnum("workflow_plan_status", [
  "draft",
  "in_review",
  "approved",
]);
/** Attempt execution lifecycle (an attempt is one execution of a branch). */
export const attemptStatusEnum = pgEnum("attempt_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
/** Fallback / missing-evidence consent decision (PRD §6 "Awaiting decision"). */
export const fallbackDecisionEnum = pgEnum("fallback_decision", ["proceed", "skip", "abort"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "system"]);
export const exportJobStatusEnum = pgEnum("export_job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

// --- shared column fragments (functions return fresh builders per table) ---
const pk = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const wsRef = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });
const stamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- tenancy roots -----------------------------------------------------------
export const workspaces = pgTable("workspaces", {
  id: pk(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...stamps(),
});

export const users = pgTable("users", {
  id: pk(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  ...stamps(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    workspaceId: wsRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("member"),
    ...stamps(),
  },
  (t) => ({ uqWsUser: unique("uq_membership_ws_user").on(t.workspaceId, t.userId) }),
);

// --- project + goal ----------------------------------------------------------
export const projects = pgTable("projects", {
  id: pk(),
  workspaceId: wsRef(),
  name: text("name").notNull(),
  /** PRD §6 project flow — typed enum, never a free string. */
  flowState: projectFlowEnum("flow_state").notNull().default("draft_goal"),
  currentGoalVersionId: uuid("current_goal_version_id"),
  createdBy: uuid("created_by").references(() => users.id),
  /** optimistic-concurrency version (PRD §7 "expected version" checks on mutations). */
  version: integer("version").notNull().default(1),
  ...stamps(),
});

export const goalVersions = pgTable(
  "goal_versions",
  {
    id: pk(),
    workspaceId: wsRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    goalText: text("goal_text").notNull(),
    parsedSchema: jsonb("parsed_schema"),
    createdBy: uuid("created_by").references(() => users.id),
    ...stamps(),
  },
  (t) => ({ uqProjectVersion: unique("uq_goal_project_version").on(t.projectId, t.version) }),
);

// --- host discovery + selection ---------------------------------------------
export const hostCandidates = pgTable("host_candidates", {
  id: pk(),
  workspaceId: wsRef(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  organism: text("organism").notNull(),
  taxonomy: text("taxonomy"),
  strain: text("strain"),
  rationale: text("rationale"),
  /** ranking score — null until the rubric is signed off (ADR-D10); never fabricated. */
  score: real("score"),
  ...stamps(),
});

export const citations = pgTable("citations", {
  id: pk(),
  workspaceId: wsRef(),
  hostCandidateId: uuid("host_candidate_id").references(() => hostCandidates.id, {
    onDelete: "cascade",
  }),
  source: text("source").notNull(),
  accession: text("accession"),
  title: text("title"),
  url: text("url"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  ...stamps(),
});

export const hostSelections = pgTable("host_selections", {
  id: pk(),
  workspaceId: wsRef(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  hostCandidateId: uuid("host_candidate_id")
    .notNull()
    .references(() => hostCandidates.id),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  rationale: text("rationale"),
  ...stamps(),
});

// --- datasets ----------------------------------------------------------------
export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: pk(),
    workspaceId: wsRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // PRD §7 required dataset metadata:
    accession: text("accession"),
    source: text("source"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    checksum: text("checksum"),
    licenseStatus: text("license_status"),
    taxonomy: text("taxonomy"),
    strain: text("strain"),
    reference: text("reference"),
    modality: text("modality"),
    condition: text("condition"),
    ...stamps(),
  },
  (t) => ({ uqDatasetVersion: unique("uq_dataset_project_version").on(t.projectId, t.version) }),
);

export const sampleMappings = pgTable("sample_mappings", {
  id: pk(),
  workspaceId: wsRef(),
  datasetVersionId: uuid("dataset_version_id")
    .notNull()
    .references(() => datasetVersions.id, { onDelete: "cascade" }),
  sampleId: text("sample_id").notNull(),
  condition: text("condition"),
  mapping: jsonb("mapping"),
  validated: boolean("validated").notNull().default(false),
  ...stamps(),
});

// --- plan / run / branch / attempt ------------------------------------------
export const workflowPlans = pgTable(
  "workflow_plans",
  {
    id: pk(),
    workspaceId: wsRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: workflowPlanStatusEnum("status").notNull().default("draft"),
    manifest: jsonb("manifest"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...stamps(),
  },
  (t) => ({ uqPlanVersion: unique("uq_plan_project_version").on(t.projectId, t.version) }),
);

export const runs = pgTable(
  "runs",
  {
    id: pk(),
    workspaceId: wsRef(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => workflowPlans.id),
    version: integer("version").notNull().default(1),
    /** idempotency key for "launch run with idempotency key" (PRD §7). */
    idempotencyKey: text("idempotency_key"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...stamps(),
  },
  (t) => ({ uqIdempotency: unique("uq_run_ws_idempotency").on(t.workspaceId, t.idempotencyKey) }),
);

export const branches = pgTable("branches", {
  id: pk(),
  workspaceId: wsRef(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** PRD §6 branch state — typed enum, never a free string. */
  state: branchStateEnum("state").notNull().default("not_configured"),
  /** overlay: a lost heartbeat is "connection uncertain", not scientific failure (§6). */
  connectivity: connectivityStatusEnum("connectivity").notNull().default("connected"),
  /** monotonic sequence/version — stale/duplicate events cannot move a branch backward. */
  sequence: integer("sequence").notNull().default(0),
  reason: text("reason"),
  ...stamps(),
});

export const attempts = pgTable("attempts", {
  id: pk(),
  workspaceId: wsRef(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  status: attemptStatusEnum("status").notNull().default("queued"),
  eventId: uuid("event_id"),
  sequence: integer("sequence").notNull().default(0),
  reason: text("reason"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ...stamps(),
});

// --- artifacts + evidence graph ---------------------------------------------
export const artifacts = pgTable("artifacts", {
  id: pk(),
  workspaceId: wsRef(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
  attemptId: uuid("attempt_id").references(() => attempts.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  checksum: text("checksum"),
  storageUri: text("storage_uri"),
  sizeBytes: integer("size_bytes"),
  available: boolean("available").notNull().default(false),
  ...stamps(),
});

export const evidenceClaims = pgTable("evidence_claims", {
  id: pk(),
  workspaceId: wsRef(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
  claimText: text("claim_text").notNull(),
  /** PRD §7 claim type — typed enum. */
  claimType: claimTypeEnum("claim_type").notNull(),
  limitations: text("limitations"),
  methodVersion: text("method_version"),
  ...stamps(),
});

export const evidenceLinks = pgTable("evidence_links", {
  id: pk(),
  workspaceId: wsRef(),
  claimId: uuid("claim_id")
    .notNull()
    .references(() => evidenceClaims.id, { onDelete: "cascade" }),
  linkType: evidenceLinkTypeEnum("link_type").notNull(),
  artifactId: uuid("artifact_id").references(() => artifacts.id),
  citationId: uuid("citation_id").references(() => citations.id),
  ...stamps(),
});

// --- harmonization + critic --------------------------------------------------
export const harmonizationVersions = pgTable(
  "harmonization_versions",
  {
    id: pk(),
    workspaceId: wsRef(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    methodVersion: text("method_version"),
    inputComplete: boolean("input_complete").notNull().default(false),
    output: jsonb("output"),
    ...stamps(),
  },
  (t) => ({
    uqHarmonizationVersion: unique("uq_harmonization_run_version").on(t.runId, t.version),
  }),
);

export const criticFindings = pgTable("critic_findings", {
  id: pk(),
  workspaceId: wsRef(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  harmonizationVersionId: uuid("harmonization_version_id").references(
    () => harmonizationVersions.id,
  ),
  /** PRD §6 critic disposition — typed enum. */
  disposition: criticDispositionEnum("disposition").notNull(),
  summary: text("summary"),
  details: jsonb("details"),
  methodVersion: text("method_version"),
  ...stamps(),
});

export const fallbackDecisions = pgTable("fallback_decisions", {
  id: pk(),
  workspaceId: wsRef(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
  decision: fallbackDecisionEnum("decision").notNull(),
  rationale: text("rationale"),
  decidedBy: uuid("decided_by").references(() => users.id),
  ...stamps(),
});

// --- chat / export / audit ---------------------------------------------------
export const chatMessages = pgTable("chat_messages", {
  id: pk(),
  workspaceId: wsRef(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  /** grounded-chat citations (BF-09): every material claim links to a source/artifact. */
  citations: jsonb("citations"),
  ...stamps(),
});

export const exportJobs = pgTable("export_jobs", {
  id: pk(),
  workspaceId: wsRef(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
  status: exportJobStatusEnum("status").notNull().default("pending"),
  format: text("format").notNull(),
  storageUri: text("storage_uri"),
  requestedBy: uuid("requested_by").references(() => users.id),
  ...stamps(),
});

export const auditEvents = pgTable("audit_events", {
  id: pk(),
  workspaceId: wsRef(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  correlationId: text("correlation_id"),
  payload: jsonb("payload"),
  ...stamps(),
});

/** Full schema object for the drizzle client factory and drizzle-kit. */
export const schema = {
  workspaces,
  users,
  memberships,
  projects,
  goalVersions,
  hostCandidates,
  citations,
  hostSelections,
  datasetVersions,
  sampleMappings,
  workflowPlans,
  runs,
  branches,
  attempts,
  artifacts,
  evidenceClaims,
  evidenceLinks,
  harmonizationVersions,
  criticFindings,
  fallbackDecisions,
  chatMessages,
  exportJobs,
  auditEvents,
};
export type Schema = typeof schema;
