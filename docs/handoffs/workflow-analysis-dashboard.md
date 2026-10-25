# Agent handoff: connect workflow analyses to the dashboard

## Objective

Replace the hard-coded demo response with validated Chassix-AI workflow results while keeping the digital-twin visualization responsive and preserving scientific provenance. The dashboard should show actual values and units when present, and clearly show missing or failed analyses when absent.

## Read first

1. workflow-inputs/README.md
2. workflow-inputs/analysis-bundle.schema.json
3. workflow-inputs/analysis-bundle.template.json
4. docs/simulation-adapter.md
5. apps/web/src/simulation.ts
6. apps/web/src/App.tsx
7. apps/web/src/SimulationDashboard.tsx
8. apps/web/src/CellScene.tsx and apps/web/src/DataViews.tsx

## Current boundary

- App.tsx imports demoSimulationAdapter; it is the only active provider.
- SimulationAdapter.simulate(input, signal) is the current async seam. The AbortSignal should cancel an obsolete request when the user changes chassis or conditions.
- SimulationResult currently contains demo-only normalized indices and pathway proxies. SimulationDashboard labels its flux values relative flux units; these must not be populated with real flux numbers.
- pathwayData.ts contains design fixtures for map geometry, node identifiers, and reference values. Its edges are not a validated metabolic network.
- The current bond visualization is schematic. Gene-expression changes alone do not establish chemical bonds or interaction states.

## Implementation sequence

1. Identify which existing workflow service or analysis artifacts will supply the bundle. Keep this dashboard integration independent of transport so a local file import can be used before a service endpoint exists.
2. Implement bundle parsing and schema validation. Reject malformed data with a useful message; handle missing, partial, and failed analysis sections without inventing values.
3. Add a production analysis result type or versioned adapter output that preserves raw flux, units, uncertainty, analysis status, run/model version, condition, and artifact provenance. Do not coerce real fluxes, expression values, concentrations, or titer into the demo 0–100 scales.
4. Add a provider that maps the bundle to the view model. Keep demoSimulationAdapter available only for an explicitly selected demo mode. Never mix demo and real values in one card without labeling each source.
5. Update the dashboard to display reaction/pathway flux with its native unit, gene statistics with contrast and adjusted p-value, metabolites with their concentration unit, and measured/predicted yield with replicate or uncertainty context.
6. Link every visible result to its source artifact and run metadata. Add an inspection view for method, model version, organism/strain, condition, and missing-data reasons.
7. Only drive interaction edges when an input artifact supports that interaction type and score. Otherwise keep the bond layer marked schematic or hide it in real-data mode.
8. Add a sample bundle test fixture based on a validated or explicitly synthetic test fixture, adapter mapping tests, schema validation tests, and UI tests for loading, error, partial-data, and stale-request states.

## Acceptance checks

- A bundle conforming to schema 1.0.0 can load and update the dashboard without refreshing the page.
- Reaction flux appears in its native signed value and unit; no actual output is labeled as relative flux units.
- Gene expression retains gene identifiers, contrast, log₂ fold change, and adjusted p-value.
- Metabolite and yield displays retain native units and mark measured, predicted, or derived values.
- Every value shown as real can be traced to a run, method/model version, organism/strain, condition, and source artifact where the input provides that information.
- Missing, failed, or unsupported data shows an explicit status and never falls back to a plausible-looking demo value.
- Changing conditions while a request is in flight cancels or ignores the stale response.
- The demo scenario remains reproducible and is visibly distinguished from workflow-backed results.

## Open integration details

The future agent should record the actual workflow endpoint or file handoff, authentication requirements, supported organisms/strains, data retention policy, artifact storage locations, model versions, and scientific owners for flux/yield interpretation. Do not guess these details from the visual prototype.
