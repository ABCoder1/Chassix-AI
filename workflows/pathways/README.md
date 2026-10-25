# Pathways branch (clusterProfiler)

Functional / pathway enrichment with **clusterProfiler** (R/Bioconductor).

## Inputs (`studies/<RUN_ID>/inputs/`)

- `de_table.csv` (preferred) — DESeq2 output. Genes with `adjusted_p_value <
alpha` form the enrichment gene list.
- `genes.txt` — one gene id per line (over-representation only).
- `params.json` (optional) —
  `{"orgDb":"org.EcK12.eg.db","keyType":"SYMBOL","ont":"BP","alpha":0.05,"pAdjustMethod":"BH"}`.
  **The named OrgDb must be installed in the image** (see `Dockerfile`).

## Command

```
Rscript /opt/chassix/pathways/enrichment.R
```

## Output (`studies/<RUN_ID>/outputs/`)

- `enrichment_table.csv` — full enrichment result (artifact `enrichment_table`).
- `bundle.pathways.json` — see schema gap below.

## Schema gap (IMPORTANT — raise with the dashboard owner)

`analysis-bundle.schema.json` v1.0.0 has **no first-class enrichment section**,
and `analyses` is `additionalProperties:false`. We therefore do **not**:

- invent an `enrichment` key (forbidden), nor
- misuse `flux.pathwaySummaries` (those carry a `flux` value in flux units —
  enrichment has no flux), nor `metabolomics`.

Instead the enrichment table is emitted as a **first-class artifact**, and
`analyses.geneExpression` is set to `status:"not_run"` with a `notAvailableReason`
explaining the gap and `artifactIds:["enrichment_table"]` so the dashboard can
still surface the results. No unsupported numeric section is fabricated.

**Action item:** add an `enrichment` analysis definition to the schema (pathway
id, name, geneRatio, bgRatio, pValue, adjustedPValue, qValue, geneIds) so these
results get native, queryable fields.
