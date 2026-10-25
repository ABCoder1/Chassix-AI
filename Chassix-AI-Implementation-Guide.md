# Chassix AI — Step-by-Step Implementation Guide

Version 1.0 · follows Chassix-AI-PRD.md v1.0 and Chassix-AI-Design-Guide.md v1.0
Status: implementation plan. Architecture and phases are **proposals** (see PRD §7) — Step 0 validates them.

## How an agent uses this guide

1. Read this guide's **Step 0** and commit the chosen stack to the decision log before writing app code.
2. Pick **one step** (e.g. "Step 1.3"). Each step is self-contained: it names its goal, what to build, and a Definition of Done (DoD) with concrete acceptance checks.
3. Work in a branch (`feature/chassix-step-X-Y` — or `step-X-Y` when a single agent owns the whole phase).
4. Implement, then run the step's DoD checks (unit/integration tests plus the manual scenarios listed under "Verify"). Add tests as you go — DoD is not met without them.
5. Mark the step done in the **progress tracker** table below and commit. Do not start the next step while the current one's DoD is unmet.
6. Keep the PRD as behavioral truth. If the PRD and this guide conflict, the PRD wins — raise the conflict instead of improvising.

Sources of truth:
- **Behavior + acceptance criteria:** `Chassix-AI-PRD.md` (cited below as PRD §n or BF-xx)
- **Visuals + flows:** `Chassix-AI-Design-Guide.md` and the editable Figma file (screens 1–12, desktop 1440×1000)
- **This guide:** the ordered execution plan. It does not add requirements.

---

## Step 0 — Technical spike and contract validation (PRD §10 Phase 0)

**Goal:** make the open decisions in PRD §12 and freeze one authoritative stack. Nothing in Steps 1–5 depends on a specific vendor; several choices affect data model and API shapes, so decide first.

**Decisions to record in `docs/decisions.md` (one ADR per row: decision, options considered, chosen, rationale, owner):**

| # | Decision | Options to spike | Grounds |
|---|---|---|---|
| D1 | App framework | Next.js / Vite+React SPA | PRD §7 "desktop web workspace"; display-only browser |
| D2 | API + auth | Same-language API service, JWT/session, workspace RBAC | PRD §7, BF-14 |
| D3 | Durable orchestrator | Temporal vs. one DB-backed state machine (choose **one**) | PRD §7: "avoid two competing sources of job truth" |
| D4 | Scientific workflow engine | Nextflow / CWL / Snakemake on one remote executor | PRD §7, one engine |
| D5 | Relational DB + migrations | Postgres + e.g. Drizzle/Prisma | PRD §7 |
| D6 | Object storage + artifact URLs | S3-compatible + short-lived signed URLs | PRD §8 |
| D7 | Full-text/index store | Postgres FTS or OpenSearch | PRD §7: vector index optional, must not replace exact accession lookup |
| D8 | Event delivery | SSE with sequence cursor (or equivalent) | PRD §7 |
| D9 | Search/LLM provider for planner, chat, harmonizer | vendors to evaluate | PRD §7 "contextual assistant" |
| D10 | Exact scientific tools per branch | genomics, transcriptomics/perturbation, pathways, metabolomics, flux analysis (fluxomics → yield predictions) | PRD §3, §D, §E — **signed off 2026-10-24** (`docs/scientific-contracts.md`) |

**Also in Step 0 (scientific contracts):**
- Pilot goal, supported host scope, branch input/output schemas, minimum evidence policy, ranking rubric weights.
- Build the **fixture corpus**: `fixtures/` with known citations, incompatible inputs, missing modalities, contradictory evidence, and at least one reference run. Everything in §11 of the PRD must be reproducible from fixtures.
- Get scientific owner sign-off on contracts and benchmark expectations.

**Exit criteria (PRD §10 Phase 0):** scientific owner signs off contracts; fixture corpus exists and is versioned; decisions D1–D10 recorded.

---

## Repo layout (build up as steps land)

