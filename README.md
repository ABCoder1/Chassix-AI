# Chassix-AI

**BioForge AI** — turn a scientist's plain-language experimental goal into a reviewable, reproducible bioinformatics workflow.

BioForge AI lets scientists describe an experimental outcome in plain language, then guides them through: goal interpretation → literature-backed host discovery and ranking → multiomics dataset selection (public + private upload) → reviewed execution plan → parallel remote analyses → evidence harmonization and independent scientific critic review → an interactive results dashboard with a testable, artifact-grounded AI assistant.

> **Status: pre-implementation.** The PRD, design, and implementation plan are proposals awaiting technical spike and scientific contract sign-off. No code has been written yet, and architecture/tool choices are not final.

## Repository documents

| Document | Purpose |
|---|---|
| [BioForge-AI-PRD.md](BioForge-AI-PRD.md) | Product requirements: behavior, functional requirements (BF-01…BF-14), state model, proposed architecture, phases, verification checklist. **Source of truth for behavior.** |
| [BioForge-AI-Design-Guide.md](BioForge-AI-Design-Guide.md) | Design handoff: editable Figma file, walkthrough, screen inventory (1–12), prototype boundaries. **Source of truth for visuals and flows.** |
| [BioForge-AI-Implementation-Guide.md](BioForge-AI-Implementation-Guide.md) | Step-by-step implementation plan (Steps 0–6.5) for agents/engineers: per-step build scope, Definition of Done, verification scenarios, and progress tracker. |

## Getting started for contributors

1. Read the documents above in this order: PRD → Design Guide → Implementation Guide.
2. Start at **Step 0** of the implementation guide — record the open technical/scientific decisions in `docs/decisions.md` and get scientific sign-off on contracts before writing application code.
3. Pick one step (e.g. `1.3 Design system`), work on a `feature/bioforge-step-X-Y` branch, meet its Definition of Done, and update the progress tracker in the implementation guide.

Nothing is buildable yet — the repo currently contains only these planning documents.

## Scope at a glance

- **In scope (MVP/P0):** desktop web workspace; goal interpretation; cited host ranking; public + private datasets; three parallel analysis branches; immutable run manifests; failure decisions; harmonization + critic; results dashboard; grounded chat; exports; access controls.
- **Not in scope:** autonomous physical experimentation, clinical decision support, untested data-modality inference, unrestricted shell from chat, open marketplace of pipelines. The UI never presents a hypothesis as experimentally confirmed.

See the PRD (§3 scope, §10 phases) for details.
