#!/usr/bin/env python3
"""Proof-of-concept demo bundle builder (CalHacks).

Runs the REAL flux branch of the pipeline (`workflows/flux/flux_analysis.py`,
COBRApy pFBA) on two genome-scale metabolic models under two conditions each,
then augments every resulting analysis-bundle with literature-informed
transcriptomic / proteomic / metabolomic sections so the dashboard has all data
types to visualize.

HONESTY (read this):
  * The `flux` and `yield` sections are GENUINELY COMPUTED by COBRApy pFBA on the
    real GEMs (iML1515, yeast-GEM / Yeast8-9). The two conditions (aerobic vs
    oxygen-limited) are real constraint changes, so the flux maps are real and
    condition-specific.
  * The `geneExpression` and `metabolomics` sections are ILLUSTRATIVE,
    literature-informed placeholders for a demo — NOT computed DESeq2 / XCMS
    results. Each is labelled as such in its `method`, and the accessions it is
    informed by (GSE11452, PRECISE-1K, PXD016519, ProteomICA, ST001421) are named.
    No gap is filled with a value passed off as a measurement.

Outputs: one schema-1.0.0 bundle per (organism, condition) under
`apps/visualizer/public/demo/`, plus `comparison.json` (a real cross-organism
summary derived from the two FBA solutions).

Usage:
  python scripts/poc/build_demo.py --models-dir <dir-with-iML1515.xml,yeast-GEM.xml>
Requires COBRApy (used by the flux branch). Run with the venv python that has it.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from typing import Any, Dict, List

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FLUX_SCRIPT = os.path.join(REPO, "workflows", "flux", "flux_analysis.py")
OUT_DIR = os.path.join(REPO, "apps", "visualizer", "public", "demo")
FLUX_WORKFLOW_VERSION = "1.0.0"

# --- literature-informed (ILLUSTRATIVE) sections -----------------------------
# Representative central-carbon / fermentation genes & metabolites, informed by
# the named datasets. Values are plausible demo placeholders, NOT measurements.
LIT = {
    "bacterium": {
        "transcriptomics_accession": "PRECISE-1K (E. coli compendium)",
        "proteomics_accession": "PXD016519 / ProteomICA",
        "metabolomics_accession": "ST001421",
        "genes": [
            ("b1241", "adhE", "gene", 2.6),
            ("b4151", "frdA", "gene", 2.1),
            ("b1380", "ldhA", "gene", 1.8),
            ("b2297", "pta", "gene", 1.1),
            ("b0720", "gltA", "gene", -1.7),
            ("b0721", "sdhC", "gene", -2.0),
            ("b1136", "icd", "gene", -1.3),
            ("b3236", "mdh", "gene", -1.1),
        ],
        "proteins": [
            ("P0A9Q7", "AdhE", "protein", 1.9),
            ("P00363", "FrdA", "protein", 1.5),
            ("P0ABH7", "GltA", "protein", -1.2),
        ],
        "metabolites": [
            ("hmdb:HMDB0000108", "Ethanol", 3.4, "mM", 2.8),
            ("hmdb:HMDB0000042", "Acetate", 5.1, "mM", 1.9),
            ("hmdb:HMDB0000243", "Pyruvate", 0.9, "mM", -0.4),
            ("hmdb:HMDB0000254", "Succinate", 1.2, "mM", 0.7),
        ],
    },
    "yeast": {
        "transcriptomics_accession": "GSE11452 (S. cerevisiae)",
        "proteomics_accession": "PXD016519 / ProteomICA",
        "metabolomics_accession": "ST001421",
        "genes": [
            ("YOL086C", "ADH1", "gene", 2.3),
            ("YLR044C", "PDC1", "gene", 1.7),
            ("YGR087C", "PDC6", "gene", 1.4),
            ("YJR048W", "CYC1", "gene", -2.1),
            ("YKL085W", "MDH1", "gene", -1.6),
            ("YNL071W", "LAT1", "gene", -1.2),
            ("YPR001W", "CIT3", "gene", -1.0),
        ],
        "proteins": [
            ("P00330", "Adh1", "protein", 1.8),
            ("P06169", "Pdc1", "protein", 1.3),
            ("P00127", "Cyc1", "protein", -1.4),
        ],
        "metabolites": [
            ("hmdb:HMDB0000108", "Ethanol", 7.9, "mM", 3.6),
            ("hmdb:HMDB0000042", "Acetate", 2.3, "mM", 1.1),
            ("hmdb:HMDB0000122", "D-Glucose", 11.0, "mM", -1.2),
            ("hmdb:HMDB0000243", "Pyruvate", 0.6, "mM", -0.3),
        ],
    },
}

# --- organisms + conditions ---------------------------------------------------
ORGANISMS = [
    {
        "key": "ecoli",
        "model": "iML1515.xml",
        "chassisId": "bacterium",
        "taxonId": "511145",
        "taxonName": "Escherichia coli",
        "strainId": "MG1655",
        "strainName": "K-12 MG1655",
        "objective": "BIOMASS_Ec_iML1515_core_75p37M",
        "o2_exchange": "EX_o2_e",
        "glc_exchange": "EX_glc__D_e",
        "biomass_rxn": "BIOMASS_Ec_iML1515_core_75p37M",
        "byproducts": {"EX_etoh_e": "ethanol", "EX_ac_e": "acetate", "EX_succ_e": "succinate"},
    },
    {
        "key": "yeast",
        "model": "yeast-GEM.xml",
        "chassisId": "yeast",
        "taxonId": "559292",
        "taxonName": "Saccharomyces cerevisiae",
        "strainId": "S288C",
        "strainName": "S288C",
        "objective": "r_2111",
        "o2_exchange": "r_1992",
        "glc_exchange": "r_1714",
        "biomass_rxn": "r_2111",
        "byproducts": {"r_1761": "ethanol", "r_1634": "acetate", "r_2056": "succinate"},
    },
]

CONDITIONS = [
    {"id": "aerobic_glucose", "o2_lower": -1000.0, "glc_lower": -10.0,
     "media": "glucose minimal", "oxygenation": "aerobic"},
    {"id": "oxygen_limited", "o2_lower": -2.0, "glc_lower": -10.0,
     "media": "glucose minimal", "oxygenation": "oxygen-limited"},
]


def run_flux_branch(org: Dict[str, Any], cond: Dict[str, Any], models_dir: str,
                    work_dir: str, py: str) -> Dict[str, Any]:
    """Stage inputs and invoke the REAL flux_analysis.py; return its bundle dict."""
    inputs = os.path.join(work_dir, f"{org['key']}_{cond['id']}", "inputs")
    os.makedirs(inputs, exist_ok=True)
    shutil.copyfile(os.path.join(models_dir, org["model"]), os.path.join(inputs, "model.xml"))

    constraints = {
        "objective": org["objective"],
        "bounds": {
            org["o2_exchange"]: {"lower": cond["o2_lower"]},
            org["glc_exchange"]: {"lower": cond["glc_lower"]},
        },
        "yields": [
            {"id": f"{bp}_per_glucose", "name": f"{name} yield",
             "productReaction": bp, "substrateReaction": org["glc_exchange"], "unit": "mol/mol"}
            for bp, name in org["byproducts"].items()
        ],
    }
    with open(os.path.join(inputs, "constraints.json"), "w", encoding="utf-8") as fh:
        json.dump(constraints, fh)

    out_bundle = os.path.join(work_dir, f"{org['key']}_{cond['id']}", "bundle.flux.json")
    flux_csv = os.path.join(work_dir, f"{org['key']}_{cond['id']}", "flux.csv")

    env = dict(os.environ)
    env.update({
        "CHASSIX_RUN_ID": f"poc-{org['key']}-{cond['id']}",
        "CHASSIX_WORKFLOW_ID": "flux",
        "CHASSIX_WORKFLOW_VERSION": FLUX_WORKFLOW_VERSION,
        "CHASSIX_ORGANISM_CHASSIS": org["chassisId"],
        "CHASSIX_ORGANISM_TAXON_ID": org["taxonId"],
        "CHASSIX_ORGANISM_TAXON_NAME": org["taxonName"],
        "CHASSIX_ORGANISM_STRAIN_ID": org["strainId"],
        "CHASSIX_ORGANISM_STRAIN_NAME": org["strainName"],
        "CHASSIX_CONDITION_ID": cond["id"],
        "CHASSIX_CONDITION_MEDIA": cond["media"],
        "CHASSIX_CONDITION_OXYGENATION": cond["oxygenation"],
    })
    proc = subprocess.run(
        [py, FLUX_SCRIPT, "--inputs-dir", inputs, "--output", out_bundle, "--flux-csv", flux_csv],
        env=env, capture_output=True, text=True,
    )
    if proc.returncode != 0 or not os.path.exists(out_bundle):
        sys.stderr.write(proc.stdout + "\n" + proc.stderr + "\n")
        raise RuntimeError(f"flux branch failed for {org['key']}/{cond['id']}")
    with open(out_bundle, "r", encoding="utf-8") as fh:
        return json.load(fh)


def lit_sections(org: Dict[str, Any], cond_id: str) -> Dict[str, Any]:
    """Build the ILLUSTRATIVE, clearly-labelled literature sections."""
    lit = LIT[org["chassisId"]]
    label = ("ILLUSTRATIVE (literature-informed, POC) — representative values, "
             "NOT a computed result")
    genes = [
        {"featureId": fid, "symbol": sym, "featureType": ftype,
         "log2FoldChange": l2fc, "pValue": None, "adjustedPValue": None,
         "unit": "log2FoldChange"}
        for (fid, sym, ftype, l2fc) in (lit["genes"] + lit["proteins"])
    ]
    metabolites = [
        {"featureId": fid, "name": name, "value": val, "unit": unit,
         "change": change, "changeUnit": "log2FoldChange", "conditionId": cond_id}
        for (fid, name, val, unit, change) in lit["metabolites"]
    ]
    return {
        "geneExpression": {
            "status": "available",
            "method": f"{label}; informed by {lit['transcriptomics_accession']} "
                      f"and {lit['proteomics_accession']}",
            "notAvailableReason": None,
            "contrastId": f"{cond_id}_vs_aerobic_glucose",
            "results": genes,
        },
        "metabolomics": {
            "status": "available",
            "method": f"{label}; informed by {lit['metabolomics_accession']}",
            "notAvailableReason": None,
            "results": metabolites,
        },
    }


def active(rows: List[Dict[str, Any]], eps: float = 1e-6) -> List[Dict[str, Any]]:
    """Keep only reactions carrying flux — zero-flux rows carry no information."""
    return [r for r in rows if abs(r.get("flux", 0.0)) > eps]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models-dir", required=True)
    ap.add_argument("--work-dir", required=True)
    ap.add_argument("--python", default=sys.executable, help="python with COBRApy")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    comparison: Dict[str, Any] = {
        "generatedBy": "scripts/poc/build_demo.py",
        "note": "Flux/growth are real COBRApy pFBA on iML1515 and yeast-GEM; "
                "transcriptomics/proteomics/metabolomics in the bundles are "
                "illustrative (literature-informed), labelled in each section.",
        "organisms": [],
    }

    for org in ORGANISMS:
        org_entry = {"organism": org["taxonName"], "strain": org["strainName"],
                     "model": org["model"], "conditions": []}
        for cond in CONDITIONS:
            bundle = run_flux_branch(org, cond, args.models_dir, args.work_dir, args.python)

            flux = bundle["analyses"]["flux"]
            all_rows = flux.get("results", [])
            flux["results"] = active(all_rows)

            # Real condition metrics from the FBA solution.
            by_id = {r["reactionId"]: r["flux"] for r in all_rows}
            growth = by_id.get(org["biomass_rxn"])
            secretions = {name: by_id.get(rid) for rid, name in org["byproducts"].items()}

            bundle["analyses"].update(lit_sections(org, cond["id"]))

            out_path = os.path.join(OUT_DIR, f"{org['key']}-{cond['id']}.json")
            with open(out_path, "w", encoding="utf-8") as fh:
                json.dump(bundle, fh, indent=2)

            org_entry["conditions"].append({
                "conditionId": cond["id"],
                "growthRate_per_h": round(growth, 4) if growth is not None else None,
                "activeReactions": len(flux["results"]),
                "totalReactions": len(all_rows),
                "secretion_mmol_gDW_h": {k: (round(v, 4) if v is not None else None)
                                         for k, v in secretions.items()},
                "bundle": f"apps/visualizer/public/demo/{org['key']}-{cond['id']}.json",
            })
            print(f"[{org['key']}/{cond['id']}] growth={growth:.4f}/h  "
                  f"active={len(flux['results'])}/{len(all_rows)}  "
                  f"ethanol={secretions.get('ethanol')}")
        comparison["organisms"].append(org_entry)

    with open(os.path.join(OUT_DIR, "comparison.json"), "w", encoding="utf-8") as fh:
        json.dump(comparison, fh, indent=2)
    write_index(comparison)
    print(f"\nWrote demo bundles + comparison.json + index.html to {OUT_DIR}")
    return 0


def write_index(comparison: Dict[str, Any]) -> None:
    """Emit a manifest (index.json) and a clickable landing page (index.html).

    Served by Vite at /demo/; each row deep-links the visualizer at
    /?bundleUrl=/demo/<file>.json. Regenerated from the real numbers each run.
    """
    manifest = {"note": comparison["note"], "bundles": []}
    rows = []
    for org in comparison["organisms"]:
        for c in org["conditions"]:
            fname = os.path.basename(c["bundle"])
            manifest["bundles"].append({
                "organism": org["organism"], "strain": org["strain"],
                "conditionId": c["conditionId"], "growthRate_per_h": c["growthRate_per_h"],
                "url": f"/demo/{fname}", "open": f"/?bundleUrl=/demo/{fname}",
            })
            sec = c["secretion_mmol_gDW_h"]
            rows.append(
                f'<tr><td>{org["organism"]} <span class="s">{org["strain"]}</span></td>'
                f'<td>{c["conditionId"]}</td>'
                f'<td class="n">{c["growthRate_per_h"]}</td>'
                f'<td class="n">{sec.get("ethanol")}</td>'
                f'<td class="n">{sec.get("acetate")}</td>'
                f'<td class="n">{c["activeReactions"]}/{c["totalReactions"]}</td>'
                f'<td><a href="/?bundleUrl=/demo/{fname}">open in dashboard →</a></td></tr>'
            )
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chassix AI — multi-omics POC demo</title>
<style>
  :root {{ color-scheme: light dark; --fg:#1a1a1a; --bg:#fff; --mut:#666; --line:#e3e3e3; --accent:#2563eb; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --fg:#e8e8e8; --bg:#121316; --mut:#9aa0a6; --line:#2a2d33; --accent:#6ea8fe; }} }}
  body {{ font: 15px/1.55 -apple-system, system-ui, sans-serif; color:var(--fg); background:var(--bg); margin:0; padding:32px 16px; }}
  main {{ max-width: 860px; margin: 0 auto; }}
  h1 {{ font-size: 1.5rem; margin:.2em 0; }} .s {{ color:var(--mut); font-size:.85em; }}
  p {{ color:var(--mut); }} table {{ border-collapse: collapse; width:100%; margin:18px 0; }}
  th,td {{ text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }}
  th {{ font-size:.8rem; text-transform:uppercase; letter-spacing:.03em; color:var(--mut); }}
  td.n {{ text-align:right; font-variant-numeric: tabular-nums; }}
  a {{ color:var(--accent); text-decoration:none; }} a:hover {{ text-decoration:underline; }}
  .note {{ border-left:3px solid var(--accent); padding:10px 14px; background:color-mix(in srgb, var(--accent) 7%, transparent); border-radius:4px; font-size:.9em; }}
</style></head><body><main>
<h1>Chassix AI — multi-omics POC demo</h1>
<p>Condition-specific flux maps for <em>S. cerevisiae</em> S288C and <em>E. coli</em> K-12 MG1655.</p>
<div class="note"><strong>Provenance.</strong> Growth rate, flux, and byproduct secretion are
<strong>real</strong> COBRApy pFBA on the genome-scale models (iML1515, yeast-GEM / Yeast8-9).
The transcriptomic / proteomic / metabolomic sections inside each bundle are
<strong>illustrative, literature-informed</strong> placeholders for the demo (labelled in each
section), not computed measurements.</div>
<table><thead><tr><th>Organism</th><th>Condition</th><th>Growth (/h)</th>
<th>Ethanol</th><th>Acetate</th><th>Active rxns</th><th></th></tr></thead>
<tbody>
{os.linesep.join(rows)}
</tbody></table>
<p>Secretion in mmol·gDW⁻¹·h⁻¹. Each dashboard link opens the validated analysis bundle
(schema 1.0.0) in the visualizer.</p>
</main></body></html>
"""
    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(html)


if __name__ == "__main__":
    raise SystemExit(main())
