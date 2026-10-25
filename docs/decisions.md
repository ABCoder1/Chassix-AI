# Chassix AI — Decision Log (ADRs)

Step 0 of the Implementation Guide. One ADR per open decision from PRD §12 / Implementation Guide D1–D10.

Status legend: **Accepted** (frozen for the pilot), **Proposed** (default chosen; revisable in a new draft before the dependent step lands), **Open** (needs an owner's sign-off before code depends on it).

> D1–D9 ratified 2026-10-24: all technical defaults approved and frozen for the pilot. D10 remains **Open** pending scientific-owner sign-off.

Cross-cutting architecture (from project architecture decision): a **TypeScript control plane** (web + API + orchestration + most services) plus a **single isolated Python service** for agentic/ML work and gene-ID harmonization; real bioinformatics compute runs as **containerized tools via Nextflow over bioconda**, invoked through executor adapters. No service imports another service's internals — `packages/shared` is the only seam.

---

## ADR-D1 — App framework

- **Status:** Accepted
- **Decision:** Vite + React + TypeScript SPA for `apps/web`; a separate TypeScript API service (`apps/api`) rather than a Next.js full-stack app.
- **Options considered:** Next.js (App Router) vs. Vite+React SPA + standalone API.
- **Rationale:** PRD §7 describes a display-only desktop web workspace; keeping `web` a pure SPA and `api` a separate service matches the guide's repo layout and the "services isolated behind shared contracts" rule, and avoids coupling rendering to the API runtime. Grounds: PRD §7.
- **Owner:** _unassigned_

## ADR-D2 — API + auth

- **Status:** Accepted (ratified 2026-10-24)
- **Decision:** Fastify (TypeScript) REST API; session via signed JWT (httpOnly cookie); per-request workspace context; workspace RBAC enforced on every mutation.
- **Options considered:** Fastify vs. NestJS vs. Express; JWT vs. server session store.
- **Rationale:** Fastify is light and fast for a hackathon while supporting schema validation (shares zod contracts). Machine-readable error envelope (code, message, retryability, correlationId) per PRD §7. Grounds: PRD §7, BF-14.
- **Owner:** _unassigned_

## ADR-D3 — Durable orchestrator

- **Status:** Accepted
- **Decision:** A single DB-backed state machine in `apps/orchestrator` (Postgres as the one source of job truth). **Not** Temporal for the pilot.
- **Options considered:** Temporal vs. DB-backed state machine.
- **Rationale:** PRD §7 demands avoiding two competing sources of job truth; a DB-backed machine keeps run/branch/attempt state auditable, idempotent, and restart-safe without operating a Temporal cluster during the hackathon. Grounds: PRD §7, §6 state machines.
- **Owner:** _unassigned_

## ADR-D4 — Scientific workflow engine

- **Status:** Accepted
- **Decision:** Nextflow on a single remote executor, tools pulled from bioconda as containers.
- **Options considered:** Nextflow / CWL / Snakemake.
- **Rationale:** Matches the project architecture decision (containerized tools via Nextflow); one engine per the guide. Grounds: PRD §7, D4.
- **Owner:** _unassigned_

## ADR-D5 — Relational DB + migrations

- **Status:** Accepted (ratified 2026-10-24)
- **Decision:** PostgreSQL + Drizzle ORM (TypeScript-native) with Drizzle Kit migrations.
- **Options considered:** Drizzle vs. Prisma.
- **Rationale:** Drizzle is TS-first, typed end-to-end, lightweight migrations; integrates with the shared-contracts approach. Postgres also serves FTS (D7). Grounds: PRD §7.
- **Owner:** _unassigned_

## ADR-D6 — Object storage + artifact URLs

- **Status:** Accepted (ratified 2026-10-24)
- **Decision:** S3-compatible storage (MinIO locally via docker-compose, S3 in deploy); short-lived signed URLs for artifact access.
- **Rationale:** PRD §8 requires short-lived signed URLs and encrypted storage; MinIO gives a local S3 for fixtures without cloud dependencies. Grounds: PRD §8.
- **Owner:** _unassigned_

## ADR-D7 — Full-text / index store

- **Status:** Accepted (ratified 2026-10-24)
- **Decision:** Postgres full-text search for literature/dataset metadata; optional vector index later, which must **not** replace exact accession lookup.
- **Options considered:** Postgres FTS vs. OpenSearch.
- **Rationale:** One datastore for the pilot; PRD §7 notes vector index is optional and must not replace exact accession lookup. Grounds: PRD §7.
- **Owner:** _unassigned_

## ADR-D8 — Event delivery

- **Status:** Accepted
- **Decision:** Server-Sent Events (SSE) carrying a monotonic sequence cursor; reconnect replays from the cursor; an authoritative run-snapshot endpoint backs refresh.
- **Rationale:** PRD §7 / BF-13 require gap-free ordered replay and reconnect without lost run state; SSE with a sequence cursor is the simplest fit. Grounds: PRD §7, BF-13.
- **Owner:** _unassigned_

## ADR-D9 — Search / LLM provider (planner, chat, harmonizer)

- **Status:** Accepted
- **Decision:** Anthropic Claude API as the intelligence engine (goal parsing → GoalVersion, RAG host discovery, versioned plans, artifact-grounded chat with citations). Apify Actor for literature/dataset discovery (scraping public multiomics metadata + PubMed abstracts). Both behind interfaces so tests run on fixtures without live keys.
- **Rationale:** Project architecture decision + CalHacks sponsor tracks (Anthropic primary, Apify Best Actor). Credentials server-side only, never printed. Grounds: PRD §7; see memory `credentials-behind-interfaces`, `calhacks-sponsor-tracks`.
- **Owner:** _unassigned_

## ADR-D10 — Exact scientific tools per branch

- **Status:** **Signed off by scientific lead — 2026-10-24** (see `docs/scientific-contracts.md`). Branch set, minimum-evidence policy, and benchmark approach confirmed; tool versions and rubric/compatibility weights approved as defaults and **tuned later against performance metrics**. Live tools still run behind the `FakeExecutor` until the Nextflow host (ADR-D4) is wired.
- **Analysis branch set (expanded to five):** genomics · transcriptomics/perturbation · pathways · **metabolomics** · **flux analysis (fluxomics) → yield predictions**.
- **Tools (defaults, revisable):** genomics — FastQC `0.12.x` + assembly/annotation QC (**novel microbes only**; bypass and reuse public data where already done); transcriptomics/perturbation — DESeq2; pathways — clusterProfiler; metabolomics — XCMS (+ MetaboAnalystR); flux — COBRApy (FBA / parsimonious FBA) for flux distribution + predicted yields (objective/constraints recorded in the manifest).
- **Policies:** minimum-evidence (≥1 validated branch + traceable input metadata) and the warn/block compatibility table — confirmed to proceed, tune later.
- **Owner:** scientific lead.

---

## Scientific contracts (Step 0) — status

- Pilot goal, supported host scope, branch I/O schemas (5 branches), minimum evidence policy, ranking rubric weights: **Signed off 2026-10-24** (`docs/scientific-contracts.md`); weights to be tuned against performance metrics.
- Fixture corpus (`packages/fixtures/`): **scaffolded**, labeled illustrative until the live engine lands.

## Exit criteria tracking (PRD §10 Phase 0)

- [x] Scientific owner signs off contracts (ADR-D10 + scientific contracts) — **done 2026-10-24**
- [x] Fixture corpus exists and is versioned — _skeleton; illustrative_
- [x] Decisions D1–D9 recorded; D10 explicitly deferred with owner

## Implementation notes & deferred reconciliations (Phase 1)

- **Design tokens** extended the PRD §9 palette with a restrained `danger` (red) and a `neutral`/slate tone, because Failed/Cancelled/Not-configured/Skipped need a signal distinct from caveat-amber. Mapping: success=mint, in-progress=blue, caveat=amber, failure=red, inactive=neutral; violet reserved for integration accents.
- **Membership role vocabulary (deferred):** `@chassix/db` `memberships.role` is `owner|admin|member|viewer`; the app (Step 1.4) speaks the PRD §2 roles (scientist, computational biologist, research lead, admin) via a lossless bijection in `apps/api/src/rbac/roles.ts`. Reconcile the db enum to the PRD vocabulary in a later `@chassix/db` change to drop the bijection.
- **Live DB apply (deferred):** migrations `0000` + `0001` (adds `users.password_hash`) are generated but not yet applied to a live Postgres. Before live sign-in: `pnpm dev:stack` then `pnpm db:migrate`. Tests use in-memory repositories and need no database.
- **Database direction (2026-10-24): Postgres system-of-record + SpaceTimeDB live-event layer.** ADR-D5 stays Postgres + Drizzle (Supabase is the managed-Postgres host option — real wire-compatible Postgres, zero app rewrite; it can also later cover Auth/Realtime/Storage, optionally replacing MinIO in ADR-D6). **SpaceTimeDB is NOT Postgres-compatible** (PGWire is simple-query only — no prepared statements, transactions, or Postgres roles — so Drizzle cannot use it) and is therefore not our relational store. Instead it is adopted **only for the real-time run-event layer** (its subscription model is a strong fit for the BF-13 live run stream), to claim its hackathon sponsor track without re-architecting. This revises **ADR-D8**: the authoritative append-only event log lives in Postgres; a pluggable `EventTransport` (seam in `@chassix/shared`) fans events out for live client sync — in-memory in tests, SpaceTimeDB for live, SSE retained as an alternative behind the same interface.
- **Planner (Step 1.6) model = Opus 4.8 @ medium effort:** `@chassix/planner` calls Claude behind a `Planner` interface (`claude-opus-4-8`, adaptive thinking, `effort: medium`; override via `ANTHROPIC_MODEL`), with a deterministic `FakePlanner` for tests/keyless dev. Opus 4.8 has narrower safety classifiers than the 5.x line and handles legitimate strain-engineering goals directly, so the request uses the plain (non-beta) Messages endpoint — no server-side refusal fallback needed (that was required only on Opus 5.5, whose `bio` classifier false-positived). Output is validated against the shared `GoalVersionDraft` schema; no `temperature` (rejected on current models). Verified with a live smoke test (gated on `ANTHROPIC_API_KEY`).