```text
book/
  apps/
    web/            # design system, screens 1–12, canvas, dashboard, chat UI
    api/            # Project/API service: auth, RBAC, plans, runs, events
    planner/        # goal schema, retrieval, ranking
    datasets/       # repository adapters, upload validation, compatibility
    orchestrator/   # DAG, barrier, retries, decisions
    executor/       # remote executor adapters (one engine per D4)
    harmonizer/     # alignment, evidence graph
    critic/         # independent review
    assistant/      # grounded chat
  packages/
    shared/         # contracts, schemas (zod or equivalent), event types, IDs
    ui/             # design-system components
    fixtures/       # fixture corpus + reference run
  infra/            # docker-compose, migrations, IaC
  docs/             # decisions.md, runbooks
```

Shared contracts (`packages/shared`) are the seam: all services import them; no service imports another service's internals.

---

## Phase 1 — Product shell and state persistence (PRD §10 Phase 1)

### Step 1.1 — Monorepo scaffold, tooling, CI

**Build:** repo layout above; TypeScript strict; lint/format/test runners; docker-compose (DB, storage, index); CI running tests on PR; env config with secrets server-side only.
**DoD:** `pnpm test` (or equivalent) green on empty app; CI passes; a fresh clone runs the dev stack with one command.
**Verify:** new contributor follows README runbook end-to-end.

### Step 1.2 — Domain data model + migrations

**Build:** PRD §7 data entities — Workspace, User, Membership, Project, GoalVersion, HostCandidate, Citation, HostSelection, DatasetVersion, SampleMapping, WorkflowPlan, Run, Branch, Attempt, Artifact, EvidenceClaim, EvidenceLink, HarmonizationVersion, CriticFinding, FallbackDecision, ChatMessage, ExportJob, AuditEvent. Every record carries `workspace_id`, version metadata, and `created_at/updated_at`. Encode the PRD §6 state machines as typed enums (Project flow, Branch state) — never strings.
**DoD:** migrations apply cleanly; state transitions are modeled; cross-workspace access is impossible at the query layer (workspace scoping helper used by every query, tested).
**Verify:** two workspaces with same IDs never see each other's rows.

### Step 1.3 — Design system (PRD §9 visual direction)

**Build:** tokens — deep navy surfaces, subtle dotted canvas, mint primary actions, blue analytical signals, amber caveats, violet integration accents; Inter typefaces (headings/labels/numeric); 8px spacing rhythm; 12–16px rounded panels; status badge set (Ready/Ready with caveats/Needs review, Running, Failed, Cancelled, Skipped, "Connection uncertain"). Components: buttons (Simple Design System implied by Figma), cards, modals (focus-trapped), tables, tabs, drawers, progress, tags, empty states.
**DoD:** components are token-driven (no hardcoded colors), keyboard operable, visible focus, text labels alongside status colors; a component gallery renders every state; WCAG-AA contrast checked.
**Verify:** Figma screen 1–9 components visually match the design file.

### Step 1.4 — Auth, workspaces, RBAC (BF-14)

**Build:** sign-in/out; workspace creation & membership; roles (scientist, computational biologist, research lead, admin per PRD §2); permission checks on every mutation; request-level workspace context.
**DoD:** permission matrix implemented + tested; unauthorized API call returns machine-readable error (PRD §7 API: code, actionable message, retryability, correlation ID); unauthenticated requests get 401 with actionable body.
**Verify:** cross-workspace artifact request denied even with guessed identifier (PRD §11 checklist).

### Step 1.5 — Welcome screen and goal composer (Screen 1, BF-01)

**Build:** brand/navigation; exact prompt "what do you want to build?"; supporting copy "Describe your end goal out of an experiment in plain language. We'll assemble the tools, parameters and workflow for you."; large composer; example goal; supported module cards (literature & host discovery, genomics, transcriptomics & perturbation, pathway analysis, metabolomics, flux analysis / yield prediction, evidence harmonization, scientific critic, results & AI chat); recent project entry; **Build my workflow** disabled while prompt is empty; optional "choose an example" flow.
**DoD:** empty prompt cannot submit; modules visible before submitting; example goal fills the composer; user can navigate to a recent project.
**Verify:** keyboard journey: tab through composer → modules → submit; focus visible.

