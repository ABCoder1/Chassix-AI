# Multi-omics POC demo (CalHacks)

Produces the demo bundles the visualizer renders for **S. cerevisiae S288C** and
**E. coli K-12 MG1655** — condition-specific flux maps plus the other omics layers.

## What is real vs illustrative

| Section in each bundle                                        | Source                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `flux` (per-reaction flux)                                    | **Real** — COBRApy pFBA on the genome-scale model                                                      |
| `yield` (byproduct yields)                                    | **Real** — predicted from the pFBA solution                                                            |
| `comparison.json` growth / secretion / active-reaction counts | **Real** — from the two FBA solutions                                                                  |
| `geneExpression` (transcriptomics + proteomics)               | **Illustrative**, literature-informed — labelled in the section `method`, NOT a computed DESeq2 result |
| `metabolomics`                                                | **Illustrative**, literature-informed — labelled, NOT a computed XCMS result                           |

The flux branch that computes the real part is the actual pipeline script
`workflows/flux/flux_analysis.py` (COBRApy FBA/pFBA), run locally here instead of
on GCP Batch. The two conditions (`aerobic_glucose`, `oxygen_limited`) are real
constraint changes (O₂ uptake bound), so the flux maps genuinely differ by
condition — both organisms switch from respiration to fermentation under O₂
limitation (ethanol/acetate secretion, ~3.5× lower growth).

Literature sections are informed by the datasets in the brief (GSE11452,
PRECISE-1K, PXD016519 / ProteomICA, ST001421); the omics→model integration that
would make them _computed_ condition-specific constraints (E-Flux/GIMME/iMAT) and
a first-class cross-organism comparison stage are **not yet implemented** — this
POC fills those gaps from literature, clearly labelled, for visualization.

## Regenerate

Requires COBRApy and the two SBML models (not committed — ~11 MB each):

```bash
# models
curl -sSL -o /tmp/models/iML1515.xml  http://bigg.ucsd.edu/static/models/iML1515.xml
curl -sSL -o /tmp/models/yeast-GEM.xml https://raw.githubusercontent.com/SysBioChalmers/yeast-GEM/main/model/yeast-GEM.xml

# COBRApy in a venv
python3 -m venv /tmp/fluxenv && /tmp/fluxenv/bin/pip install cobra

# build (writes apps/visualizer/public/demo/)
/tmp/fluxenv/bin/python scripts/poc/build_demo.py \
  --models-dir /tmp/models --work-dir /tmp/poc --python /tmp/fluxenv/bin/python
```

## View

```bash
pnpm --filter @chassix/visualizer dev
```

Then open the demo index at `http://localhost:5173/demo/index.html`, or deep-link
a single bundle, e.g. `http://localhost:5173/?bundleUrl=/demo/ecoli-oxygen_limited.json`.

## Outputs (`apps/visualizer/public/demo/`)

- `ecoli-aerobic_glucose.json`, `ecoli-oxygen_limited.json`
- `yeast-aerobic_glucose.json`, `yeast-oxygen_limited.json`
- `comparison.json` — real cross-organism summary
- `index.html` / `index.json` — clickable demo index + manifest
