#!/usr/bin/env bash
#
# Demo telemetry seeder — makes the live services show recent activity for a demo.
#
#   * Supabase (Postgres): inserts a run's run_event lifecycle (3 branches reach succeeded).
#   * SpaceTimeDB:         inserts the same run_event rows into the published module.
#   * Apify:              triggers one actor run (produces fresh console logs).
#
# These are DEMO rows in a clearly-named demo workspace / run id — not real pipeline output.
# Reads connection settings from the repo-root .env (nothing is hardcoded here).
#
# Usage:  bash scripts/demo/seed-telemetry.sh [run_id]
# Requires: psql, spacetime CLI, apify CLI; a populated .env at the repo root.
set -uo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a

RUN="${1:-chassix-demo-$(date +%H%M%S)}"
PSQL="$(command -v psql || echo /opt/homebrew/opt/postgresql@17/bin/psql)"
STDB_MOD="${SPACETIME_MODULE:-chassix-realtime}"

echo "==> Supabase: seeding run_events for ${RUN}"
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -v run="$RUN" <<'SQL'
WITH ws AS (
  INSERT INTO workspaces (name, slug) VALUES ('Demo Workspace','demo-workspace')
  ON CONFLICT (slug) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO run_events (workspace_id, run_id, branch_id, attempt_id, event_id, sequence, state, reason, event_at)
SELECT ws.id, :'run', v.branch, v.branch || '-a1', gen_random_uuid()::text, v.seq,
       v.state::branch_state, v.reason, now() - ((12 - v.seq) * interval '4 seconds')
FROM ws CROSS JOIN (VALUES
  (1,'branch-genomics','queued','Scheduled on GCP Batch.'),
  (2,'branch-genomics','running','Remote execution started.'),
  (3,'branch-genomics','validating_outputs','Validating output artifacts.'),
  (4,'branch-genomics','succeeded','Outputs validated against schema.'),
  (5,'branch-transcriptomics','queued','Scheduled on GCP Batch.'),
  (6,'branch-transcriptomics','running','Remote execution started.'),
  (7,'branch-transcriptomics','validating_outputs','Validating output artifacts.'),
  (8,'branch-transcriptomics','succeeded','Outputs validated against schema.'),
  (9,'branch-flux','queued','Scheduled on GCP Batch.'),
  (10,'branch-flux','running','Remote execution started.'),
  (11,'branch-flux','validating_outputs','Validating output artifacts.'),
  (12,'branch-flux','succeeded','Outputs validated against schema.')
) AS v(seq,branch,state,reason)
ON CONFLICT DO NOTHING;
SELECT run_id, count(*) AS events FROM run_events WHERE run_id = :'run' GROUP BY run_id;
SQL

echo "==> SpaceTimeDB: seeding run_event rows into ${STDB_MOD}"
sid=2000
for row in \
  "branch-genomics|1|queued|Scheduled on GCP Batch." \
  "branch-genomics|2|running|Remote execution started." \
  "branch-genomics|3|validating_outputs|Validating output artifacts." \
  "branch-genomics|4|succeeded|Outputs validated against schema." \
  "branch-transcriptomics|5|running|Remote execution started." \
  "branch-transcriptomics|6|succeeded|Outputs validated against schema." \
  "branch-flux|7|running|Remote execution started." \
  "branch-flux|8|succeeded|Outputs validated against schema."; do
  IFS='|' read -r branch seq state reason <<EOF
$row
EOF
  sid=$((sid+1))
  spacetime sql "$STDB_MOD" \
    "INSERT INTO run_event (id, run_id, branch_id, attempt_id, event_id, sequence, state, reason, timestamp) VALUES ($sid, '$RUN', '$branch', '$branch-a1', 'evt-$sid', $seq, '$state', '$reason', '$(date -u +%Y-%m-%dT%H:%M:%SZ)')" \
    >/dev/null 2>&1 && echo "   stdb ok: $branch $state"
done

echo "==> Apify: triggering one actor run"
if [ -n "${APIFY_RETRIEVAL_ACTOR:-}" ]; then
  printf '{"query":"multi-omics flux balance analysis Saccharomyces cerevisiae Escherichia coli","maxItems":8}' > /tmp/chassix-apify-input.json
  ( cd apify-retrieval-actor && apify call --input-file /tmp/chassix-apify-input.json 2>&1 | grep -iE "result:|Run URL" ) || echo "   (apify call skipped/failed)"
else
  echo "   APIFY_RETRIEVAL_ACTOR not set; skipping."
fi

echo "Done. Seeded run id: ${RUN}"