### Step 1.6 — Goal interpretation and review (BF-01, PRD §A)

**Build:** planner service (D9) extracts organism constraints, desired phenotype, product context, analysis objectives, success measures into a schema-valid **GoalVersion**; renders as an editable goal summary with: proposed assumptions (visible & editable), targeted missing-critical-detail questions, "unknown" markers. Example input: "I want a more thermotolerant microbial host for producing an industrial enzyme with reduced cooling requirements." — must ask for or mark unknown the target operating range and production constraints; **must not fabricate them**.
**DoD:** draft GoalVersion persisted (new Project created); original prompt stored and accessible; revision creates a new GoalVersion (no mutation of prior); planner marks unknowns vs. asks questions; every extracted field is editable before data processing; empty/ambiguous goals show clarification, never fabricated assumptions.
**Verify (PRD §11):** empty/ambiguous goal → disabled submit or visible clarification, no fabricated assumptions.

### Step 1.7 — Canvas + linear navigation, selection state (PRD §9 screen 2, §10 Phase 1 exit)

**Build:** navy/black dotted whiteboard canvas with left-to-right dependency graph (welcome → discovery → datasets → plan → running → barrier → results); polyline/curve edges; node cards; stage overview; **linear ordered stage list equivalent** for narrow screens and accessibility; selection state store (hosts, datasets) survives tab changes and reload.
**DoD:** canvas and list show the same state; selections persist across navigation and refresh; keyboard access to every control; reduced-motion support; zoom support.
**Verify (PRD §11):** selections survive tab changes and reload (Phase 1 exit criterion).

**Phase 1 exit (PRD §10):** user can create and reload a draft with no lost selections; keyboard journey works.

---

## Phase 2 — Evidence and input acquisition (PRD §10 Phase 2)

### Step 2.1 — Host literature retrieval (BF-02, PRD §B)

**Build:** retrieval service (D9) with citation-first pipeline: query → source passages → Citation records (bibliographic metadata, source passage, retrieval date, link to claim). Inaccessible papers never appear as read full text; duplicate source passages never count as independent evidence; empty retrieval returns an explicit empty state — **no fabricated results**.
**DoD:** verified claim-to-source links; retrieval date recorded; dedupe by source passage; empty/error/partial states distinct; retrieval is deterministic over the fixture corpus.
**Verify:** no-literature scenario → empty state with guidance; paywalled/unavailable source → shown as not-read, not as evidence.

### Step 2.2 — Host ranking rubric (BF-02, PRD §B)

**Build:** versioned, inspectable rubric with criterion weights, missing-data indicators; scorer produces score + explicit "suitability estimate" label (not a probability of success); evidence coverage, rationale, tradeoffs, number of supporting sources, conflicting findings, freshness per host.
**DoD:** rubric version recorded on every score; weights are revisable in a **new draft**; missing data is surfaced, never imputed silently; score is labeled suitability estimate; ranking is advisory — host selection is user-controlled.
**Verify:** two rubric versions produce different scores with both versions inspectable.

### Step 2.3 — Host discovery screen (Screen 2, BF-02)

**Build:** ranked host cards (organism/strain identity, suitability score + label, evidence coverage, rationale, tradeoffs, conflicting findings, freshness); expandable **citation drawer** (bibliographic metadata, source passage, retrieval date, claim linkage); selection checkboxes; selection count; **compare** view; **continue** action; "unsupported/sparse evidence" markers.
**DoD:** at least one host needed to continue; selection count and chosen hosts always visible; ranking is advisory (no silent selection); compare view supports ≥2 hosts side by side.
**Verify (PRD §11):** conflicting literature → explicit conflict with source links.

### Step 2.4 — Public dataset metadata discovery (BF-03, PRD §C/D)

