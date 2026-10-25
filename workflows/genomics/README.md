# Genomics branch (FastQC)

Read quality control with **FastQC 0.12.x**, plus optional assembly/annotation QC
for novel microbes.

## Inputs (`studies/<RUN_ID>/inputs/`)

- `reads/*.fastq.gz` | `*.fq.gz` | `*.fastq` — sequencing read sets (required).
- `assembly.fasta` (optional) — assembly to QC (novel microbes) or to reference
  (established microbes).
- `annotation.gff` (optional) — annotation for novel-microbe QC.

Set `CHASSIX_NOVEL_MICROBE=true` for novel microbes. When false (default),
assembly/annotation QC is **bypassed** per scientific-lead policy and the public
assembly is recorded as a reference artifact only.

## Command

```
python /opt/chassix/genomics/run_genomics.py
```

(The container `ENTRYPOINT`; Batch sets the `CHASSIX_*` env vars.)

## Output (`studies/<RUN_ID>/outputs/`)

- `fastqc/*_fastqc.html` + `*_fastqc.zip` — FastQC reports (artifacts).
- `bundle.genomics.json` — bundle whose `artifacts` list every QC report and
  whose `analyses.geneExpression` is `not_run`.

## Schema note

Genomics has **no numeric section** in `analysis-bundle.schema.json` v1.0.0. QC
results are surfaced as artifacts; `geneExpression` carries `status: "not_run"`
with a reason and `artifactIds` pointing at the reports. No numeric section is
fabricated. See the top-level `workflows/README.md` schema-gap note.

The assembly/annotation QC tool (QUAST/BUSCO) is marked TBD in
`docs/scientific-contracts.md`; the hook is in `run_genomics.py` for novel
microbes but the concrete QC invocation is a documented placeholder.
