# Chassix AI — Product Requirements Document

Version 1.0 · 22 October 2026 · Status: implementation proposal

## 1. Product intent and source of truth

Chassix AI turns a scientist’s plain-language experimental goal into a reviewable, reproducible bioinformatics workflow. Scientists choose hosts and evidence, run independent remote analyses, and explore an integrated interpretation with citations, limitations, and an AI assistant.

This document incorporates the detailed user requirements retrieved from the ChassixAI conversation and the continuation request. Earlier assistant responses containing the implementation blueprint were returned only as inaccessible content-reference markers. Architecture, delivery phases, scoring details, and thresholds below are proposed decisions rather than claims about that unavailable blueprint. Scientific examples in the design are illustrative, not validated findings.

### Required experience

1. Welcome prompt: **“what do you want to build?”**
2. Supporting copy: **“Describe your end goal out of an experiment in plain language. We’ll assemble the tools, parameters and workflow for you.”**
3. Visible supported modules: literature and host discovery; genomics; transcriptomics and perturbation; pathway analysis; evidence harmonization; scientific critic; results and AI chat.
4. Navy/black dotted, whiteboard-style canvas with a left-to-right dependency graph.
5. Retrieval-augmented host ranking with literature, user-controlled host comparison, public multiomics discovery, and private upload.
6. Five parallel remote analysis branches (genomics; transcriptomics/perturbation; pathways; metabolomics; flux analysis/fluxomics for yield predictions) with live status, independent outputs, and explicit convergence into the Biological Intelligence Engine.
7. Evidence harmonization followed by critic review; a failed branch must trigger a decision about proceeding with collected evidence.
8. Interactive results dashboard and contextual AI chat.

## 2. Problem, users, and outcomes

Scientists currently stitch together literature review, dataset searches, remote jobs, and multiomics interpretation across disconnected tools. This creates undocumented assumptions, incompatible inputs, opaque failures, and results whose provenance is difficult to inspect.

Primary users are experimental biologists and strain engineers who define goals and assess evidence. Computational biologists review analysis plans, mappings, and parameters. Research leads compare hypotheses and export reviewable reports. Workspace administrators manage data access and remote execution configuration.

The initial job-to-be-done is: “When I have an experimental outcome in mind, help me compare suitable microbial hosts and integrate available evidence so I can decide what to investigate next.” The demonstration goal is a more thermotolerant microbial host for industrial enzyme production with reduced cooling requirements. The system must distinguish measured temperature tolerance, inferred suitability, and unmeasured downstream cooling economics.

### Proposed success measures

| Measure | Initial target | Measurement |
|---|---|---|
| Goal-to-reviewed-plan task completion | ≥80% in moderated pilot | Participants reach a validated run plan without assistance |
| Provenance coverage | 100% of displayed material scientific claims | Claim links to source passage or analysis artifact |
| Failure decision integrity | 100% | No incomplete run enters harmonization without a recorded decision |
| Reproducibility manifest coverage | 100% of launched runs | Immutable inputs, parameters, tool/container versions, and reference versions |
| Lost run state after reconnect | 0 in release tests | Replay and refresh return authoritative job state |
| Time to first useful plan | Median <5 min in pilot | Excludes external repository outages and scientist review time |

Targets are product hypotheses to validate with pilot users, not existing service guarantees.

## 3. Scope and release boundaries

### MVP / P0

Desktop web workspace; goal interpretation and review; cited host ranking; selecting one or multiple hosts; public dataset metadata search; validated upload; five analysis branch types (genomics, transcriptomics/perturbation, pathways, metabolomics, flux analysis/yield prediction); one configured remote execution environment; immutable run manifests; progress/logs; partial-failure decisions; harmonization and critic; comparison dashboard; artifact-grounded chat; report and data export; workspace access controls.

### P1

Saved workflow templates, parameter presets, richer cross-run comparisons, collaboration comments, additional repository connectors, cost forecasting, and organization-managed execution environments.

### Not in initial scope