**Build:** dataset service with repository adapters (initial repos per D10/scope decision); metadata cache with retrieval timestamps; tabs — Genomics, Transcriptomics + perturbation, Pathways, Metabolomics, Flux analysis, My uploads; filters — host/strain, modality, condition, repository, assay, availability, reference build, license/access status. Record fields per PRD §7 DatasetVersion: accession/source, retrieval timestamp, checksum, license/access, taxonomy, strain, reference, modality, condition, sample mapping, replicate count when available, file size, source link, quality summary, compatibility warnings. Unknown remains unknown.
**DoD:** stable identifiers; search + filters + distinct empty/error states; metadata cached with timestamps; selection does not auto-approve — host confirmation filters candidates; availability never implied as guaranteed.
**Verify:** repository unavailable → cached metadata shown with timestamp and explicit age notice; empty result → distinct empty state.

### Step 2.5 — Private upload & validation (BF-04, Screen 11, PRD §C)

**Build:** resumable upload; checksum computation + verification; format inspection; sample-sheet mapping; initial formats — FASTA/GFF (genomics), count matrices + metadata (expression/perturbation), pathway tables/model files (schemas/limits finalized with pipeline owners per PRD §C); raw sequencing intake sized + validated separately. Unsupported files show a **concrete remedy**, never a generic failure. Files remain workspace-scoped; checksum + validation status visible; interrupted upload resumes with no duplicate DatasetVersion.
**DoD:** interrupted upload resumes and produces exactly one dataset version; checksum mismatch blocks with actionable message; private files not readable cross-workspace (tested); unsupported format → concrete next step.
**Verify (PRD §11):** interrupted upload → resume with checksum validation, no duplicate version; cross-workspace request → denied.

### Step 2.6 — Compatibility checks (BF-04, PRD §C)

**Build:** checks — taxonomy/strain identity, genome/reference version, sample-label consistency, required replicates, contrasts, condition mismatch, gene identifiers, branch-prerequisite availability. Two classes: **warning** (justified acknowledgement allowed, recorded) and **blocking** (blocks affected analysis). Coverage matrix linking selected datasets → branch → host.
**DoD:** policy table (warn vs. block) implemented and tested; acknowledgement is an audit event; incompatible dataset cannot reach a blocked branch; coverage matrix visible.
**Verify (PRD §11):** wrong strain/reference → actionable compatibility block/warning per policy.

**Phase 2 exit (PRD §10):** verified claim-to-source links; empty/error states; compatibility blocking; private-data isolation pass.

---

## Phase 3 — One vertical execution slice (PRD §10 Phase 3)

Pick **one** branch (recommend: genomics) end-to-end through the frozen manifest.

### Step 3.1 — Remote executor adapter (PRD §7, D4)

**Build:** one adapter: submit → poll → cancel containerized scientific workflow; scoped credentials; resource limits; normalized status → branch state mapping; executor IDs mapped to environments; quota check before submission where possible.
**DoD:** adapter is the only place that talks to the engine; credentials server-side only (never in client or logs); normalized status mapping table documented; tool-executor version recorded in manifest.
**Verify:** lost remote heartbeat → "Connection uncertain", not automatic failure (PRD §6).

### Step 3.2 — Plan review and frozen manifest (BF-05, Screen 4, PRD §D)

**Build:** plan review page — hosts, chosen datasets, proposed tools, parameters, required references, contrasts, compute environment, estimated resource range (if available), expected outputs; advanced parameters expandable; unresolved assumptions and blocked branches highlighted; **Start analyses** creates an immutable Run + workflow manifest (inputs snapshot, parameters, tool/container versions, reference versions, command); edits afterward create a **new draft**.
**DoD:** manifest is immutable after launch (write-once, hash-verified); plan must pass review gates (hosts confirmed, inputs validated) before launch; revising triggers new draft; reproduce-ability manifest covers 100% of launched runs.
**Verify (PRD §11):** double launch → one run, stable idempotency response.

### Step 3.3 — Launch, idempotency, run state (BF-06, PRD §E)

**Build:** launch API with idempotency key (client-generated, persisted before acknowledgement); run/branch/attempt records; attempt IDs per (branch, retry); status updates carry runId, branchId, attemptId, eventId, sequence/version, timestamp, reason; duplicate/stale events cannot move state backward; state persisted before acknowledging launch/decision.
**DoD:** retried/double-clicked launch → same run ID, no duplicate submissions; state survives process restart; stale/duplicate events ignored by state machine; detached client does not cancel jobs (close tab ≠ cancel).
**Verify (PRD §11):** double launch; reconnect/out-of-order events → authoritative current state.

