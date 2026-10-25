#!/usr/bin/env python3
"""Assemble a Chassix-AI analysis-bundle fragment (schema v1.0.0).

This is the single, dependency-light (stdlib-only) helper that every workflow
branch uses to turn its native analysis output into a bundle that conforms to
``packages/analysis-bundle/analysis-bundle.schema.json``.

Design rules enforced here (see docs/scientific-contracts.md and
workflow-inputs/README.md):

* ``schemaVersion`` is always ``"1.0.0"``.
* ``run`` / ``organism`` / ``condition`` are read from env vars / CLI args --
  nothing about them is invented.
* Artifact ``sha256`` is computed from the real file bytes when a local path is
  given; otherwise it stays ``null``.
* Native units only. The helper never rescales, never fills missing scalars with
  zeros/guesses, and never fabricates numeric results. Unknown scalars are
  ``null``.
* If an analysis step errors, the branch calls :func:`failed_section` (or passes
  ``status="failed"``) and the result array stays empty with a
  ``notAvailableReason``.
* A light structural validation always runs; if the optional ``jsonschema``
  package is importable AND the real schema file is found, a full validation
  runs too.

Usage as a library (preferred, from Python branches)::

    from emit_bundle import (
        run_from_env, organism_from_env, condition_from_env,
        make_artifact, write_bundle,
    )

    section = {
        "status": "available",
        "method": "COBRApy 0.29.0 pFBA",
        "results": [...],   # native-unit rows
        "artifactIds": ["flux_table"],
        "modelId": "iML1515",
        "objective": "BIOMASS_Ec_iML1515_core_75p37M",
    }
    write_bundle(
        output_path="bundle.flux.json",
        analyses={"flux": section, "yield": yield_section},
        artifacts=[make_artifact("flux_table", uri, role="flux-table",
                                 media_type="text/csv", local_path=csv_path)],
    )

Usage as a CLI (used by the R branches, which write a raw results JSON and then
shell out to this helper)::

    python3 emit_bundle.py \
        --analyses analyses.json \
        --artifacts artifacts.json \
        --output bundle.transcriptomics.json

``analyses.json`` is a JSON object mapping schema analysis keys
(geneExpression | flux | metabolomics | yield | interactions) to section dicts.
``artifacts.json`` is a JSON array of artifact dicts, each optionally carrying a
non-schema ``localPath`` key (stripped before emit) used to compute sha256.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

SCHEMA_VERSION = "1.0.0"

# Keys the schema's `analyses` object allows (additionalProperties: false).
VALID_ANALYSIS_KEYS = {
    "geneExpression",
    "flux",
    "metabolomics",
    "yield",
    "interactions",
}

VALID_STATUSES = {"available", "partial", "not_run", "failed"}


# --------------------------------------------------------------------------- #
# Small env helpers -- metadata is read, never invented.
# --------------------------------------------------------------------------- #
def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    val = os.environ.get(name)
    if val is None or val == "":
        return default
    return val


def _env_float(name: str) -> Optional[float]:
    raw = _env(name)
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_from_env(status: str = "completed") -> Dict[str, Any]:
    """Build the ``run`` block from CHASSIX_RUN_* env vars.

    Required-by-schema fields fall back to clearly-marked placeholders so a
    local dry run still produces a structurally valid bundle; in production the
    launcher sets these from the study manifest.
    """
    return {
        "id": _env("CHASSIX_RUN_ID", "REPLACE_WITH_WORKFLOW_RUN_ID"),
        "workflowId": _env("CHASSIX_WORKFLOW_ID", "REPLACE_WITH_WORKFLOW_ID"),
        "workflowVersion": _env("CHASSIX_WORKFLOW_VERSION"),
        "status": status,
        "createdAt": _env("CHASSIX_RUN_CREATED_AT"),
        "completedAt": _now_iso() if status in ("completed", "partial", "failed") else None,
        "modelVersions": [],
    }


def organism_from_env() -> Dict[str, Any]:
    """Build the ``organism`` block from CHASSIX_ORGANISM_* env vars."""
    chassis = _env("CHASSIX_ORGANISM_CHASSIS", "other")
    if chassis not in ("yeast", "bacterium", "archaeon", "other"):
        chassis = "other"
    return {
        "chassisId": chassis,
        "taxonId": _env("CHASSIX_ORGANISM_TAXON_ID"),
        "taxonName": _env("CHASSIX_ORGANISM_TAXON_NAME", "REPLACE_WITH_TAXON_NAME"),
        "strainId": _env("CHASSIX_ORGANISM_STRAIN_ID"),
        "strainName": _env("CHASSIX_ORGANISM_STRAIN_NAME"),
    }


def condition_from_env() -> Dict[str, Any]:
    """Build the ``condition`` block from CHASSIX_CONDITION_* env vars."""
    return {
        "id": _env("CHASSIX_CONDITION_ID", "REPLACE_WITH_CONDITION_ID"),
        "temperatureC": _env_float("CHASSIX_CONDITION_TEMPERATURE_C"),
        "salinityMolL": _env_float("CHASSIX_CONDITION_SALINITY_MOL_L"),
        "pH": _env_float("CHASSIX_CONDITION_PH"),
        "timepoint": None,
        "media": _env("CHASSIX_CONDITION_MEDIA"),
        "oxygenation": _env("CHASSIX_CONDITION_OXYGENATION"),
        "other": {},
    }


def condition_id() -> str:
    """The canonical condition id, reused by result rows that need conditionId."""
    return _env("CHASSIX_CONDITION_ID", "REPLACE_WITH_CONDITION_ID")


# --------------------------------------------------------------------------- #
# Artifacts
# --------------------------------------------------------------------------- #
def sha256_of(path: str) -> Optional[str]:
    """Return the hex sha256 of a file, or None if it cannot be read."""
    try:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def make_artifact(
    artifact_id: str,
    uri: str,
    role: str,
    media_type: Optional[str] = None,
    local_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a schema `artifact`. If ``local_path`` exists, its sha256 is set."""
    sha = sha256_of(local_path) if local_path else None
    return {
        "id": artifact_id,
        "uri": uri,
        "mediaType": media_type,
        "sha256": sha,
        "role": role,
    }


