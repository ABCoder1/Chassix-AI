# Owner setup tasks — what Chassix AI needs from you

These are the steps that rehquire **your** credentials, cloud accounts, or decisions. Everything
else (code, contracts, tests) is done or in progress. Each task says exactly what to run and what
to hand back (an env value, a confirmation). **Never commit** `.env` **or any key** — it is gitignored
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
2. In the dashboard: **Connect → Session pooler** and copy that URI. Use the **Session pooler**, not
   the Transaction pooler and not the Direct connection:
   - **Direct connection** (`db.<ref>.supabase.co:5432`) is **IPv6-only** on new projects, so on an
     IPv4 network it fails with `ENOTFOUND` / `ENETUNREACH` — this is the error to avoid.
   - **Transaction pooler** (`...pooler.supabase.com:6543`) does not support the prepared statements /
     advisory locks Drizzle migrations use.
   - **Session pooler** (`...pooler.supabase.com:5432`, user `postgres.<ref>`) is IPv4 and supports
     migrations. This is the one to use.
3. Put it in `.env` as `DATABASE_URL=…` (server-side only; do not commit). SSL is handled
   automatically for remote hosts (the config adds `sslmode=no-verify` — encrypted; to enforce
   certificate verification, add an explicit `?sslmode=require` to the URL yourself).
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
to Cloud Storage. Details and the per-branch table are in `[workflows/README.md](../../workflows/README.md)`.

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

**Wired (2026-10-25):** when `GCP_PROJECT_ID` + `GCP_REGION` + `GCS_BUCKET` are set, the API now uses
the live **GcpBatchExecutor** — a run launch renders `workflows/<branch>/batch-<branch>.json` and
submits it as a GCP Batch job, and the **GcsBundleSource** reads each run's
`gs://GCS_BUCKET/studies/<runId>/outputs/bundle.<branch>.json` back into `GET …/runs/:runId/bundle`
(the dashboard's data). No `GCP_*` → it falls back to the `FakeExecutor` (no real jobs). Auth is
Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`, or `gcloud auth application-default login`).

**Still required on your side before a real launch runs end-to-end:**

1. **Build + push the branch images** to Artifact Registry (step 3 above) — Batch pulls
   `REGION-docker.pkg.dev/PROJECT_ID/chassix/<branch>:latest`.
2. **Credentials** reachable by the API process (SA key via `GOOGLE_APPLICATION_CREDENTIALS`, or ADC).
3. **Per-run organism/condition** on the launch (the plan's branch `parameters.organism` /
   `parameters.condition`) so the Batch job is tagged correctly; otherwise they default to `unspecified`.

> Engine choice: we use **GCP Batch directly** (what `workflows/` + the executor target). Nextflow
> (ADR-D4) stays optional/unused — `NEXTFLOW_*` blank. If you ever prefer it, give me an endpoint +
> token and I'll add that adapter behind the same `ExecutorAdapter` seam.

---

## 3. SpaceTimeDB — live run-event layer (sponsor track)

Full steps are in `[docs/spacetimedb-setup.md](../spacetimedb-setup.md)`. In short:

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

From `[docs/scientific-contracts.md](../scientific-contracts.md)`, a few tool choices are defaulted and
tunable later; confirm when convenient:

- Genomics assembly/annotation QC tool for novel microbes (QUAST/BUSCO — currently a documented TBD).
- Final MetaboAnalystR version tag and the metabolomics output unit (`peak_area` vs. concentration).

None of these block development; defaults are already wired behind the `FakeExecutor`.

---

## 6. Appendix — where each environment variable comes from

All of these are **server-side only**; never commit `.env`. Variables are grouped by source.

### Google Cloud (`GCP_*`, `GCS_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS`) — via `gcloud`

```bash
# Project id + a region
gcloud projects list                       # pick/confirm your project
gcloud config set project PROJECT_ID
gcloud config get-value project            # -> GCP_PROJECT_ID
gcloud compute regions list                # pick one, e.g. us-central1 -> GCP_REGION

# Storage bucket (name only in .env, no gs://)
gcloud storage buckets create gs://chassix-<unique> --location=GCP_REGION --project=PROJECT_ID
gcloud storage buckets list                # -> GCS_BUCKET (the name after gs://)

# Service account + key -> GOOGLE_APPLICATION_CREDENTIALS
gcloud iam service-accounts create chassix-runner \
  --display-name="Chassix runner" --project=PROJECT_ID
SA=chassix-runner@PROJECT_ID.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:$SA" --role="roles/batch.jobsEditor"
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:$SA" --role="roles/artifactregistry.reader"
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:$SA" --role="roles/logging.logWriter"
gcloud storage buckets add-iam-policy-binding gs://GCS_BUCKET --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"
gcloud iam service-accounts keys create ~/chassix-sa.json --iam-account=$SA
# -> GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/chassix-sa.json
```

- **Local dev shortcut:** instead of a key file, run `gcloud auth application-default login` and leave
  `GOOGLE_APPLICATION_CREDENTIALS` blank — Google SDKs pick up your Application Default Credentials.
- **`GCS_HMAC_*` (optional):** only if you point an S3-compatible client at GCS instead of the native
  SDK: `gcloud storage hmac create $SA` prints the access key + secret.

### SpaceTimeDB (`SPACETIME_*`) — you already published to `chassix-realtime`

- `SPACETIME_MODULE` = the database/module name you published = **`chassix-realtime`**.
- `SPACETIME_URI` = the host your module lives on. For Maincloud it is **`wss://maincloud.spacetimedb.com`**;
  for a local self-host it is `ws://localhost:3000`. Confirm configured servers with `spacetime server list`.
- `SPACETIME_TOKEN` = a client auth token (optional for anonymous/dev). Get your current identity token
  with `spacetime login show --token` (run `spacetime login --help` to confirm the flag on your CLI
  version). Leave blank to connect with an anonymous identity.
- Sanity-check the published module with `spacetime list` and the dashboard URL you have.

### Nextflow (`NEXTFLOW_*`) — not needed

- We execute analyses via **GCP Batch** (`workflows/`), not a Nextflow server, so `NEXTFLOW_ENDPOINT`
  and `NEXTFLOW_TOKEN` stay **blank**. Only fill them if you later stand up Nextflow/Seqera Platform
  (then: `NEXTFLOW_ENDPOINT` = that API URL, `NEXTFLOW_TOKEN` = a personal access token from it).

### Already set

- `DATABASE_URL` — Supabase **Session pooler** URI (port 5432). `ANTHROPIC_API_KEY`, `APIFY_API_TOKEN`,
  `ANTHROPIC_MODEL` — see §4. `JWT_SECRET` — any long random string (`openssl rand -hex 32`).