### Step 3.4 — Events + reconnect replay (BF-13, PRD §7)

**Build:** event stream (SSE or equivalent) with sequence cursor; reconnect replay from cursor; authoritative run snapshot endpoint; refresh returns authoritative state.
**DoD:** replay is gap-free and ordered; duplicate delivery is idempotent; no lost run state after reconnect; "Connection uncertain" badge on heartbeat loss.
**Verify (PRD §11):** reconnect/out-of-order events → authoritative current state, no regression; lost run state after reconnect = 0.

### Step 3.5 — Logs, progress, artifact validation (PRD §E)

**Build:** per-attempt log access; stage-based status everywhere; progress percentages **only** when executor reports meaningful progress (otherwise stage names); artifact validation on completion — output validated against branch output schema (BF-06 "Validating outputs" state) **before** Succeeded is recorded.
**DoD:** success requires artifact validation, not just exit code 0; invalid artifact → branch failed (or retrying) with reason; logs immutable per attempt; artifacts hash-verified and versioned.
**Verify:** exit-0-but-invalid-artifact fixture → failure recorded.

### Step 3.6 — Cancel (BF-06, PRD §E/§8)

**Build:** explicit cancel per branch (+ run); cancels record cancellation state; remote acknowledgement or explicit pending state; client loss never cancels.
**DoD:** cancel reaches remote or enters explicit pending; cancellation is an audited terminal state, never "failed"; retry of a cancelled branch is possible.

**Phase 3 exit (PRD §10):** a reproducible fixture run survives refresh and service restart without duplicate submission.

---

## Phase 4 — Parallel orchestration and fallback (PRD §10 Phase 4)

### Step 4.1 — Durable orchestrator (PRD §7, D3)

**Build:** DAG over branches; dependency rules from PRD §6 (host confirmation → input confirmation → validated plan → launch; all required terminals → barrier); retries capped; deterministic input failures never auto-retried; reconciliation of remote vs. local state after outages; state machine with explicit Fail/Cancel/Skip terminals.
**DoD:** one source of job truth (no competing stores); recovery replays unfinished work correctly; retry caps honored; duplicate/stale events cannot move a branch backward.
**Verify:** service restart mid-run → reconciliation completes with correct state.

### Step 4.2 — Full branch set: transcriptomics/perturbation, pathways, metabolomics, flux analysis (Screen 5, PRD §E)

**Build:** the remaining overlay-style analysis panels (beyond the genomics slice) with the same lifecycle as Step 3.x (status, stage, elapsed time, remote environment, resource info, logs, artifacts); each panel emits validated outputs referencing artifacts; fan out from inputs to panels with explicit graph edges; integration barrier node between panels and harmonization.
**DoD:** all five branches independent (one failing does not cancel others); completed branch inspectable while others run; panels reflect only their own artifacts; outputs follow the branch contracts signed off in Step 0 (quality/annotation + host comparison; expression quality, contrast tables, uncertainty; pathway mapping/enrichment/method assumptions; metabolite processing/annotation; flux distribution + **predicted yields**).
**Verify:** branches complete out of order → independent outputs visible; barrier preserved.

### Step 4.3 — Integration barrier (BF-07)

**Build:** barrier waits until every required branch is terminal (succeeded/failed/cancelled/skipped); unaffected jobs continue but integration still waits for their terminal states; "waiting" displayed with which branches are pending.
**DoD:** no integration while any required branch is non-terminal; barrier state visible in UI; skip is an explicit, audited action.
**Verify:** one branch fails while others run → failure decision visible; integration waits.

### Step 4.4 — Failure decision (BF-08, Screen 6, PRD §F)

