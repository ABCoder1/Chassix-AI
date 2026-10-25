# Scientific Contracts (ADR-D10)

**Owner:** scientific lead (teammate).
**Status: Signed off — 2026-10-24.** Branch set, minimum-evidence policy, and benchmark approach
are confirmed; specific tool versions and rubric/compatibility weights are approved to proceed as
defaults and **tuned later against performance metrics**. Until the live engine is wired, the
execution layer runs on a `FakeExecutor` with clearly-labeled illustrative contracts; no fabricated
result is ever presented as real. Sign-off unblocks wiring the real engine (ADR-D4, Nextflow).

Filling these in is a **data/config change**, not a rewrite: the `ExecutorAdapter` interface, run
manifest, and branch I/O schemas are already in place.

## Analysis branch set (confirmed)

Five analytical branches (expanded from three per scientific-lead review 2026-10-24):

1. **Genomics**
2. **Transcriptomics / perturbation**
3. **Pathways**
4. **Metabolomics** _(added)_
5. **Flux analysis / fluxomics — for yield predictions** _(added)_

## 1. Tools per branch (exact names + versions, from bioconda)

| Branch                         | Step                                                 | Tool (defaults — tune later)                 | Notes                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Genomics                       | QC                                                   | FastQC `0.12.x`                              |                                                                                                                                                 |
| Genomics                       | assembly/annotation QC                               | assembly/annotation QC pipeline              | **Only for novel microbes.** For microbes where this is already done, **bypass** and use the publicly available data instead (scientific lead). |
| Transcriptomics / perturbation | differential expression                              | DESeq2                                       |                                                                                                                                                 |
| Pathways                       | enrichment                                           | clusterProfiler                              |                                                                                                                                                 |
| Metabolomics                   | peak detection / processing + annotation             | XCMS (+ MetaboAnalystR for downstream stats) | Illustrative defaults; confirm final tool + version.                                                                                            |
| Flux analysis (fluxomics)      | constraint-based flux balance → **yield prediction** | COBRApy (FBA / parsimonious FBA)             | Yields predicted from the genome-scale metabolic model; 13C-MFA a later option.                                                                 |

## 2. Branch input / output schemas

- **Genomics** — inputs FASTA/GFF + read sets; validated output artifacts: assembly/annotation QC report (novel microbes) or referenced public assembly.
- **Transcriptomics / perturbation** — count-matrix + metadata; contrast/replicate requirements; outputs: contrast tables + uncertainty.
- **Pathways** — pathway table / model-file; outputs: mapping + enrichment with method assumptions.
- **Metabolomics** — metabolite table / model-file; outputs: processed + annotated metabolite table.
- **Flux analysis** — flux table / genome-scale metabolic model file; outputs: flux distribution **and predicted yields** (with the objective/constraints recorded in the manifest).

## 3. Minimum evidence policy (BF-08)

- **Confirmed.** Proceed only with ≥1 validated analytical branch + traceable input metadata.

## 4. Ranking rubric weights (BF-02, Step 2.2)

- **Approved to proceed** with the current `@chassix/planner` defaults (evidence coverage, freshness, conflicting findings, #sources, tradeoffs); **tune later** based on performance metrics.

## 5. Compatibility policy (Step 2.6)

- **Approved to proceed** with the `@chassix/datasets` default warn/block table; **tune later** based on performance metrics.

## 6. Benchmark expectations

- **Confirmed.** A reference run + expected outcome feeds the Phase 6 fixture matrix.

---

**Signed off:** scientific lead — 2026-10-24.
Next: record the chosen tools in `docs/decisions.md` (ADR-D10) and wire the live executor when
the Nextflow host is available. Tool versions and weights are revisable via a new ADR as they are
tuned against performance metrics.