Autonomous physical experimentation, guarantees of biological performance, clinical decision support, unsupported data-modality inference, unrestricted shell execution from chat, or an open-ended marketplace of arbitrary pipelines. The UI must never present an analytical hypothesis as experimentally confirmed.

## 4. End-to-end journey

### A. Welcome and goal interpretation

The scientist enters a goal, optionally chooses an example, and selects **Build my workflow**. An empty prompt keeps the action disabled. The planner extracts organism constraints, desired phenotype, product context, analysis objectives, and success measures into an editable goal summary. Missing critical details appear as targeted questions. Proposed assumptions are visible and editable before data processing.

Example input: “I want a more thermotolerant microbial host for producing an industrial enzyme with reduced cooling requirements.” The system must ask for or mark unknown the target operating range and production constraints; it must not fabricate them.

Acceptance: supported modules are visible before submitting; the scientist can revise the interpreted goal; a new project and draft workflow are persisted; the original prompt remains accessible.

### B. RAG host discovery and ranking

The leftmost canvas node retrieves relevant host literature and returns a ranked shortlist. Each host card shows organism/strain identity, score with a “suitability estimate” label, evidence coverage, rationale, tradeoffs, number of supporting sources, conflicting findings, and freshness. Expandable citations show bibliographic metadata, source passage, retrieval date, and linkage to the claim. Unsupported or sparse evidence appears explicitly.

The scientist selects hosts using checkboxes, compares them, and confirms the selection. A ranking is advisory; no host is silently selected for execution. Scores use a versioned, inspectable rubric with criterion weights and missing-data indicators. Weights may be revised in a new draft; score is not a probability of experimental success.

Acceptance: selection count and chosen hosts are clear; at least one host is needed to continue; inaccessible papers never appear as read full text; duplicate source passages do not count as independent evidence; no results are fabricated when retrieval returns nothing.

### C. Public datasets and private upload

A discovery agent may fetch candidate metadata alongside host discovery. Host confirmation filters candidates and never auto-approves them. The dataset workspace provides tabs for Genomics, Transcriptomics + perturbation, Pathways, Metabolomics, Flux analysis, and My uploads. Filters include host/strain, modality, condition, repository, assay, availability, reference build, and license/access status.

Each record exposes accession or stable identifier, repository, version/retrieval date, host/strain, experimental conditions, biological replicate count when available, file size, source link, assay, quality summary, and compatibility warnings. Missing metadata remains unknown. Selected datasets are assigned to branch and host, with a visible coverage matrix.

Uploads support resumable transfer, checksums, format inspection, and sample-sheet mapping. Initial format candidates are FASTA/GFF for genomic assets, count matrices and associated metadata for expression/perturbation, and supported pathway tables or model files; exact schemas and limits must be finalized with pipeline owners. Raw sequencing intake is separately sized and validated before being advertised as supported. Unsupported files show a concrete remedy, not a generic failure.

Compatibility checks cover taxonomy/strain identity, genome/reference version, sample-label consistency, required replicates, contrasts, condition mismatch, gene identifiers, and availability of branch prerequisites. Scientists can acknowledge a justified warning; structural incompatibilities block the affected analysis.

Acceptance: selected inputs survive tab changes; no remote analysis starts merely by selecting a dataset; private files remain workspace-scoped; checksum and validation status are visible; unavailable metadata and empty repository results have distinct states.

### D. Plan review and remote launch

Before execution, show hosts, chosen datasets, proposed tools, parameters, required references, contrasts, compute environment, estimated resource range if available, and expected outputs. Advanced parameters are expandable. Highlight unresolved assumptions and blocked branches. **Start analyses** creates an immutable run version; edits afterward create a new draft and cannot mutate the executing manifest.

Acceptance: one deliberate launch creates one run despite double-clicks or retries; each branch records its input snapshot and tool versions; credentials stay server-side; insufficient quota is detected before submission where possible.

### E. Parallel remote analyses