**Build:** blocking decision modal — affected branch + reason, available evidence, absent modality, consequences; actions **Retry failed analysis** (branch-scoped, new attempt ID, prior logs retained), **Review inputs** (→ datasets), **Proceed with collected evidence** (only if minimum evidence policy met — MVP: ≥1 validated analytical branch + traceable input metadata), **Cancel run**; explanation when proceed unavailable; persisted FallbackDecision — actor, timestamp, run version, omitted branches, evidence snapshot, rationale.
**DoD:** proceed disabled when policy unmet with explanation; decision is audited and replayable; persistent "Partial evidence" labels on dashboard, chat, exports; retry-forks new attempt with retained prior logs; all-branches-fail → proceed disabled.
**Verify (PRD §11):** proceed after partial failure → explicit decision recorded + limitations persist; all branches fail → retry/review/cancel available.

### Step 4.5 — Late retry → new integration version (PRD §F)

**Build:** retry after a published result creates a **new integration version**; previous result unchanged; late-output never silently mutates a published result; re-run of barrier/harmonization for the new version.
**DoD:** late retry produces new HarmonizationVersion; prior published snapshot byte-identical; versioning visible on results.
**Verify (PRD §11):** late retry after publication → new integration version; previous result unchanged.

**Phase 4 exit (PRD §10):** success, one/two/all failures, cancellation, stale events and late retry scenarios pass.

---

## Phase 5 — Integration and results (PRD §10 Phase 5)

### Step 5.1 — Harmonizer (BF-09, PRD §G)

**Build:** normalize organism/gene identifiers; reconcile reference versions; align condition/contrast metadata; record unmapped entities; retain original modality-specific measures (never average incompatible units; never treat correlated evidence as independent); produce HarmonizationVersion with mapping report.
**DoD:** mapping report lists mapped/unmapped entities; incompatible units preserved separately; correlated evidence flagged, not counted twice; versioned output.
**Verify:** incompatible-units fixture → units preserved, explicit caveat.

### Step 5.2 — Versioned claim/evidence graph (BF-09)

**Build:** EvidenceClaim (claim text, claim type observed/inferred/hypothesis, supporting + contradicting EvidenceLinks, limitations, method version) linking each interpretation to datasets, literature, transformations, artifacts; provenance graph persisted; artifact-grounded.
**DoD:** 100% of displayed material scientific claims link to a source passage or analysis artifact; claim types never mislabeled (hypothesis never presented as observed/confirmed, per PRD §3).
**Verify:** claim provenance reachable from results (Screen 9).

### Step 5.3 — Independent critic (BF-09, Screen 7, PRD §F)

**Build:** critic checks — contradictions, poor quality, missing modalities, unsupported causal language, reference/condition mismatch, duplicated evidence, confidence overstatement; dispositions **Ready**, **Ready with caveats**, **Needs review**; hard validation defects block recommendation; unresolved scientific uncertainty → explicit caveats, never invented consensus.
**DoD:** every CriticFinding is traceable to evidence; blocking rules (from Step 0) enforced; disposition published with recommendation; no single opaque confidence number substitutes evidence coverage.
**Verify:** contradictory fixture → explicit conflict + caveats; causation-without-support fixture → flagged.

### Step 5.4 — Results dashboard (BF-10, Screens 8/10, PRD §G)

**Build:** host comparison table; evidence coverage matrix; modality tabs; inspectable charts (tooltips: measure, unit, method, sample context, uncertainty where available); ranked hypotheses; critic findings; provenance; host + modality filters update table & charts consistently; result selection opens evidence detail; downloaded raw values match chart selection; persistent "Partial evidence" labels.
**DoD:** one source of chart/table data (no divergent copies); filter changes propagate to all linked views and export selections; accessible chart tables (WCAG 2.2 AA); selecting a result opens its evidence detail.
**Verify (PRD §11):** chart host filter changes → all linked views and downloaded data agree.

### Step 5.5 — Grounded AI chat (BF-11, Screens 8/12, PRD §G)

**Build:** assistant reads project, run version, selected hosts, visible artifact, partial-evidence status; answers cite actual artifacts or literature passages; citation click opens evidence drawer (Screen 9); suggested prompts — "Why did this host rank higher?", "What evidence is missing?", "Explain the conflicting results"; out-of-evidence questions → clear insufficiency; proposed reruns rendered as reviewable plan requiring explicit launch; chat is read-only — cannot silently alter datasets, parameters, or running jobs.
**DoD:** every displayed chat answer links to evidence or states insufficiency; no invented citations (fixture test); no implicit job mutations — no mutation calls from chat path; rerun proposals require explicit launch action.
**Verify (PRD §11):** unsupported chat claim → clear insufficiency, no invented citation.

