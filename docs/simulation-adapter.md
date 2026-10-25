# Simulation adapter contract

The workstation calls a typed adapter with the selected chassis and environment. The current `demoSimulationAdapter` is a deterministic UI fixture; it does not run a biological model, read experimental data, or predict a real fermentation outcome.

## Input

```ts
type SimulationInput = {
  schemaVersion: 1;
  chassisId: 'yeast' | 'bacterium' | 'archaeon';
  environment: {
    temperature: number; // °C
    salinity: number;   // mol/L as entered by the UI
    ph: number;
  };
};
```

## Output

An adapter returns a `SimulationResult` from `apps/web/src/simulation.ts`. It contains a response summary, gene activity indices, pathway activity proxies, metabolite pool indices, schematic bond states, and a relative yield comparison. Each index is 0–100; bond states are `stable`, `forming`, `rearranging`, `weakening`, or `broken`.

For each demo pathway, the UI exposes the calculation as:

```text
relative flux index = clamp(baseline + temperature adjustment + salinity adjustment + pH adjustment + combined-stress adjustment, 0, 100)
```

The resulting `rFU` (relative flux units) are interface-only values. When no organism-specific pathway fixture exists, the demo shows a generic throughput placeholder calculated as `round(ATP index × carbon index × redox index / 10,000)`. Neither calculation is a stoichiometric model, flux-balance analysis, or measured biochemical flux. Replace these demo equations with a validated reaction network, flux bounds, objective, and organism-specific inputs before presenting scientific flux results.

The current result includes `provider: 'demo-heuristic-v1'` and `illustrative: true`. A real service should identify its model and version in `provider`, set `illustrative` according to its validation status, and include only outputs it can support. Experimental fluxes, metabolite concentrations, expression fold changes, and product titers need their native units, provenance, and uncertainty in a versioned API contract before replacing these indices.

## Connecting the service

Implement `SimulationAdapter.simulate(input, signal)` in a small service module and replace the `demoSimulationAdapter` import/use in `App.tsx`. The `AbortSignal` is cancelled when the user changes the chassis or stress inputs, so the adapter should stop obsolete requests. Keep display-only estimates clearly separated from measured values and return explicit missing-data states rather than fabricated gene or pathway results.

The bond layer is a schematic interaction visualization. A future molecular dynamics or structure-aware result must define what each edge represents and how its confidence maps to the displayed state before these links can be described as chemical bonds.
