#!/usr/bin/env bash
#
# Submit real GCP Batch flux jobs (COBRApy pFBA on a genome-scale model) so the
# run produces genuine logs in Cloud Logging and a bundle.flux.json in GCS.
#
# It stages model.xml (+ optional constraints.json) into GCS, renders a Batch spec
# from the pushed chassix-flux image, and submits one job per organism. The job
# runs as the chassix-server service account, which holds object read/write on the
# study bucket (the default Batch compute SA only has read, so output writes fail).
#
# Usage:  bash scripts/demo/submit-flux-batch.sh <models-dir>
#   <models-dir> must contain iML1515.xml and yeast-GEM.xml (see scripts/poc/README.md
#   for the download commands).
#
# Reads GCP_PROJECT_ID / GCP_REGION / GCS_BUCKET from the repo-root .env.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a

MODELS="${1:?usage: submit-flux-batch.sh <models-dir with iML1515.xml, yeast-GEM.xml>}"
IMG="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/chassix/chassix-flux:latest"
SA="chassix-server@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
STAMP=$(date +%H%M%S)
TMP=$(mktemp -d)

submit () {
  local KEY="$1" MODEL="$2" OBJ="$3" O2="$4" GLC="$5" ETOH="$6" \
        CHASSIS="$7" TAXID="$8" TAXNAME="$9" STRAINID="${10}" STRAINNAME="${11}"
  local RUN="chassix-demo-${KEY}-flux-${STAMP}"
  printf '{"objective":"%s","bounds":{"%s":{"lower":-2.0},"%s":{"lower":-10.0}},"yields":[{"id":"ethanol_per_glucose","name":"ethanol yield","productReaction":"%s","substrateReaction":"%s","unit":"mol/mol"}]}' \
    "$OBJ" "$O2" "$GLC" "$ETOH" "$GLC" > "$TMP/constraints.json"
  gcloud storage cp "$MODELS/$MODEL" "gs://${GCS_BUCKET}/studies/${RUN}/inputs/model.xml" >/dev/null 2>&1
  gcloud storage cp "$TMP/constraints.json" "gs://${GCS_BUCKET}/studies/${RUN}/inputs/constraints.json" >/dev/null 2>&1
  cat > "$TMP/${RUN}.json" <<JSON
{
  "taskGroups": [{ "taskCount": 1, "taskSpec": {
    "runnables": [{ "container": { "imageUri": "${IMG}", "commands": [] }, "environment": { "variables": {
      "CHASSIX_INPUTS_DIR": "/mnt/disks/gcs/studies/${RUN}/inputs",
      "CHASSIX_OUTPUT": "/mnt/disks/gcs/studies/${RUN}/outputs/bundle.flux.json",
      "CHASSIX_FLUX_CSV": "/mnt/disks/gcs/studies/${RUN}/outputs/flux_distribution.csv",
      "CHASSIX_OUTPUT_URI": "gs://${GCS_BUCKET}/studies/${RUN}/outputs/bundle.flux.json",
      "CHASSIX_FLUX_CSV_URI": "gs://${GCS_BUCKET}/studies/${RUN}/outputs/flux_distribution.csv",
      "CHASSIX_RUN_ID": "${RUN}", "CHASSIX_WORKFLOW_ID": "flux", "CHASSIX_WORKFLOW_VERSION": "1.0.0",
      "CHASSIX_CONDITION_ID": "oxygen_limited", "CHASSIX_CONDITION_MEDIA": "glucose minimal", "CHASSIX_CONDITION_OXYGENATION": "oxygen-limited",
      "CHASSIX_ORGANISM_CHASSIS": "${CHASSIS}", "CHASSIX_ORGANISM_TAXON_ID": "${TAXID}", "CHASSIX_ORGANISM_TAXON_NAME": "${TAXNAME}",
      "CHASSIX_ORGANISM_STRAIN_ID": "${STRAINID}", "CHASSIX_ORGANISM_STRAIN_NAME": "${STRAINNAME}"
    } } }],
    "volumes": [{ "gcs": { "remotePath": "${GCS_BUCKET}" }, "mountPath": "/mnt/disks/gcs", "mountOptions": ["implicit-dirs"] }],
    "computeResource": { "cpuMilli": 2000, "memoryMib": 8192 }, "maxRetryCount": 1, "maxRunDuration": "3600s"
  }}],
  "allocationPolicy": { "serviceAccount": { "email": "${SA}" },
    "instances": [{ "policy": { "machineType": "e2-standard-2", "provisioningModel": "STANDARD" } }] },
  "logsPolicy": { "destination": "CLOUD_LOGGING" }
}
JSON
  gcloud batch jobs submit "${RUN}" --location="${GCP_REGION}" --project="${GCP_PROJECT_ID}" --config="$TMP/${RUN}.json" \
    2>&1 | grep -iE "^name:|state:" | head -2
  echo "SUBMITTED=${RUN}  (logs: Cloud Logging; output: gs://${GCS_BUCKET}/studies/${RUN}/outputs/)"
}

submit ecoli iML1515.xml BIOMASS_Ec_iML1515_core_75p37M EX_o2_e EX_glc__D_e EX_etoh_e \
  bacterium 511145 "Escherichia coli" MG1655 "K-12 MG1655"
submit yeast yeast-GEM.xml r_2111 r_1992 r_1714 r_1761 \
  yeast 559292 "Saccharomyces cerevisiae" S288C "S288C"
rm -rf "$TMP"
