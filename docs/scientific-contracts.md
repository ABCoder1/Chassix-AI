# Scientific Contracts — sign-off needed (ADR-D10)

**Owner:** _scientific lead (teammate) — please review and sign off._
**Status:** OPEN. Until this is signed off, the execution layer runs on a `FakeExecutor` with
**illustrative, clearly-labeled** tool contracts. No fabricated result is ever presented as real
(cross-cutting rule). Signing off unblocks wiring the real workflow engine (ADR-D4, Nextflow) and
real tools.

The engineering is built so that filling this in is a **data/config change**, not a rewrite: the
`ExecutorAdapter` interface, run manifest, and branch I/O schemas are already in place.

## What we need from you

For the **pilot vertical slice (genomics branch first)**, please confirm:

### 1. Tools per branch (exact names + versions, from bioconda)

| Branch                         | Step                    | Proposed (illustrative) | Confirm / change |
| ------------------------------ | ----------------------- | ----------------------- | ---------------- |
| Genomics                       | QC                      | FastQC `0.12.x`         |                  |
| Genomics                       | assembly/annotation QC  | _tbd_                   |                  |
| Transcriptomics / perturbation | differential expression | DESeq2                  |                  |
| Pathways                       | enrichment              | clusterProfiler         |                  |

### 2. Branch input / output schemas

- Genomics inputs (e.g. FASTA/GFF, read sets) and the exact **output artifacts** we validate before marking a branch `Succeeded`.
- Transcriptomics: count-matrix + metadata shape; contrast/replicate requirements.
- Pathways: pathway table / model-file format.

### 3. Minimum evidence policy (BF-08)

- MVP default encoded: _proceed only with ≥1 validated analytical branch + traceable input metadata._ Confirm or adjust.

### 4. Ranking rubric weights (BF-02, Step 2.2)

- Current weights in `@chassix/planner` are **illustrative**. Please provide the criterion weights (evidence coverage, freshness, conflicting findings, #sources, tradeoffs) or confirm the defaults.

### 5. Compatibility policy (Step 2.6)

- Which checks **block** vs **warn** (taxonomy/strain, reference version, replicates, contrasts, gene identifiers, prerequisite availability). A default table is encoded in `@chassix/datasets`; confirm the warn/block split.

### 6. Benchmark expectations

- A reference run + expected outcome so the Phase 6 fixture matrix can assert correctness.

## How to sign off

Fill the tables above (or reply with the values) and mark this file **Signed off: <name> <date>**.
We then record a new ADR for the chosen tools and wire the live executor.
