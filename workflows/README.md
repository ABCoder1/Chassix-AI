# Chassix-AI analysis workflows

One subfolder per supported analysis branch. Each holds a **Dockerfile** (the
real tool), a **GCP Batch** job spec (`batch-<branch>.json`), a **real analysis
script**, and a `README.md`. These images are what launch on Google Cloud when a
user starts a study; each emits an **analysis-bundle fragment** that conforms to
[`packages/analysis-bundle/analysis-bundle.schema.json`](../packages/analysis-bundle/analysis-bundle.schema.json)
(schema v1.0.0).

> These scripts are written to be correct and runnable **in principle**. They are
> not executed in this repo (no Docker / GCP credentials here). Placeholders are
> clearly marked and listed below.

## Branches

| Branch             | Tool (contract)                                          | Base image                         | Inputs                                                             | Output bundle section                                                   |
| ------------------ | -------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `genomics/`        | FastQC 0.12.1 (+ assembly/annotation QC, novel microbes) | `mambaorg/micromamba`              | `reads/*.fastq.gz` (+ optional `assembly.fasta`, `annotation.gff`) | `artifacts` (QC reports) + `geneExpression: not_run`                    |
| `transcriptomics/` | DESeq2 (Bioconductor)                                    | `bioconductor/bioconductor_docker` | `counts.csv`, `samples.csv`, opt `contrast.json`                   | `analyses.geneExpression`                                               |
| `pathways/`        | clusterProfiler (Bioconductor)                           | `bioconductor/bioconductor_docker` | `de_table.csv` or `genes.txt`, opt `params.json`                   | `artifacts` (enrichment table) + `geneExpression: not_run` (schema gap) |
| `metabolomics/`    | XCMS + MetaboAnalystR (Bioconductor)                     | `bioconductor/bioconductor_docker` | `raw/*.mzML` + `samples.csv`, or `metabolites.csv`                 | `analyses.metabolomics`                                                 |
| `flux/`            | COBRApy 0.29.0 FBA/pFBA (pip)                            | `python:3.12-slim`                 | `model.xml` (SBML), opt `constraints.json`                         | `analyses.flux` + `analyses.yield`                                      |

`flux/` is the **yield-prediction** branch: FBA/pFBA produces both a flux
distribution and predicted product yields (`kind: "predicted"`).

There is deliberately **no `perturbation/` workflow**: "Transcriptomics / perturbation" is one
branch (DESeq2 differential expression across perturbation conditions _is_ the perturbation
analysis), so `transcriptomics/` covers it. A plan whose branch is named `perturbation` or
`transcriptomics_perturbation` is resolved to the `transcriptomics` workflow by the executor.

## Shared helper (`common/`)

- `emit_bundle.py` — the single, stdlib-only assembler. Fills `run` / `organism`
  / `condition` from `CHASSIX_*` env vars, computes artifact `sha256`, sets
  `schemaVersion: "1.0.0"`, runs structural validation (plus full `jsonschema`
  validation when that package and the schema file are available), and writes the
  bundle. It marks a section `failed` with a `notAvailableReason` on error and
  **never fabricates numeric results** (a section claiming `available`/`partial`
  must carry rows; `failed`/`not_run` must not).
- `emit_bundle.R` — thin bridge: R branches do their science, serialize their
  native `results` + `artifacts` to JSON, and call `emit_bundle.py` so there is
  one assembly/validation path for every branch.

## How a study launch maps to a Batch job

1. The control plane stages the study's inputs to
   `gs://GCS_BUCKET/studies/<RUN_ID>/inputs/`.
2. It takes `batch-<branch>.json`, substitutes the placeholders below, and submits
   it:
   ```
   gcloud batch jobs submit chassix-<branch>-<RUN_ID> \
     --location REGION --config batch-<branch>.json
   ```
3. Batch pulls `REGION-docker.pkg.dev/PROJECT_ID/chassix/<branch>:latest`, mounts
   the bucket via **gcsFuse** at `/mnt/disks/gcs`, and runs the container.
4. The container reads inputs from `…/studies/<RUN_ID>/inputs/` and writes
   `…/studies/<RUN_ID>/outputs/bundle.<branch>.json` (plus table artifacts).
5. The control plane validates the bundle against the schema and hands it to the
   dashboard adapter.

Build + push an image, e.g.:

```
docker build -f workflows/<branch>/Dockerfile -t \
  REGION-docker.pkg.dev/PROJECT_ID/chassix/<branch>:latest workflows/
docker push REGION-docker.pkg.dev/PROJECT_ID/chassix/<branch>:latest
```

(Build context is `workflows/` so the Dockerfile can `COPY common/`.)

## Placeholders the user must set

In each `batch-<branch>.json` (and image URIs):

| Placeholder                                             | Meaning                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `PROJECT_ID`                                            | GCP project id                                                      |
| `REGION`                                                | GCP region (e.g. `us-central1`), used for Batch + Artifact Registry |
| `GCS_BUCKET`                                            | study bucket name (no `gs://`)                                      |
| `RUN_ID`                                                | the study/run id (names the `studies/<RUN_ID>/…` prefix)            |
| `WORKFLOW_VERSION`                                      | workflow version string (or remove the var)                         |
| `CONDITION_ID`                                          | condition id reused as `conditionId` on result rows                 |
| `TAXON_ID` / `TAXON_NAME` / `STRAIN_ID` / `STRAIN_NAME` | organism metadata                                                   |
| `CHASSIX_ORGANISM_CHASSIS`                              | `yeast` \| `bacterium` \| `archaeon` \| `other`                     |

Branch-specific: the **pathways** image must contain the **OrgDb** for the study
organism (`params.json.orgDb`); the **metabolomics** `Dockerfile` pins a
MetaboAnalystR `<TAG>`; **genomics** uses `CHASSIX_NOVEL_MICROBE=true|false`.

## Schema gaps (raise with the dashboard / schema owner)

- **Pathways enrichment has no first-class section.** `analyses` is
  `additionalProperties:false`, so we must not invent an `enrichment` key and must
  not misuse `flux.pathwaySummaries` (which require a `flux` value in flux units)
  or `metabolomics`. Enrichment results are emitted as an **artifact**, with
  `geneExpression: not_run` carrying the reason + `artifactIds`. Proposed fix: add
  an `enrichment` analysis def (pathway id, name, geneRatio, bgRatio, pValue,
  adjustedPValue, qValue, geneIds). See `pathways/README.md`.
- **Genomics has no numeric section.** QC reports are emitted as artifacts with
  `geneExpression: not_run`. Fine for now, but a genomics/QC summary def would let
  the dashboard show pass/warn/fail per module natively.

## No fabrication

Every script keeps **native units** (no rescaling to a 0–100 index), distinguishes
`measured` / `predicted` / `derived`, uses `null` for unknown scalars, and
surfaces missing or failed analyses as an explicit `status`
(`not_run` / `partial` / `failed`) with a `notAvailableReason`. No result is ever
invented, zero-filled, or guessed.
