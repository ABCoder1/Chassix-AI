# Chassix-AI

**Chassix-AI** — turn a scientist's plain-language experimental goal into a reviewable, reproducible bioinformatics workflow.

Chassix-AI lets scientists describe an experimental outcome in plain language, then guides them through: goal interpretation → literature-backed host discovery and ranking → multiomics dataset selection (public + private upload) → reviewed execution plan → parallel remote analyses → evidence harmonization and independent scientific critic review → an interactive results dashboard with a testable, artifact-grounded AI assistant.

> **Status: visualization prototype.** A runnable 3D workstation lives in `apps/web`. The scientific workflow, predictive modeling, backend, and production architecture remain proposals awaiting validation.

## Run the 3D workstation

From the repository root:

```sh
sh scripts/dev.sh
```

Open **http://127.0.0.1:5173/**. The launcher uses Node and pnpm from your PATH, with a fallback to the bundled Codex runtime on this Mac. For another computer, install Node.js 24 and pnpm 11.25.0 first.

Explore yeast, bacterial, and archaeal cells; orbit and zoom; adjust environmental controls; inspect structures; switch mesh, internals, cutaway, and pathway particles; pause animation; and export the current scenario as JSON. All responses and geometry are **illustrative**, not experimentally calibrated predictions.

See [the visualization development guide](docs/visualization.md) for source files, editing guidance, and checks.

For the next implementation phase, [the workflow-analysis handoff](docs/handoffs/workflow-analysis-dashboard.md) and the machine-readable [analysis input contract](workflow-inputs/README.md) describe how to replace demo responses with real, provenance-backed workflow outputs.

```sh
pnpm build      # TypeScript checks and production build
pnpm test       # Response, export, and animation regression tests
```

## Repository documents

| Document | Purpose |
|---|---|
| [Chassix-AI-PRD.md](Chassix-AI-PRD.md) | Product requirements: behavior, functional requirements (CHX-01…CHX-14), state model, proposed architecture, phases, verification checklist. **Source of truth for behavior.** |
| [Chassix-AI-Design-Guide.md](Chassix-AI-Design-Guide.md) | Design handoff: editable Figma file, walkthrough, screen inventory (1–12), prototype boundaries. **Source of truth for visuals and flows.** |
| [Chassix-AI-Implementation-Guide.md](Chassix-AI-Implementation-Guide.md) | Step-by-step implementation plan (Steps 0–6.5) for agents/engineers: per-step build scope, Definition of Done, verification scenarios, and progress tracker. |

## Getting started for contributors

For the local Cal Hacks 13.0 kickoff, see [the contributor start guide](docs/calhacks13-start.md) and [the Step 0 decision log](docs/decisions.md).

1. Read the documents above in this order: PRD → Design Guide → Implementation Guide.
2. Start at **Step 0** of the implementation guide — record the open technical/scientific decisions in `docs/decisions.md` and get scientific sign-off on contracts before writing application code.
3. Pick one step (e.g. `1.3 Design system`), work on a `feature/chassix-step-X-Y` branch, meet its Definition of Done, and update the progress tracker in the implementation guide.

The visualization is a standalone frontend spike. It does not complete Step 0 or the full scaffold/CI, authentication, scientific execution, or evidence validation requirements in the implementation guide.

## Scope at a glance

- **In scope (MVP/P0):** desktop web workspace; goal interpretation; cited host ranking; public + private datasets; three parallel analysis branches; immutable run manifests; failure decisions; harmonization + critic; results dashboard; grounded chat; exports; access controls.
- **Not in scope:** autonomous physical experimentation, clinical decision support, untested data-modality inference, unrestricted shell from chat, open marketplace of pipelines. The UI never presents a hypothesis as experimentally confirmed.

See the PRD (§3 scope, §10 phases) for details.
