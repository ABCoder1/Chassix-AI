# Transcriptomics / perturbation branch (DESeq2)

Differential expression with **DESeq2** (R/Bioconductor).

## Inputs (`studies/<RUN_ID>/inputs/`)

- `counts.csv` — raw **integer** count matrix; first column = gene id
  (`feature_id`), remaining columns = sample ids.
- `samples.csv` — sample sheet; columns `sample_id`, `condition` (the contrasted
  factor), plus optional covariates.
- `contrast.json` (optional) — `{"factor":"condition","test":"treated","reference":"control"}`.
  Defaults to the two levels of `condition`.

Column shape of the emitted DE table matches
`workflow-inputs/templates/gene-expression.csv`.

## Command

```
Rscript /opt/chassix/transcriptomics/deseq2_analysis.R
```

## Output (`studies/<RUN_ID>/outputs/`)

- `differential_expression.csv` — full DE table (artifact `de_table`).
- `bundle.transcriptomics.json` — `analyses.geneExpression` with `featureId`,
  `featureType:"gene"`, `log2FoldChange`, `pValue`, `adjustedPValue` (padj),
  `baseMean`, `unit:"log2FoldChange"`, `contrastId`, `method:"DESeq2 <version>"`.

`NA` statistics (independent filtering) become JSON `null`, never `0`. If no gene
passes filtering the section is `partial`; a run failure yields `failed`.
