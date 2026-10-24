# Chassix-AI

**Chassix AI** — turn a scientist's plain-language experimental goal into a reviewable, reproducible bioinformatics workflow.

Chassix AI lets scientists describe an experimental outcome in plain language, then guides them through: goal interpretation → literature-backed host discovery and ranking → multiomics dataset selection (public + private upload) → reviewed execution plan → parallel remote analyses → evidence harmonization and independent scientific critic review → an interactive results dashboard with a testable, artifact-grounded AI assistant.

> **Status: scaffolding (Phase 1 in progress).** Step 0 decisions are recorded in [`docs/decisions.md`](docs/decisions.md) and the monorepo scaffold (Step 1.1) is landing. Technical choices D1–D9 are set; **D10 (exact scientific tools) and the scientific contracts still need scientific-owner sign-off** before any analysis code depends on them.

## Repository documents

| Document                                                                 | Purpose                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Chassix-AI-PRD.md](Chassix-AI-PRD.md)                                   | Product requirements: behavior, functional requirements (BF-01…BF-14), state model, proposed architecture, phases, verification checklist. **Source of truth for behavior.** |
| [Chassix-AI-Design-Guide.md](Chassix-AI-Design-Guide.md)                 | Design handoff: editable Figma file, walkthrough, screen inventory (1–12), prototype boundaries. **Source of truth for visuals and flows.**                                  |
| [Chassix-AI-Implementation-Guide.md](Chassix-AI-Implementation-Guide.md) | Step-by-step implementation plan (Steps 0–6.5) for agents/engineers: per-step build scope, Definition of Done, verification scenarios, and progress tracker.                 |

## Getting started for contributors

1. Read the documents above in this order: PRD → Design Guide → Implementation Guide.
2. Start at **Step 0** of the implementation guide — record the open technical/scientific decisions in `docs/decisions.md` and get scientific sign-off on contracts before writing application code.
3. Pick one step (e.g. `1.3 Design system`), work on a `feature/chassix-step-X-Y` branch, meet its Definition of Done, and update the progress tracker in the implementation guide.

## Developer runbook

Prerequisites: Node 20 (`.nvmrc`), pnpm 9 (`corepack enable pnpm`), Docker.

```bash
corepack enable pnpm        # once, activates pnpm 9
pnpm install                # install workspace deps
cp .env.example .env        # fill in ANTHROPIC_API_KEY, APIFY_TOKEN, etc. (never commit .env)
pnpm dev:stack              # start Postgres + MinIO via docker compose
pnpm test                   # run all workspace tests (vitest)
pnpm typecheck              # strict tsc across the repo
pnpm lint && pnpm format:check
pnpm --filter @chassix/api dev   # boot the API (health at http://localhost:3001/health)
```

Monorepo layout (built up as steps land — see the Implementation Guide):

| Path                | Role                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/shared`   | Contracts, branded IDs, PRD §6 state machines, event + error envelopes — the only cross-service seam. |
| `packages/fixtures` | Fixture corpus (illustrative until scientific sign-off).                                              |
| `apps/api`          | TypeScript API service (Fastify). Auth/RBAC/plans/runs/events land in later steps.                    |
| `infra/`            | docker-compose stack, migrations (Step 1.2), executor config (Phase 3).                               |
| `docs/decisions.md` | ADRs for D1–D10.                                                                                      |

Services depend only on `@chassix/shared` — never on each other's internals.

## Scope at a glance

- **In scope (MVP/P0):** desktop web workspace; goal interpretation; cited host ranking; public + private datasets; three parallel analysis branches; immutable run manifests; failure decisions; harmonization + critic; results dashboard; grounded chat; exports; access controls.
- **Not in scope:** autonomous physical experimentation, clinical decision support, untested data-modality inference, unrestricted shell from chat, open marketplace of pipelines. The UI never presents a hypothesis as experimentally confirmed.

See the PRD (§3 scope, §10 phases) for details.