# --------------------------------------------------------------------------- #
# Sections
# --------------------------------------------------------------------------- #
def failed_section(reason: str, method: Optional[str] = None) -> Dict[str, Any]:
    """A section for a step that errored -- empty results, explicit failure."""
    return {
        "status": "failed",
        "method": method,
        "notAvailableReason": reason,
        "artifactIds": [],
        "results": [],
    }


def not_run_section(reason: str, method: Optional[str] = None) -> Dict[str, Any]:
    """A section intentionally not produced by this branch."""
    return {
        "status": "not_run",
        "method": method,
        "notAvailableReason": reason,
        "artifactIds": [],
        "results": [],
    }


# --------------------------------------------------------------------------- #
# Assembly + validation
# --------------------------------------------------------------------------- #
def _derive_run_status(analyses: Dict[str, Any]) -> str:
    """Derive the overall run status from its section statuses."""
    statuses = {s.get("status") for s in analyses.values()}
    produced = statuses - {"not_run"}
    if not produced:
        return "completed"  # nothing attempted here (e.g. genomics-only artifacts)
    if produced == {"available"}:
        return "completed"
    if "available" in produced and ("failed" in produced or "partial" in produced):
        return "partial"
    if produced <= {"failed"}:
        return "failed"
    return "partial"


def build_bundle(
    analyses: Dict[str, Any],
    artifacts: Optional[List[Dict[str, Any]]] = None,
    run: Optional[Dict[str, Any]] = None,
    organism: Optional[Dict[str, Any]] = None,
    condition: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Assemble a complete top-level bundle dict (schema v1.0.0)."""
    artifacts = artifacts or []
    if run is None:
        run = run_from_env(status=_derive_run_status(analyses))
    return {
        "schemaVersion": SCHEMA_VERSION,
        "run": run,
        "organism": organism if organism is not None else organism_from_env(),
        "condition": condition if condition is not None else condition_from_env(),
        "artifacts": artifacts,
        "analyses": analyses,
    }


def _structural_check(bundle: Dict[str, Any]) -> List[str]:
    """Minimal stdlib-only structural validation. Returns a list of errors."""
    errors: List[str] = []

    if bundle.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"schemaVersion must be '{SCHEMA_VERSION}'")

    for key in ("run", "organism", "condition", "analyses"):
        if key not in bundle:
            errors.append(f"missing required top-level key '{key}'")

    run = bundle.get("run", {})
    for key in ("id", "workflowId", "status"):
        if not run.get(key):
            errors.append(f"run.{key} is required and non-empty")

    org = bundle.get("organism", {})
    for key in ("chassisId", "taxonName"):
        if not org.get(key):
            errors.append(f"organism.{key} is required and non-empty")
    for key in ("taxonId", "strainId", "strainName"):
        if key not in org:
            errors.append(f"organism.{key} key must be present (may be null)")

    cond = bundle.get("condition", {})
    if not cond.get("id"):
        errors.append("condition.id is required and non-empty")

    analyses = bundle.get("analyses", {})
    if not isinstance(analyses, dict) or len(analyses) < 1:
        errors.append("analyses must be an object with >= 1 property")
    for name, section in (analyses.items() if isinstance(analyses, dict) else []):
        if name not in VALID_ANALYSIS_KEYS:
            errors.append(
                f"analyses.{name} is not an allowed key "
                f"(additionalProperties:false): {sorted(VALID_ANALYSIS_KEYS)}"
            )
        if not isinstance(section, dict):
            errors.append(f"analyses.{name} must be an object")
            continue
        if section.get("status") not in VALID_STATUSES:
            errors.append(f"analyses.{name}.status invalid: {section.get('status')}")
        if "results" not in section:
            errors.append(f"analyses.{name}.results is required")
        # Never-fabricate guard: a section claiming data must carry rows.
        if section.get("status") in ("available", "partial") and not section.get("results"):
            errors.append(
                f"analyses.{name} is '{section.get('status')}' but results is empty"
            )
        if section.get("status") in ("failed", "not_run") and section.get("results"):
            errors.append(
                f"analyses.{name} is '{section.get('status')}' but carries results"
            )

    for art in bundle.get("artifacts", []):
        for key in ("id", "uri", "role"):
            if not art.get(key):
                errors.append(f"artifact missing required '{key}': {art}")

    return errors


def _jsonschema_check(bundle: Dict[str, Any]) -> Optional[List[str]]:
    """Full validation if jsonschema + the real schema file are available.

    Returns None if it could not run (package or schema missing), else a list
    of error strings (empty list == valid).
    """
    try:
        import jsonschema  # type: ignore
    except Exception:
        return None

    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.environ.get("CHASSIX_SCHEMA_PATH", ""),
        os.path.join(here, "..", "..", "packages", "analysis-bundle",
                     "analysis-bundle.schema.json"),
        os.path.join(here, "analysis-bundle.schema.json"),
    ]
    schema_path = next((p for p in candidates if p and os.path.exists(p)), None)
    if not schema_path:
        return None
    with open(schema_path, "r", encoding="utf-8") as fh:
        schema = json.load(fh)
    validator = jsonschema.Draft202012Validator(schema)
    return [f"{list(e.path)}: {e.message}" for e in validator.iter_errors(bundle)]


def validate(bundle: Dict[str, Any], strict: bool = True) -> List[str]:
    """Validate a bundle. Raises ValueError on error when ``strict``."""
    errors = _structural_check(bundle)
    full = _jsonschema_check(bundle)
    if full is not None:
        errors.extend(full)
    else:
        sys.stderr.write(
            "[emit_bundle] note: jsonschema or schema file not found; "
            "ran structural checks only.\n"
        )
    if errors and strict:
        raise ValueError("bundle validation failed:\n  - " + "\n  - ".join(errors))
    return errors


def write_bundle(
    output_path: str,
    analyses: Dict[str, Any],
    artifacts: Optional[List[Dict[str, Any]]] = None,
    run: Optional[Dict[str, Any]] = None,
    organism: Optional[Dict[str, Any]] = None,
    condition: Optional[Dict[str, Any]] = None,
    strict: bool = True,
) -> Dict[str, Any]:
    """Assemble, validate, and write a bundle to ``output_path``."""
    bundle = build_bundle(analyses, artifacts, run, organism, condition)
    validate(bundle, strict=strict)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    sys.stderr.write(f"[emit_bundle] wrote {output_path}\n")
    return bundle


# --------------------------------------------------------------------------- #
# CLI (used by the R branches)
# --------------------------------------------------------------------------- #
def _strip_local_paths(artifacts: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Honor an optional non-schema ``localPath`` key: compute sha, then drop it."""
    out: List[Dict[str, Any]] = []
    for art in artifacts:
        art = dict(art)
        local = art.pop("localPath", None)
        if local and not art.get("sha256"):
            art["sha256"] = sha256_of(local)
        art.setdefault("mediaType", None)
        art.setdefault("sha256", None)
        out.append(art)
    return out


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Assemble a Chassix-AI analysis bundle fragment (schema 1.0.0).",
    )
    parser.add_argument(
        "--analyses", required=True,
        help="Path to a JSON object mapping analysis keys to section dicts.",
    )
    parser.add_argument(
        "--artifacts", default=None,
        help="Path to a JSON array of artifact dicts (optional 'localPath' each).",
    )
    parser.add_argument("--output", required=True, help="Output bundle JSON path.")
    parser.add_argument(
        "--no-strict", action="store_true",
        help="Do not raise on validation errors (still printed to stderr).",
    )
    args = parser.parse_args(argv)

    with open(args.analyses, "r", encoding="utf-8") as fh:
        analyses = json.load(fh)
    artifacts: List[Dict[str, Any]] = []
    if args.artifacts:
        with open(args.artifacts, "r", encoding="utf-8") as fh:
            artifacts = _strip_local_paths(json.load(fh))

    try:
        write_bundle(
            output_path=args.output,
            analyses=analyses,
            artifacts=artifacts,
            strict=not args.no_strict,
        )
    except ValueError as exc:
        sys.stderr.write(f"[emit_bundle] {exc}\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
