# Metabolomics branch (XCMS + MetaboAnalystR)

LC/GC-MS peak detection with **XCMS**, downstream statistics with
**MetaboAnalystR** (R/Bioconductor).

## Inputs (`studies/<RUN_ID>/inputs/`)

Two supported shapes:

1. **Raw MS (XCMS path):** `raw/*.mzML` | `*.mzXML` | `*.CDF` + `samples.csv`
   (`sample_id`, `group`). XCMS runs centWave peak picking → Obiwarp RT
   correction → peak-density grouping → fill, producing a peak-area feature
   matrix; group-wise log2 fold change + Welch t-test (BH-adjusted) are added.
2. **Pre-quantified table:** `metabolites.csv` following
   `workflow-inputs/templates/metabolites.csv`. Native values pass through;
   supplied statistics are kept (not recomputed on unknown replicates).

## Command

```
Rscript /opt/chassix/metabolomics/metabolomics_analysis.R
```

## Output (`studies/<RUN_ID>/outputs/`)

- `metabolite_features.csv` — processed feature table (artifact).
- `bundle.metabolomics.json` — `analyses.metabolomics` with `featureId`, `name`,
  `value`, `unit` (native, e.g. `peak_area` or `µM`), `change`, `changeUnit`,
  `pValue`, `adjustedPValue`, `conditionId`.

Units stay native (peak area is not rescaled). Features without a numeric `value`
are dropped (the `value` field is schema-required) and the section becomes
`partial` with a count in `notAvailableReason`.

## Note

MetaboAnalystR is not on CRAN/Bioconductor; the `Dockerfile` installs it from
GitHub at a pinned tag with its dependency set. Pin `<TAG>`/version to taste.
