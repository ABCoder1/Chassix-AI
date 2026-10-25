# Flux analysis / fluxomics branch (COBRApy) — the yield-prediction branch

Constraint-based flux balance with **COBRApy** (FBA / parsimonious FBA),
producing a flux distribution **and** predicted product yields.

## Inputs (`studies/<RUN_ID>/inputs/`)

- `model.xml` | `model.sbml` — genome-scale metabolic model (SBML, required).
- `constraints.json` (optional):

  ```json
  {
    "objective": "BIOMASS_Ec_iML1515_core_75p37M",
    "medium": { "EX_glc__D_e": 10.0, "EX_o2_e": 1000.0 },
    "bounds": { "PFK": { "lower": 0, "upper": 1000 } },
    "yields": [
      {
        "id": "succ_per_glc",
        "productReaction": "EX_succ_e",
        "substrateReaction": "EX_glc__D_e",
        "unit": "mol/mol"
      }
    ]
  }
  ```

  For `unit: "g/g"` also supply `productMW` and `substrateMW`; without them the
  yield is emitted as `mol/mol` rather than guessed.

Flux table column shape matches `workflow-inputs/templates/reaction-fluxes.csv`;
yields match `workflow-inputs/templates/yield-measurements.csv`.

## Command

```
python /opt/chassix/flux/flux_analysis.py
```

## Output (`studies/<RUN_ID>/outputs/`)

- `flux_distribution.csv` — full flux distribution (artifact `flux_table`).
- `bundle.flux.json`:
  - `analyses.flux` — `reactionId`, `flux`, `unit:"mmol/gDW/h"`, `conditionId`,
    `lowerBound`, `upperBound`, with `modelId` and `objective`.
  - `analyses.yield` — predicted yields with `kind:"predicted"`, native units
    (`mol/mol` / `g/g`), `conditionId`. Emitted only when a yield spec is given
    and the substrate is actually consumed; otherwise `not_run` with a reason.

Flux stays a **signed native quantity** (mmol/gDW/h) — never rescaled to a 0–100
index. Yields are computed from the actual pFBA solution, never fabricated. A
missing model, failed solve, or non-optimal status yields `failed` sections.