### Step 5.6 — Export and reproducible bundle (BF-12, PRD §G/§8)

**Build:** export job → human-readable report, selected tables, figure data, manifest, citations, provenance graph, critic findings, machine-readable limitations; preserves run ID/version + partial-evidence watermark; reopening a completed run shows a stable snapshot.
**DoD:** bundle contains manifest + artifacts + provenance + limitations; exports watermarked with partial evidence; byte-stable per run version; export latency tracked.
**Verify:** export → re-import/read → claims traceable.

**Phase 5 exit (PRD §10):** every material claim is traceable; incomplete evidence remains visible everywhere.

---

## Phase 6 — Pilot and release hardening (PRD §10 Phase 6)

### Step 6.1 — Fixture test matrix (PRD §11)

Convert every row of the PRD §11 table into an automated integration test (empty/ambiguous goal; no/conflicting literature; wrong strain/reference; interrupted upload; double launch; out-of-order branches; one branch fails; proceed-after-partial-failure; all fail; late retry; reconnect; unsupported chat claim; chart filter agreement; cross-workspace denial; modal keyboard nav).
**DoD:** matrix runs in CI; each scenario asserts the PRD's "Expected result".

### Step 6.2 — Scientific benchmark review

Run pilot fixture through the full pipeline with scientific lead; compare against Step 0 benchmark expectations; fix contract mismatches.
**DoD:** benchmark results documented; scientific owner signs off; any tool swap recorded as new ADR.

### Step 6.3 — Usability & accessibility review

Moderated pilot with target ≥80% goal-to-reviewed-plan completion (PRD §2); WCAG 2.2 AA audit; keyboard-only journey; screen-reader check; modal focus trap; reduced motion; zoom; linear workflow list on narrow screens.
**DoD:** usability target met (or gap root-caused + owner); AA issues fixed or deferred by named owner.

### Step 6.4 — Security & access tests

Workspace isolation audit; RBAC matrix test; short-lived artifact URLs; encrypted transfer/storage; secrets never in logs; executor least privilege; untrusted upload/retrieval text cannot override system instructions or invoke tools; retention/deletion policy implemented before onboarding private datasets.
**DoD:** pentest/audit checklist passes; private content excluded from analytics by default.

### Step 6.5 — Load & limits

Load test: ordinary metadata API p95 <2s excluding external repos; navigation/filtering feels immediate; long operations acknowledge promptly with stage status; supported upload sizes/concurrency/resource limits set from measured evidence.
**DoD:** release gates (concurrency/size limits) documented from load test results; perf targets met.

**Phase 6 exit (PRD §10):** P0 requirements and release gates pass with named owners.

---

## Progress tracker