The canvas fans out from inputs to five overlay-style analysis panels: Genomics, Transcriptomics + perturbation, Pathways, Metabolomics, and Flux analysis (fluxomics → yield predictions). Each panel shows status, stage, elapsed time, remote environment, resource information, log access, and available artifacts. Progress percentages appear only when the executor reports meaningful progress; otherwise show stage-based status.

Panels independently emit validated outputs and forward artifact references to the integration barrier. A completed branch remains inspectable while another runs. Closing a panel or browser does not cancel a remote job. Cancel is explicit and records cancellation state.

Typical output contracts: genomic quality/annotation and host comparison tables; expression/perturbation quality metrics, contrast tables and uncertainty; pathway mapping/enrichment or model outputs with method assumptions. These are workflow families; pipeline owners must select and validate the exact scientific tools before production.

### F. Barrier, failure decision, harmonization, and critic

The Biological Intelligence Engine waits until every required branch is terminal: succeeded, failed, cancelled, or explicitly skipped. Successful completion requires artifact validation, not merely a process exit code. If all required branches succeed, harmonization begins. If a branch fails, display a blocking decision modal identifying the failure, available evidence, absent modality, and consequences.

Modal actions: **Retry failed analysis**, **Review inputs**, **Proceed with collected evidence**, and **Cancel run**. Proceed is available only if a minimum evidence policy is met; for MVP require at least one validated analytical branch plus traceable input metadata. A configurable policy may be stricter per workflow. The UI must explain why proceeding is unavailable when none qualify. Unaffected jobs continue, but integration still waits for their terminal states.

Proceed records actor, timestamp, run version, omitted branches, evidence snapshot, and rationale. Late retry outputs do not silently change a published result: they create a new integration version. Persistent “Partial evidence” labels appear on dashboard, chat, and exports. Retry is branch-scoped and uses a new attempt ID while retaining prior logs.

Harmonization normalizes organism and gene identifiers, reconciles reference versions, aligns condition/contrast metadata, records unmapped entities, and retains original modality-specific measures. It must not average incompatible units or treat correlated evidence as independent. A versioned claim/evidence graph links each interpretation to datasets, literature, transformations, and artifacts.

The critic checks contradictions, poor quality, missing modalities, unsupported causal language, reference/condition mismatch, duplicated evidence, and confidence overstatement. Results are **Ready**, **Ready with caveats**, or **Needs review**. Hard validation defects block a recommendation; unresolved scientific uncertainty produces explicit caveats rather than invented consensus.

### G. Results dashboard and AI chat

Results include a host comparison table, evidence coverage matrix, modality tabs, inspectable charts, ranked hypotheses, critic findings, and provenance. Host and modality filters update the table and charts consistently. Selecting a result opens its evidence detail; downloadable raw values match the chart selection. Chart tooltips expose measure, unit, method, sample context, and uncertainty where available. No single opaque confidence number substitutes for evidence coverage.

AI chat knows the project, run version, selected hosts, visible artifact, and partial-evidence status. Responses cite actual artifacts or literature passages. Clicking a citation opens the evidence drawer. Suggested prompts include “Why did this host rank higher?”, “What evidence is missing?”, and “Explain the conflicting results.” Questions beyond the evidence receive a clear limit. Proposed reruns appear as a reviewable plan and require an explicit launch action. Chat cannot silently alter datasets, parameters, or running jobs.

Export bundle: human-readable report, selected tables, figure data, manifest, citations, provenance graph, critic findings, and machine-readable limitations. Exports preserve run ID/version and partial-evidence watermark. Reopening a completed run shows a stable result snapshot.

## 5. Functional requirements register

