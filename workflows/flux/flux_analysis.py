#!/usr/bin/env python3
"""Flux analysis / fluxomics branch -- COBRApy FBA + pFBA -> fluxes AND yields.

Branch contract (docs/scientific-contracts.md): constraint-based flux balance on
a genome-scale metabolic model, producing a flux distribution AND predicted
product yields. 13C-MFA is a later option.

Inputs (read from --inputs-dir, by default gs://.../studies/<RUN>/inputs mounted
via gcsFuse in the Batch spec):
  * model.xml | model.sbml               -- genome-scale metabolic model (SBML)
  * constraints.json (optional)          -- medium + objective + yield spec:
        {
          "objective": "BIOMASS_Ec_iML1515_core_75p37M",   // optional override
          "medium": {"EX_glc__D_e": 10.0, "EX_o2_e": 1000.0}, // uptake caps (>=0)
          "bounds": {"PFK": {"lower": 0, "upper": 1000}},     // optional overrides
          "yields": [                                          // product/substrate
            {"id": "succ_per_glc",
             "productReaction": "EX_succ_e",
             "substrateReaction": "EX_glc__D_e",
             "unit": "mol/mol",
             "productCarbon": 4, "substrateCarbon": 6}         // carbon counts
          ]
        }

Outputs (written to --output and --flux-csv):
  * analyses.flux  -- reactionId, reactionName, flux, unit "mmol/gDW/h",
                      conditionId, lowerBound, upperBound; modelId, objective.
  * analyses.yield -- predicted product yields (kind "predicted"), native units
                      (mol/mol or g/g); never fabricated -- only emitted when a
                      yield spec is given and both reactions carry a flux.

Units are native (mmol/gDW/h for flux). Yields are computed from the actual
pFBA solution, not guessed. If the solver fails or the model is missing, the
relevant section is marked "failed" with a reason and an empty result array.

Nothing here contacts the network. GCS I/O is handled by the gcsFuse mounts
declared in batch-flux.json; this script only touches local paths.
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from typing import Any, Dict, List, Optional

# Make the shared helper importable (container copies it to ../common).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common"))
sys.path.insert(0, "/opt/chassix/common")
import emit_bundle  # noqa: E402

FLUX_UNIT = "mmol/gDW/h"


def find_model(inputs_dir: str) -> Optional[str]:
    for name in ("model.xml", "model.sbml", "model.xml.gz", "model.sbml.gz"):
        path = os.path.join(inputs_dir, name)
        if os.path.exists(path):
            return path
    # Fall back to any single SBML-looking file.
    for fname in sorted(os.listdir(inputs_dir)) if os.path.isdir(inputs_dir) else []:
        if fname.lower().endswith((".xml", ".sbml")):
            return os.path.join(inputs_dir, fname)
    return None


def load_constraints(inputs_dir: str) -> Dict[str, Any]:
    import json
    path = os.path.join(inputs_dir, "constraints.json")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_flux_csv(path: str, rows: List[Dict[str, Any]]) -> None:
    cols = ["reaction_id", "reaction_name", "flux", "unit", "condition_id",
            "lower_bound", "upper_bound", "model_id"]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=cols)
        writer.writeheader()
        for r in rows:
            writer.writerow({
                "reaction_id": r["reactionId"],
                "reaction_name": r.get("reactionName"),
                "flux": r["flux"],
                "unit": r["unit"],
                "condition_id": r["conditionId"],
                "lower_bound": r.get("lowerBound"),
                "upper_bound": r.get("upperBound"),
                "model_id": r.get("_modelId"),
            })


def run(args: argparse.Namespace) -> int:
    cond_id = emit_bundle.condition_id()
    out_uri = args.output_uri or f"file://{os.path.abspath(args.output)}"
    flux_csv_uri = args.flux_csv_uri or f"file://{os.path.abspath(args.flux_csv)}"

    # ----- import solver stack; a missing stack is an explicit failure -------
    try:
        import cobra
        from cobra.io import read_sbml_model
        from cobra.flux_analysis import pfba
    except Exception as exc:  # pragma: no cover - import-time env issue
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={
                "flux": emit_bundle.failed_section(
                    f"COBRApy not importable: {exc}", method="COBRApy"),
                "yield": emit_bundle.failed_section(
                    "Flux solution unavailable; yields depend on it.",
                    method="COBRApy"),
            },
        )
        return 1

    cobra_version = getattr(cobra, "__version__", "unknown")
    method_fba = f"COBRApy {cobra_version} FBA"
    method_pfba = f"COBRApy {cobra_version} pFBA"

    # ----- locate + load the model -------------------------------------------
    model_path = find_model(args.inputs_dir)
    if not model_path:
        reason = f"No SBML model found in {args.inputs_dir} (expected model.xml)."
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={
                "flux": emit_bundle.failed_section(reason, method=method_pfba),
                "yield": emit_bundle.failed_section(reason, method=method_fba),
            },
        )
        return 1

    try:
        model = read_sbml_model(model_path)
    except Exception as exc:
        reason = f"Failed to parse SBML model {os.path.basename(model_path)}: {exc}"
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={
                "flux": emit_bundle.failed_section(reason, method=method_pfba),
                "yield": emit_bundle.failed_section(reason, method=method_fba),
            },
        )
        return 1

    model_id = model.id or os.path.splitext(os.path.basename(model_path))[0]
    constraints = load_constraints(args.inputs_dir)

    # ----- apply medium / objective / explicit bound overrides ---------------
    try:
        if constraints.get("objective"):
            model.objective = constraints["objective"]
        if constraints.get("medium"):
            # cobra medium: {exchange_id: max_uptake (positive)}
            medium = {k: float(v) for k, v in constraints["medium"].items()
                      if k in model.reactions}
            if medium:
                model.medium = medium
        for rxn_id, bnds in (constraints.get("bounds") or {}).items():
            if rxn_id in model.reactions:
                rxn = model.reactions.get_by_id(rxn_id)
                if "lower" in bnds:
                    rxn.lower_bound = float(bnds["lower"])
                if "upper" in bnds:
                    rxn.upper_bound = float(bnds["upper"])
    except Exception as exc:
        reason = f"Failed to apply constraints: {exc}"
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={
                "flux": emit_bundle.failed_section(reason, method=method_pfba),
                "yield": emit_bundle.failed_section(reason, method=method_fba),
            },
        )
        return 1

    objective_expr = str(model.objective.expression)

    # ----- solve: parsimonious FBA for a unique, minimal-flux distribution ----
    try:
        solution = pfba(model)
    except Exception:
        # Fall back to plain FBA if pFBA is infeasible for this model/medium.
        try:
            solution = model.optimize()
            method_used = method_fba
        except Exception as exc:
            reason = f"Solver failed (pFBA and FBA): {exc}"
            emit_bundle.write_bundle(
                output_path=args.output,
                analyses={
                    "flux": emit_bundle.failed_section(reason, method=method_pfba),
                    "yield": emit_bundle.failed_section(reason, method=method_fba),
                },
            )
            return 1
    else:
        method_used = method_pfba

    if solution.status != "optimal":
        reason = f"Optimization status '{solution.status}', not optimal."
        emit_bundle.write_bundle(
            output_path=args.output,
            analyses={
                "flux": emit_bundle.failed_section(reason, method=method_used),
                "yield": emit_bundle.failed_section(reason, method=method_used),
            },
        )
        return 1

    # ----- flux distribution -> native-unit rows -----------------------------
    flux_rows: List[Dict[str, Any]] = []
    fluxes = solution.fluxes
    for rxn in model.reactions:
        val = float(fluxes[rxn.id])
        flux_rows.append({
            "reactionId": rxn.id,
            "reactionName": rxn.name or None,
            "flux": val,                      # signed, native mmol/gDW/h
            "unit": FLUX_UNIT,
            "conditionId": cond_id,
            "lowerBound": float(rxn.lower_bound),
            "upperBound": float(rxn.upper_bound),
            "_modelId": model_id,             # for the CSV only; stripped below
        })

    # Persist the full distribution as an artifact, then drop the private key.
    write_flux_csv(args.flux_csv, flux_rows)
    for r in flux_rows:
        r.pop("_modelId", None)

    flux_artifact = emit_bundle.make_artifact(
        "flux_table", flux_csv_uri, role="flux-distribution-table",
        media_type="text/csv", local_path=args.flux_csv)

    flux_section = {
        "status": "available",
        "method": method_used,
        "notAvailableReason": None,
        "artifactIds": ["flux_table"],
        "modelId": model_id,
        "objective": objective_expr,
        "results": flux_rows,
        "pathwaySummaries": [],
    }

    # ----- predicted yields (only from the actual solution) ------------------
    yield_rows: List[Dict[str, Any]] = []
    yield_specs = constraints.get("yields") or []
    for spec in yield_specs:
        prod_id = spec.get("productReaction")
        sub_id = spec.get("substrateReaction")
        if prod_id not in model.reactions or sub_id not in model.reactions:
            continue
        prod_flux = float(fluxes[prod_id])
        sub_flux = float(fluxes[sub_id])
        # Substrate uptake is a negative exchange flux; magnitude is the uptake.
        uptake = abs(sub_flux)
        if uptake == 0.0:
            # No substrate consumed -> yield undefined; do not fabricate.
            continue
        unit = spec.get("unit", "mol/mol")
        # Molar yield = product secretion / substrate uptake.
        value = abs(prod_flux) / uptake
        if unit == "g/g":
            # Requires molecular weights; only convert if both are supplied.
            pmw = spec.get("productMW")
            smw = spec.get("substrateMW")
            if pmw is None or smw is None:
                # Cannot convert without MW -- emit mol/mol instead of guessing.
                unit = "mol/mol"
            else:
                value = value * (float(pmw) / float(smw))
        row = {
            "metricId": spec.get("id", f"{prod_id}_per_{sub_id}"),
            "name": spec.get("name"),
            "value": value,
            "unit": unit,
            "kind": "predicted",             # FBA yields are model predictions
            "conditionId": cond_id,
        }
        yield_rows.append(row)

    if yield_rows:
        yield_section = {
            "status": "available",
            "method": method_used,
            "notAvailableReason": None,
            "artifactIds": ["flux_table"],
            "results": yield_rows,
        }
    else:
        yield_section = emit_bundle.not_run_section(
            "No yield specification (productReaction/substrateReaction) provided "
            "in constraints.json, so no yield was predicted.",
            method=method_used,
        )

    emit_bundle.write_bundle(
        output_path=args.output,
        analyses={"flux": flux_section, "yield": yield_section},
        artifacts=[flux_artifact],
    )
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="COBRApy FBA/pFBA flux + yield branch.")
    p.add_argument("--inputs-dir", default=os.environ.get("CHASSIX_INPUTS_DIR", "/inputs"))
    p.add_argument("--output", default=os.environ.get("CHASSIX_OUTPUT", "/outputs/bundle.flux.json"))
    p.add_argument("--flux-csv", default=os.environ.get("CHASSIX_FLUX_CSV", "/outputs/flux_distribution.csv"))
    p.add_argument("--output-uri", default=os.environ.get("CHASSIX_OUTPUT_URI"))
    p.add_argument("--flux-csv-uri", default=os.environ.get("CHASSIX_FLUX_CSV_URI"))
    args = p.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.flux_csv)), exist_ok=True)
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
