# Chassix-AI — Step 0 decision log

Status: draft, opened for Cal Hacks 13.0. No technical spike or scientific sign-off has been completed.

The PRD is the behavioral source of truth. This log records the decisions required by Step 0 of the implementation guide; an option is not an approved choice until its evidence and owner are recorded here.

## Architecture decisions

| ID | Decision | Options from the implementation guide | Chosen | Evidence needed | Owner |
|---|---|---|---|---|---|
| D1 | App framework | Next.js; Vite + React | Vite + React + TypeScript for the standalone visualization spike; production framework pending | Visualizer builds and runs using `sh scripts/dev.sh`; production app and scientific contracts remain open | Unassigned |
| D2 | API and authentication | Same-language API service; JWT/session; workspace RBAC | Pending | Define sign-in, membership, and permission boundaries | Unassigned |
| D3 | Durable orchestration | Temporal; one database-backed state machine | Pending | Demonstrate persistence, retry, and idempotent launch with one source of job truth | Unassigned |
| D4 | Scientific workflow engine | Nextflow; CWL; Snakemake on one remote executor | Pending | Execute one agreed reference input and validate output artifacts | Unassigned |
| D5 | Database and migrations | PostgreSQL with Drizzle or Prisma | Pending | Apply migrations and demonstrate workspace-scoped queries | Unassigned |
| D6 | Artifact storage | S3-compatible storage and short-lived signed URLs | Pending | Agree region/retention; verify scoped upload and download | Unassigned |
| D7 | Literature index | PostgreSQL full-text search; OpenSearch | Pending | Demonstrate source passage retrieval and exact accession lookup | Unassigned |
| D8 | Event delivery | SSE with sequence cursor; equivalent replayable transport | Pending | Demonstrate reconnect without stale state regression | Unassigned |
| D9 | Search and model providers | Evaluate providers for planning, retrieval, harmonization, and grounded chat | Pending | Check cited retrieval, schema-valid output, and behavior when evidence is missing | Unassigned |
| D10 | Scientific tools per branch | Genomics; expression/perturbation; pathways | Pending | Scientific owner approves exact tools, versions, and input/output contracts | Unassigned |

For each decision, replace Pending with the chosen option and record the rationale, spike result, owner, and decision date. Keep rejected alternatives and their reasons. Record later changes as new dated entries.

## Scientific contracts

### Visualization spike — 24 October 2026

The user explicitly chose to work on the interactive 3D visualization and supplied two TSX prototypes. `apps/web` uses React and Three.js with Vite to isolate that work from the scientific backend. The updated prototype's controls and inspector are adapted to actual WebGL geometry, with species-specific structure labels. Node.js 24 and pnpm 11.25.0 were used; exact dependency versions are recorded in the package manifests and lockfile.

Reference environments and response equations are demo parameters. No viability, ATP, yield, FBA, or anatomical accuracy claim is made. Scientific contracts and Step 0 exit criteria remain pending. The current visualizer neither launches remote jobs nor calls a model API.

- [ ] Name the scientific sign-off owner.
- [ ] Agree the pilot goal and supported host/strain scope.
- [ ] Define versioned input/output schemas for each analysis branch.
- [ ] Specify public repositories, upload formats, file limits, and sample mappings.
- [ ] Agree ranking criteria, weights, missing-data behavior, and source requirements.
- [ ] Agree minimum evidence policy and critic blocking rules.
- [ ] Select a reference dataset and expected benchmark outputs.
- [ ] Version a fixture corpus with known citations, incompatible inputs, missing modalities, contradictory evidence, and a reference run.
- [ ] Record scientific approval and unresolved limitations.

Illustrative examples in the design are not validated scientific findings. Missing facts remain unknown. Step 0 stays open until its documented exit criteria are met.