| ID | Priority | Requirement | Acceptance evidence |
|---|---|---|---|
| BF-01 | P0 | Interpret goal and expose assumptions | Editable goal review and persisted original prompt |
| BF-02 | P0 | Cited host shortlist and user confirmation | Citation drawer and explicit host selection event |
| BF-03 | P0 | Discover public multiomics metadata | Search, filters, empty/error states, stable identifiers |
| BF-04 | P0 | Upload and validate private inputs | Checksum, sample mapping, actionable validation results |
| BF-05 | P0 | Review a versioned execution plan | Frozen manifest and explicit launch event |
| BF-06 | P0 | Execute branches independently remotely | Attempt IDs, live status, logs, separate artifacts |
| BF-07 | P0 | Wait at integration barrier | No integration while required branch is nonterminal |
| BF-08 | P0 | Ask before partial-evidence integration | Decision audit record and persistent limitations |
| BF-09 | P0 | Harmonize and independently critique evidence | Mapping report, evidence graph, critic disposition |
| BF-10 | P0 | Explore results interactively | Linked filters, detail drawer, plot-to-data consistency |
| BF-11 | P0 | Ground AI chat in a run snapshot | Verifiable citations and no implicit job mutations |
| BF-12 | P0 | Export reproducible results | Manifest, artifacts, limitations and provenance bundle |
| BF-13 | P0 | Restore state across sessions | Reconnect replay and authoritative run refresh |
| BF-14 | P0 | Enforce project permissions | Cross-workspace access denied in API and artifact store |

## 6. State model and dependency rules

Project flow: Draft goal → Discovering evidence → Selecting hosts → Selecting inputs → Plan ready → Running → Awaiting decision or Integrating → Critic review → Results ready / Results with caveats / Needs review. Failed launch and cancelled runs remain distinct terminal states.

Branch state: Not configured → Validating → Ready → Queued → Running → Validating outputs → Succeeded. Failure, cancellation, and intentional skip are separate states. Every status update carries runId, branchId, attemptId, eventId, sequence/version, timestamp, and reason. Duplicate and stale events cannot move a branch backward. A lost remote heartbeat means “Connection uncertain,” not automatic scientific failure.

Dependencies: host confirmation precedes input confirmation; validated inputs and reviewed plan precede launch; all required branch terminal states plus any missing-evidence consent precede harmonization; valid harmonization output precedes critic; critic disposition precedes recommendation publication. Independent successful artifacts may be viewed before publication.

## 7. Proposed implementation architecture

This architecture is a proposal to replace the unavailable blueprint, not a recovered copy.

| Layer | Responsibility | Boundary |
|---|---|---|
| Web application | Welcome, canvas, datasets, results, chat | Display state; no scientific computation in browser |
| Project/API service | Authentication, authorization, plan review, run commands | Authoritative permissions and immutable manifests |
| Planner and retrieval service | Goal schema, host evidence retrieval, candidate ranking | Schema-valid plans and cited evidence; no direct job execution |
| Dataset service | Repository adapters, metadata cache, upload validation | Stable identities, checksums, availability and compatibility |
| Durable orchestrator | DAG dependencies, retries, cancellation, barrier and decisions | State survives process restarts; idempotent commands |
| Remote executor adapters | Submit/poll/cancel containerized scientific workflows | Scoped credentials and resource limits |
| Artifact and metadata stores | Versioned files, manifests, logs, evidence graph | Content hashes, access control, retention |
| Harmonizer and critic | Entity alignment, interpretation, independent review | Validated input/output schemas and traceable findings |
| Event delivery | Live updates and reconnect replay | Server-sent events or equivalent with sequence cursor |
| Contextual assistant | Retrieval over authorized run evidence | Read-only by default; explicit review for new runs |

Choose one durable orchestrator and one scientific workflow execution engine during a technical spike; avoid two competing sources of job truth. A relational database is proposed for projects, approvals, manifests and states; object storage for large artifacts; a search index for citations and metadata. A vector index is optional and must not replace exact accession or source lookup. Exact vendors, libraries and versions require validation at implementation time.

### Data entities

Workspace, User, Membership, Project, GoalVersion, HostCandidate, Citation, HostSelection, DatasetVersion, SampleMapping, WorkflowPlan, Run, Branch, Attempt, Artifact, EvidenceClaim, EvidenceLink, HarmonizationVersion, CriticFinding, FallbackDecision, ChatMessage, ExportJob, AuditEvent.

