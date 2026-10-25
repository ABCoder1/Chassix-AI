# Workflow analysis input contract

This folder is a handoff contract for the agent that connects real Chassix-AI workflow results to the dashboard. It does not contain experimental or model-generated results. The CSVs are header-only templates; analysis-bundle.template.json is an empty, valid-shaped bundle to fill with reviewed data.

## Files

- analysis-bundle.schema.json defines the versioned normalized JSON payload.
- analysis-bundle.template.json shows the payload shape without invented measurements.
- templates/gene-expression.csv accepts differential-expression results.
- templates/reaction-fluxes.csv accepts reaction-level fluxes from a validated constraint-based model.
- templates/metabolites.csv accepts measured or predicted metabolite values with units.
- templates/yield-measurements.csv accepts measured or predicted product/yield values.

Workflow tools may emit other formats. Normalize their output into this contract while preserving the source files and provenance; do not edit raw analysis outputs to make them fit a visualization.

## Data rules

- Include organism, strain, condition, contrast, run/model version, and source artifact identifiers wherever available.
- Keep native values and units. Flux must remain a signed quantity in its native unit (for example, mmol/gDW/h); do not convert it to the dashboard's demo-only 0–100 index or relative flux units.
- Mark each analysis as available, partial, not_run, or failed. Leave result arrays empty when unavailable and explain why in notAvailableReason.
- Distinguish measured, predicted, and derived values. Include confidence intervals or other uncertainty when the source supports them.
- Use stable gene, reaction, metabolite, and pathway identifiers, not display labels alone.
- Never fill missing measurements with demo values, zeroes, or guessed values.

Validate the bundle against analysis-bundle.schema.json before passing it to an adapter. A schema-valid bundle can still be scientifically invalid; workflow and domain review remain necessary.
