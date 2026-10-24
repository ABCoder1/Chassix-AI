# BioForge AI — Decision Log (ADRs)

Step 0 of the Implementation Guide. One ADR per open decision from PRD §12 / Implementation Guide D1–D10.

Status legend: **Accepted** (frozen for the pilot), **Proposed** (default chosen; revisable in a new draft before the dependent step lands), **Open** (needs an owner's sign-off before code depends on it).

Cross-cutting architecture (from project architecture decision): a **TypeScript control plane** (web + API + orchestration + most services) plus a **single isolated Python service** for agentic/ML work and gene-ID harmonization; real bioinformatics compute runs as **containerized tools via Nextflow over bioconda**, invoked through executor adapters. No service imports another service's internals — `packages/shared` is the only seam.

---

## ADR-D1 — App framework

- **Status:** Accepted
- **Decision:** Vite + React + TypeScript SPA for `apps/web`; a separate TypeScript API service (`apps/api`) rather than a Next.js full-stack app.
- **Options considered:** Next.js (App Router) vs. Vite+React SPA + standalone API.
- **Rationale:** PRD §7 describes a display-only desktop web workspace; keeping `web` a pure SPA and `api` a separate service matches the guide's repo layout and the "services isolated behind shared contracts" rule, and avoids coupling rendering to the API runtime. Grounds: PRD §7.
- **Owner:** _unassigned_

## ADR-D2 — API + auth

- **Status:** Proposed
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

- **Status:** Proposed
- **Decision:** PostgreSQL + Drizzle ORM (TypeScript-native) with Drizzle Kit migrations.
- **Options considered:** Drizzle vs. Prisma.
- **Rationale:** Drizzle is TS-first, typed end-to-end, lightweight migrations; integrates with the shared-contracts approach. Postgres also serves FTS (D7). Grounds: PRD §7.
- **Owner:** _unassigned_

## ADR-D6 — Object storage + artifact URLs

- **Status:** Proposed
- **Decision:** S3-compatible storage (MinIO locally via docker-compose, S3 in deploy); short-lived signed URLs for artifact access.
- **Rationale:** PRD §8 requires short-lived signed URLs and encrypted storage; MinIO gives a local S3 for fixtures without cloud dependencies. Grounds: PRD §8.
- **Owner:** _unassigned_

## ADR-D7 — Full-text / index store

- **Status:** Proposed
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

- **Status:** **Open — needs scientific-owner sign-off**
- **Candidates (from project notes, not yet signed off):** genomics (FASTQC, assembly/annotation QC); transcriptomics/perturbation (DESeq2 for differential expression); pathways (clusterProfiler for enrichment).
- **Required before code depends on this:** scientific owner confirms the exact tool list, versions, input/output schemas per branch, minimum evidence policy, and ranking rubric weights (Step 0 scientific contracts); benchmark expectations recorded.
- **Rationale for deferring:** the guide requires pipeline/scientific owner sign-off; fabricating a tool contract would violate the "unknown stays unknown / no fabricated results" rule. Fixtures are labeled _illustrative_ until real tools land.
- **Owner:** _scientific lead — SIGN-OFF REQUIRED_

---

## Scientific contracts (Step 0) — status

- Pilot goal, supported host scope, branch I/O schemas, minimum evidence policy, ranking rubric weights: **Open** (bundled with ADR-D10 sign-off).
- Fixture corpus (`packages/fixtures/`): **scaffolded**, labeled illustrative until real tools and scientific sign-off land.

## Exit criteria tracking (PRD §10 Phase 0)

- [ ] Scientific owner signs off contracts (ADR-D10 + scientific contracts) — **blocked on owner**
- [x] Fixture corpus exists and is versioned — _skeleton; illustrative_
- [x] Decisions D1–D9 recorded; D10 explicitly deferred with owner