All data-bearing records have workspace ownership and version metadata. DatasetVersion includes accession/source, retrieval timestamp, checksum, license/access status, taxonomy, strain, reference, modality, condition and sample mapping. EvidenceClaim includes claim text, claim type (observed/inferred/hypothesis), supporting and contradicting links, limitations and method version.

### Proposed API surfaces

Create/update goal drafts; search host evidence; confirm hosts; discover datasets; initiate/finalize upload; validate mappings; create/review plan; launch run with idempotency key; fetch run snapshot; stream events after cursor; retry/cancel branch; submit fallback decision; retrieve artifacts/evidence; query grounded chat; request/download export. Every mutation checks permission, expected version and current state. Errors include machine-readable code, actionable message, retryability and correlation ID.

## 8. Nonfunctional requirements

Security: workspace isolation, role-based permissions, short-lived artifact URLs, encrypted transfer/storage, server-side secrets, audit trails, sanitized logs, and least-privilege executor identities. Uploaded files and retrieved text are untrusted data and cannot override system instructions or invoke tools. Data retention and deletion policy must be settled before onboarding private datasets; do not imply deletion from third-party repositories.

Reliability: persist state before acknowledging launch/decision; reconcile remote and local state after outages; preserve partial outputs; cap transient retries; never retry deterministic input failures automatically. Cancellation includes remote acknowledgement or an explicit pending state. Expired credentials do not destroy run history.

Performance targets: local navigation and filtering should feel immediate; target p95 ordinary metadata API responses below two seconds excluding external repository delays. Long operations acknowledge promptly and show stage status. Exact supported upload sizes, concurrency and resource limits are release gates determined by load testing.

Accessibility: target WCAG 2.2 AA; keyboard access to every control; visible focus; text labels alongside status colors; accessible chart tables; reduced motion; zoom support; focus trapped and restored for modals. Provide a linear workflow list equivalent to the spatial canvas. Desktop primary at 1440px; on narrow screens use the ordered stage list and stacked details rather than shrinking the full graph.

Observability: trace project/run/branch/attempt IDs across services; collect queue wait, runtime, artifact validation failures, retry reasons, integration waits, citation failures and export latency. Exclude private biological content from analytics by default.

## 9. UI design specification

Visual direction: precise scientific workspace with deep navy surfaces, subtle dotted canvas, bright mint primary actions, blue analytical signals, amber caveats and restrained violet integration accents. Proposed typeface: Inter with clearly differentiated headings, labels and numeric values. Use an 8px spacing rhythm, rounded 12–16px panels, readable body text and explicit status badges.

Screen inventory:

1. Welcome: brand/navigation, exact requested prompt, large plain-language composer, example goal, supported module cards, recent project entry.
2. Host discovery: dotted canvas, left-to-right stage overview, ranked host cards, citation/rationale preview, selection count and continue action.
3. Datasets: modality tabs, public/upload switch, filters, selectable metadata rows, compatibility coverage and confirm inputs.
4. Plan review: hosts/input summary, proposed methods and parameters, environment/resources, assumptions and launch.
5. Running canvas: parallel analysis panels, explicit graph edges, stage outputs, integration barrier, logs and inspect actions.
6. Failure decision: affected branch and reason, available evidence, consequences, retry/review/proceed/cancel.
7. Harmonization/critic: mapping coverage, convergence status, evidence conflicts, critic findings and review disposition.
8. Results: comparison table/charts, evidence coverage, caveats, selected-result detail and grounded AI chat.
9. Evidence detail: source or artifact, claim linkage, method, limitations and provenance.

Editable Figma deliverable should use native text, vectors, frames, auto-layout and reusable components where appropriate. Prototype links demonstrate the sequence and selected alternate states; they do not imply live computation, real repository retrieval or a functional language model. All mock scores, counts, timings and findings must be labeled illustrative.

## 10. Implementation sequence and exit criteria

### Phase 0 — Validate scientific contracts

Agree pilot goal, supported host scope, branch input/output schemas, exact validated scientific tools, minimum evidence policy and ranking rubric. Build a fixture corpus with known citations, incompatible inputs, missing modalities and contradictory evidence. Exit: scientific owner signs off contracts and benchmark expectations.

