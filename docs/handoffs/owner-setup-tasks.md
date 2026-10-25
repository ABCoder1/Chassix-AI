# Owner setup tasks — what Chassix AI needs from you

These are the steps that require **your** credentials, cloud accounts, or decisions. Everything
else (code, contracts, tests) is done or in progress. Each task says exactly what to run and what
to hand back (an env value, a confirmation). **Never commit `.env` or any key** — it is gitignored
and read server-side only.

Quick map of what unlocks what:

| You want to…                                  | Do tasks     |
| --------------------------------------------- | ------------ |
| Run the app locally (fake executor, no cloud) | 1 (local), 4 |
| Persist real data in Postgres                 | 1            |
| Run real analyses on Google Cloud             | 2            |
| Live run-event sync (sponsor track)           | 3            |
| Planner + grounded chat + Apify discovery     | 4            |

---

## 1. Postgres migration (apply the schema to a database)

The schema (23 tables, ADR-D5) and migrations already exist in `packages/db/migrations`. You just
need a database and to run the migration. The app also runs fully on in-memory repositories, so this
is only needed when you want real persistence.

**Option A — local Postgres via Docker (fastest):**

```bash
cp .env.example .env            # if you haven't already
pnpm dev:stack                  # starts Postgres + MinIO (docker compose)
# DATABASE_URL already points at the local DB in .env.example:
#   postgresql://chassix:chassix@localhost:5432/chassix
pnpm db:migrate                 # applies migrations 0000 + 0001
```

**Option B — Supabase / hosted Postgres (for a shared/deployed DB):**

1. Create a Supabase project (or any Postgres 15+).
2. Copy the **direct** connection string (port `5432`, **not** the transaction-pooler `6543` — Drizzle
   migrations need a direct connection), e.g. `postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres`.
3. Put it in `.env` as `DATABASE_URL=…` (server-side only; do not commit).
4. `pnpm db:migrate`.

**Verify:** `psql "$DATABASE_URL" -c "\dt"` should list the Chassix tables (workspaces, runs,
branches, attempts, datasets, …).

**Hand back:** nothing to send me — just set `DATABASE_URL` in `.env`. Tell me which option you chose.

> Note: two small schema additions are tracked follow-ups I will make — a `run_events` table and a
> few `branches`/`attempts` columns the orchestrator currently journals into `audit_events`. The base
> migration above is complete and safe to apply now; I'll ship an incremental migration for those.

---

## 2. Google Cloud — run the real analyses (`workflows/`)

Each analysis branch is a container that runs on **GCP Batch** and writes an analysis-bundle fragment
to Cloud Storage. Details and the per-branch table are in [`workflows/README.md`](../../workflows/README.md).

1. **Project + APIs.** Create/choose a project; note `PROJECT_ID` and a `REGION` (e.g. `us-central1`).
   Enable: Batch, Artifact Registry, Cloud Storage, Cloud Logging.
2. **Artifact Registry.** Create a Docker repo named `chassix`:
   ```bash
   gcloud artifacts repositories create chassix --repository-format=docker --location=REGION
   gcloud auth configure-docker REGION-docker.pkg.dev
   ```
3. **Build + push each image** (run from repo root; build context is `workflows/`):
   ```bash
   for b in genomics transcriptomics pathways metabolomics flux; do
     docker build -t REGION-docker.pkg.dev/PROJECT_ID/chassix/$b:latest -f workflows/$b/Dockerfile workflows/
     docker push REGION-docker.pkg.dev/PROJECT_ID/chassix/$b:latest
   done
   ```
4. **GCS bucket.** Create a bucket (`GCS_BUCKET`). Layout per run: `gs://GCS_BUCKET/studies/<RUN_ID>/inputs/`
   and `…/outputs/bundle.<branch>.json`.
5. **Service account.** Create one with: Batch Job Editor, Storage Object Admin (on the bucket),
   Artifact Registry Reader, Logs Writer. Download a key JSON and set `GOOGLE_APPLICATION_CREDENTIALS`
   to its path in `.env` (server-side only).
6. **Fill the Batch specs.** In each `workflows/<branch>/batch-<branch>.json`, replace the placeholders
   `PROJECT_ID`, `REGION`, `GCS_BUCKET`, `RUN_ID`, and the image URI. Branch-specific knobs are listed
   in each branch's `README.md` (pathways needs an organism `OrgDb`; metabolomics pins a MetaboAnalystR
   tag; genomics takes `CHASSIX_NOVEL_MICROBE=true|false`).

**Hand back:** `GCP_PROJECT_ID`, `GCP_REGION`, `GCS_BUCKET` (set in `.env`), and confirm the SA key path
is set. With those, I'll wire the executor to submit these Batch jobs and ingest the output bundles into
the `GET …/runs/:runId/bundle` endpoint the dashboard reads.

> Decision needed: **GCP Batch directly** (what `workflows/` targets) vs. **Nextflow** (ADR-D4) as the
> orchestration engine. Batch is ready now; if you prefer Nextflow, give me an endpoint + token
> (`NEXTFLOW_ENDPOINT`/`NEXTFLOW_TOKEN`) and I'll wire that executor instead.

---

## 3. SpaceTimeDB — live run-event layer (sponsor track)

Full steps are in [`docs/spacetimedb-setup.md`](../spacetimedb-setup.md). In short:

1. Install the `spacetime` CLI and pick a host (Maincloud or self-hosted).
2. `spacetime publish` the module in `apps/realtime/module/`, then
   `spacetime generate --lang typescript --out-dir apps/realtime/src/module_bindings`.
3. Set `SPACETIME_URI`, `SPACETIME_MODULE`, `SPACETIME_TOKEN` in `.env`.

**Hand back:** those three env values. Then I'll move `apps/realtime/examples/connection.example.ts`
into `src/` against the generated bindings and switch the event transport over. (Until then the
in-memory/SSE transport is used — nothing is blocked.)

---

## 4. API keys (already in your `.env`)

- `ANTHROPIC_API_KEY` — planner (goal interpretation) and the upcoming grounded chat (ADR-D9).
- `APIFY_API_TOKEN` — literature/dataset discovery (ADR-D9).

These live in `.env` at the repo root today. For a deployment, set them as server environment
variables. **Confirm they're present**; nothing to send me. `ANTHROPIC_MODEL` defaults to
`claude-opus-4-8` if unset.

---

## 5. Optional scientific confirmations (safe defaults in place)

From [`docs/scientific-contracts.md`](../scientific-contracts.md), a few tool choices are defaulted and
tunable later; confirm when convenient:

- Genomics assembly/annotation QC tool for novel microbes (QUAST/BUSCO — currently a documented TBD).
- Final MetaboAnalystR version tag and the metabolomics output unit (`peak_area` vs. concentration).

None of these block development; defaults are already wired behind the `FakeExecutor`.