| Step | Owner | Status | Notes |
|---|---|---|---|
| 0 – Spike & contracts | claude | ☑ | D1–D9 recorded in docs/decisions.md; D10 + scientific contracts OPEN (owner sign-off) |
| 1.1 Scaffold/CI | claude | ☑ | pnpm monorepo, TS strict, ESLint/Prettier/Vitest, docker-compose, CI, runbook |
| 1.2 Data model | claude | ☑ | @chassix/db: 23 entities, pgEnums from shared, WorkspaceScope helper, initial migration |
| 1.3 Design system | claude | ☑ | @chassix/ui: tokens + 10 a11y components + gallery; live-DB apply + Figma visual match pending |
| 1.4 Auth/RBAC | claude | ☑ | apps/api: role×action matrix, per-request workspace ctx, cross-workspace denial, scrypt+JWT sessions, audit events |
| 1.5 Welcome | claude | ☑ | apps/web Screen 1: goal composer, exact copy, disabled-until-typed, module cards, example flow |
| 1.6 Goal interpretation | claude | ◑ | @chassix/planner live Anthropic (claude-opus-5-5 + refusal fallback) + apps/web /goal review UI; API persistence (GoalVersion→Project) pending |
| 1.7 Canvas/navigation | claude | ☑ | apps/web Screen 2: dotted canvas + linear list parity, persistent selection store, a11y/zoom/reduced-motion |
| 2.1 Literature retrieval | claude | ☑ | @chassix/planner: citation-first RetrievalProvider + fixtures; dedup, not-read, empty-state; live Apify deferred |
| 2.2 Ranking rubric | claude | ☑ | @chassix/planner: immutable versioned rubric + scorer; missing-data surfaced, suitability estimate (advisory); weights illustrative pending ADR-D10 |
| 2.3 Host discovery screen | claude | ☑ | apps/web /hosts: ranked cards, citation drawer, compare, persistent selection, continue-gated |
| 2.4 Public metadata | claude | ☑ | @chassix/datasets: RepositoryAdapter + fixtures, timestamped cache (cached-with-age), distinct empty/error, exact accession lookup |
| 2.5 Upload & validation | claude | ☑ | @chassix/datasets: resumable upload (no dup version), sha256 checksum block, format inspection + concrete remedies, workspace-scoped |
| 2.6 Compatibility checks | claude | ☑ | @chassix/datasets: warn-vs-block policy table, 8 checks, audited acknowledgement, coverage matrix, unreachable blocked branches |
| 3.1 Executor adapter | claude | ☑ | @chassix/executor: ExecutorAdapter FakeExecutor (scenarios incl. heartbeat-loss→unknown) + Nextflow stub (creds redacted); status mapping |
| 3.2 Plan review & manifest | claude | ☑ | orchestrator immutable hash-verified RunManifest + apps/web plan-review/freeze UI (Screen 4) |
| 3.3 Launch/idempotency | claude | ☑ | @chassix/orchestrator: idempotent launch (persist-before-ack, no dup submit), run/branch/attempt, reconciliation on restart; apps/api launch route |
| 3.4 Events & replay | claude | ☑ | orchestrator event log + cursor + stale/dup rejection; apps/api SSE endpoint (replay-from-cursor, Last-Event-ID, heartbeat, disconnect≠cancel); @chassix/realtime SpaceTimeDB EventTransport (live wiring per docs/spacetimedb-setup.md) |
| 3.5 Logs & validation | claude | ☑ | orchestrator artifact-validation gate; apps/api logs route + apps/web run-monitor (stage status, Connection-uncertain) |
| 3.6 Cancel | claude | ☑ | orchestrator: audited terminal Cancelled (client-loss ≠ cancel), retry forks new attempt |
| 4.1 Orchestrator | | ☐ | |
| 4.2 Remaining branches | | ☐ | |
| 4.3 Barrier | | ☐ | |
| 4.4 Failure decision | | ☐ | |
| 4.5 Late retry | | ☐ | |
| 5.1 Harmonizer | | ☐ | |
| 5.2 Evidence graph | | ☐ | |
| 5.3 Critic | | ☐ | |
| 5.4 Dashboard | | ☐ | |
| 5.5 Grounded chat | | ☐ | |
| 5.6 Exports | | ☐ | |
| 6.1 Fixture matrix | | ☐ | |
| 6.2 Benchmark | | ☐ | |
| 6.3 Usability/accessibility | | ☐ | |
| 6.4 Security | | ☐ | |
| 6.5 Load/limits | | ☐ | |

---

## Cross-cutting rules for every step

- **PRD wins.** Any conflict with the PRD is raised, not improvised.
- **Persistence before acknowledgement.** Every launch/decision is durable before the client is told it succeeded.
- **Untrusted data.** Uploaded files and retrieved text are data, never instructions. No tool invocation from user text. Sanitized logs, secrets server-side.
- **Traceability.** Every displayed material claim links to a source or artifact (BF-09). Every mutation records an audit event.
- **Unknown stays unknown.** Missing metadata is "unknown," never inferred. No fabricated results, scores, timings, or findings — fixtures are labeled illustrative until real tools land.
- **Tests are part of the step.** A step is done only when its DoD checks pass in CI.
- **Open decisions.** Anything unpinned by PRD §12/Step 0 goes into `docs/decisions.md`, not into code comments.