### Phase 1 — Product shell and state persistence

Implement welcome, goal review, project storage, permissions, canvas/list navigation, selection state and design components. Exit: a user can create and reload a draft with no lost selections; keyboard journey works.

### Phase 2 — Evidence and input acquisition

Implement citation-first retrieval, host ranking, repository metadata adapters, upload validation and sample mapping. Exit: verified claim-to-source links, empty/error states, compatibility blocking, and private-data isolation pass.

### Phase 3 — One vertical execution slice

Take one branch from reviewed plan to remote job to validated artifact using a frozen manifest. Add events, reconnection, logs and cancellation. Exit: a reproducible fixture run survives refresh and service restart without duplicate submission.

### Phase 4 — Parallel orchestration and fallback

Add remaining branches, terminal-state barrier, branch retry, failure decision and partial-evidence persistence. Exit: success, one/two/all failures, cancellation, stale events and late retry scenarios pass.

### Phase 5 — Integration and results

Implement identifier/condition harmonization, provenance graph, independent critic, dashboard, artifact-grounded chat and exports. Exit: every material claim is traceable and incomplete evidence remains visible everywhere.

### Phase 6 — Pilot and release hardening

Run scientific benchmark review, usability study, accessibility review, security/access testing and resource load tests. Set supported size/concurrency limits from evidence. Exit: P0 requirements and release gates pass with named owners.

No calendar estimate is committed without team capacity and scientific pipeline readiness. Suggested owners: product/design for flow and copy; scientific lead for methods and evidence policy; frontend for canvas/results; backend for state/API; platform for execution/storage; QA for fixture and recovery matrix.

## 11. Verification and release checklist

| Scenario | Expected result |
|---|---|
| Empty/ambiguous goal | Disabled submit or visible clarification; no fabricated assumptions |
| No literature or conflicting literature | Empty state or explicit conflict with source links |
| Dataset wrong strain/reference | Actionable compatibility block/warning per policy |
| Interrupted upload | Resume with checksum validation and no duplicate dataset version |
| Double launch | One run and stable idempotency response |
| Branches complete out of order | Independent outputs visible; barrier preserved |
| One branch fails while others run | Failure decision visible; integration waits |
| Proceed after partial failure | Explicit decision recorded; limitations persist in chat/export |
| All branches fail | Proceed disabled; retry/review/cancel available |
| Late retry after publication | New integration version; previous result unchanged |
| Reconnect/out-of-order events | Authoritative current state; no regression |
| Unsupported chat claim | Clear insufficiency, no invented citation |
| Chart host filter changes | All linked views and downloaded data agree |
| Cross-workspace artifact request | Access denied even with guessed identifier |
| Modal keyboard navigation | Focus stays within dialog and returns to trigger |

## 12. Risks and open decisions

Scientific comparability is the largest risk: differing strains, conditions, references and assays may preclude a unified conclusion. Preserve separate evidence and expose incompatibility. Retrieval bias and paywall coverage can distort rankings; show coverage and uncertainty. Public repositories may be unavailable or restrictive; cache metadata with timestamps and do not imply guaranteed access. Large remote runs can exceed estimates; require quotas and visible cancellation.

Decisions before implementation: exact analysis tools and validated versions; initial host and repository scope; upload schemas and limits; ranking rubric; minimum evidence policy; critic blocking rules; remote environment/provider; storage region and retention; team roles and collaboration model; report formats; pilot benchmark dataset and scientific sign-off owner.

## 13. Requirements traceability

Welcome/modules → BF-01, screen 1. RAG ranking/selection → BF-02, screen 2. Public datasets/uploads → BF-03/04, screen 3. Reviewed remote plan → BF-05, screen 4. Parallel overlays → BF-06/07, screen 5. Failure fallback → BF-08, screen 6. Harmonization/critic → BF-09, screen 7. Interactive results and chat → BF-10/11, screens 8/9. Reproducibility and persistence → BF-12/13/14 across screens and services.
