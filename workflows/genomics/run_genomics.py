#!/usr/bin/env python3
"""Genomics branch -- FastQC read QC (+ optional assembly/annotation QC).

Branch contract (docs/scientific-contracts.md):
  * QC with FastQC 0.12.x on the study's read sets.
  * Assembly/annotation QC ONLY for novel microbes. For microbes already
    assembled/annotated, this branch is bypassed and the public assembly is
    referenced instead (scientific-lead policy). We honor that: if
    CHASSIX_NOVEL_MICROBE is not "true", assembly QC is skipped and the public
    assembly (if provided) is recorded as a reference artifact.

SCHEMA NOTE (see workflows/README.md): genomics has no numeric analysis section
in analysis-bundle.schema.json v1.0.0. We therefore emit the QC reports as
first-class ARTIFACTS and set analyses.geneExpression to status "not_run" with a
reason (this branch does not compute differential expression). The dashboard
reads the QC artifacts; no numeric section is fabricated.

Inputs (CHASSIX_INPUTS_DIR, by default gs://.../studies/<RUN>/inputs):
  * reads/*.fastq.gz | reads/*.fq.gz | reads/*.fastq   -- sequencing reads.
  * assembly.fasta (optional)                           -- for novel-microbe QC.
  * annotation.gff (optional)                           -- for novel-microbe QC.

Output: analyses.geneExpression status "not_run" + artifacts listing every
FastQC report (and any assembly/annotation QC report or referenced assembly).
"""
from __future__ import annotations

import argparse
import glob
import os
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common"))
sys.path.insert(0, "/opt/chassix/common")
import emit_bundle  # noqa: E402

READ_GLOBS = ("*.fastq.gz", "*.fq.gz", "*.fastq", "*.fq")


def find_reads(inputs_dir: str) -> List[str]:
    reads_dir = os.path.join(inputs_dir, "reads")
    search_dirs = [reads_dir, inputs_dir]
    found: List[str] = []
    for d in search_dirs:
        if not os.path.isdir(d):
            continue
        for pat in READ_GLOBS:
            found.extend(glob.glob(os.path.join(d, pat)))
        if found:
            break
    return sorted(set(found))


def fastqc_version() -> str:
    try:
        out = subprocess.run(["fastqc", "--version"], capture_output=True, text=True, check=True)
        return out.stdout.strip() or "FastQC"
    except Exception:
        return "FastQC"


def run(args: argparse.Namespace) -> int:
    inputs_dir = args.inputs_dir
    out_dir = args.qc_dir
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    out_base = args.output_uri_base or f"file://{os.path.abspath(out_dir)}"
    method = fastqc_version()

    reads = find_reads(inputs_dir)
    if not reads:
        reason = f"No read files (*.fastq.gz / *.fq.gz) found under {inputs_dir}/reads."
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={"geneExpression": _gap_section(reason, method, [])},
        )
        return 1

    # ---- run FastQC on all read files ---------------------------------------
    try:
        subprocess.run(
            ["fastqc", "--outdir", out_dir, "--extract", *reads],
            check=True,
        )
    except FileNotFoundError:
        reason = "FastQC binary not found on PATH in this image."
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={"geneExpression": emit_bundle.failed_section(reason, method=method)},
        )
        return 1
    except subprocess.CalledProcessError as exc:
        reason = f"FastQC exited with status {exc.returncode}."
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={"geneExpression": emit_bundle.failed_section(reason, method=method)},
        )
        return 1

    # ---- collect QC artifacts (html + zip reports) --------------------------
    artifacts: List[Dict[str, Any]] = []
    artifact_ids: List[str] = []
    for report in sorted(glob.glob(os.path.join(out_dir, "*_fastqc.html")) +
                         glob.glob(os.path.join(out_dir, "*_fastqc.zip"))):
        base = os.path.basename(report)
        aid = "fastqc_" + base.replace(".", "_")
        media = "text/html" if base.endswith(".html") else "application/zip"
        artifacts.append(emit_bundle.make_artifact(
            aid, f"{out_base}/{base}", role="fastqc-report",
            media_type=media, local_path=report))
        artifact_ids.append(aid)

    # ---- optional assembly / annotation QC (novel microbes only) ------------
    novel = os.environ.get("CHASSIX_NOVEL_MICROBE", "false").lower() == "true"
    assembly = os.path.join(inputs_dir, "assembly.fasta")
    annotation = os.path.join(inputs_dir, "annotation.gff")
    note_extra = ""
    if novel:
        # Placeholder for the assembly/annotation QC pipeline (e.g. QUAST/BUSCO).
        # The concrete tool is TBD in docs/scientific-contracts.md ("assembly/
        # annotation QC pipeline"); when wired, run it here and attach its report.
        # We still record the provided assembly/annotation as input artifacts.
        if os.path.exists(assembly):
            artifacts.append(emit_bundle.make_artifact(
                "assembly_fasta", f"file://{os.path.abspath(assembly)}",
                role="assembly-fasta", media_type="text/x-fasta", local_path=assembly))
            artifact_ids.append("assembly_fasta")
        if os.path.exists(annotation):
            artifacts.append(emit_bundle.make_artifact(
                "annotation_gff", f"file://{os.path.abspath(annotation)}",
                role="annotation-gff", media_type="text/x-gff3", local_path=annotation))
            artifact_ids.append("annotation_gff")
        note_extra = (" Novel microbe: assembly/annotation inputs recorded; "
                      "run the assembly/annotation QC pipeline (QUAST/BUSCO, TBD) "
                      "to attach a QC report.")
    else:
        if os.path.exists(assembly):
            artifacts.append(emit_bundle.make_artifact(
                "public_assembly", f"file://{os.path.abspath(assembly)}",
                role="public-assembly-reference", media_type="text/x-fasta",
                local_path=assembly))
            artifact_ids.append("public_assembly")
        note_extra = (" Not a novel microbe: assembly/annotation QC bypassed per "
                      "scientific-lead policy; public assembly referenced if provided.")

    reason = ("Genomics QC branch: read-quality reports are attached as artifacts. "
              "analysis-bundle.schema.json v1.0.0 has no numeric genomics section, "
              "so geneExpression is 'not_run' here (no differential expression "
              "computed)." + note_extra)

    emit_bundle.write_bundle(
        output_path=args.output,
        analyses={"geneExpression": _gap_section(reason, method, artifact_ids)},
        artifacts=artifacts,
    )
    return 0


def _gap_section(reason: str, method: str, artifact_ids: List[str]) -> Dict[str, Any]:
    """geneExpression not_run carrier for the genomics schema gap."""
    return {
        "status": "not_run",
        "method": method,
        "notAvailableReason": reason,
        "artifactIds": artifact_ids,
        "contrastId": None,
        "results": [],
    }


def main() -> int:
    p = argparse.ArgumentParser(description="FastQC genomics QC branch.")
    p.add_argument("--inputs-dir", default=os.environ.get("CHASSIX_INPUTS_DIR", "/inputs"))
    p.add_argument("--qc-dir", default=os.environ.get("CHASSIX_QC_DIR", "/outputs/fastqc"))
    p.add_argument("--output", default=os.environ.get("CHASSIX_OUTPUT", "/outputs/bundle.genomics.json"))
    p.add_argument("--output-uri-base", default=os.environ.get("CHASSIX_QC_URI_BASE"),
                   help="Base URI for QC artifacts, e.g. gs://BUCKET/studies/RUN/outputs/fastqc")
    return run(p.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
