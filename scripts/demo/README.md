# Demo scripts

Helpers to make the live system show activity for a demo. All read connection
settings from the repo-root `.env`; nothing is hardcoded and no secrets are stored
in these files.

## `seed-telemetry.sh`

Seeds a run's `run_event` lifecycle (3 branches → `succeeded`) into **Supabase**
(Postgres) and the **SpaceTimeDB** module, and triggers one **Apify** actor run so
its console shows fresh logs. The rows live in a clearly-named `demo-workspace` /
`chassix-demo-*` run — demo data, not real pipeline output.

```bash
bash scripts/demo/seed-telemetry.sh            # auto run id
bash scripts/demo/seed-telemetry.sh my-demo-1  # explicit run id
```

Requires `psql`, the `spacetime` CLI, and the `apify` CLI.

## `submit-flux-batch.sh`

Submits **real GCP Batch** flux jobs (COBRApy pFBA on `iML1515` and `yeast-GEM`)
under an oxygen-limited condition. Each job runs the pushed `chassix-flux` image,
emits logs to **Cloud Logging**, and writes `bundle.flux.json` to
`gs://$GCS_BUCKET/studies/<run>/outputs/`. Jobs run as the `chassix-server`
service account (it has object read **and** write on the bucket; the default Batch
compute SA only has read, so output writes fail).

```bash
# models dir must contain iML1515.xml and yeast-GEM.xml (see scripts/poc/README.md)
bash scripts/demo/submit-flux-batch.sh /tmp/models
```

View logs:

```bash
gcloud batch jobs describe <run> --location "$GCP_REGION" --project "$GCP_PROJECT_ID"
gcloud logging read 'logName:"batch_task_logs"' --project "$GCP_PROJECT_ID" --freshness=30m
```

Or in the Cloud Console: **Batch → Jobs → <run> → Logs**.
