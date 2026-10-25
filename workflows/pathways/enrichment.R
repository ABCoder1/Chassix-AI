#!/usr/bin/env Rscript
# Pathways branch -- clusterProfiler functional enrichment.
#
# Branch contract (docs/scientific-contracts.md): pathway/ontology enrichment of
# a gene list or DE table with clusterProfiler, producing a mapping + enrichment
# table with method assumptions recorded.
#
# SCHEMA GAP (important -- see workflows/README.md and workflows/pathways/README.md):
# analysis-bundle.schema.json v1.0.0 has NO first-class enrichment section, and
# `analyses` is additionalProperties:false, so we MUST NOT invent one, and we must
# NOT shoehorn enrichment into flux.pathwaySummaries (those carry a `flux` value
# in flux units -- enrichment has no flux) or into metabolomics. The correct,
# lossless representation today is:
#   * write the full enrichment table as a first-class ARTIFACT (CSV), and
#   * emit a geneExpression section with status "not_run" whose
#     notAvailableReason explains the gap and whose artifactIds point at the
#     enrichment table so the dashboard can still surface it.
# This surfaces results without fabricating an unsupported numeric section.
# Action item: raise a schema change (an `enrichment` analysis def) with the
# dashboard owner.
#
# Inputs (CHASSIX_INPUTS_DIR, by default gs://.../studies/<RUN>/inputs):
#   * de_table.csv (preferred) -- DESeq2 output with columns feature_id,
#       log2_fold_change, adjusted_p_value. Significant genes (padj < alpha) form
#       the enrichment gene list; the full ranked list feeds optional GSEA.
#     OR genes.txt -- one gene id per line (over-representation only).
#   * params.json (optional) -- {"orgDb":"org.EcK12.eg.db","keyType":"SYMBOL",
#       "ont":"BP","alpha":0.05,"pAdjustMethod":"BH"}. orgDb must already be
#       installed in the image for the study's organism.
#
# Output: analyses.geneExpression status "not_run" (schema-gap carrier) +
#   artifacts[enrichment_table]. No enrichment scores are placed in a numeric
#   results array, because no schema field accepts them.

suppressMessages({
  library(clusterProfiler)
  library(jsonlite)
})

inputs_dir <- Sys.getenv("CHASSIX_INPUTS_DIR", "/inputs")
output_path <- Sys.getenv("CHASSIX_OUTPUT", "/outputs/bundle.pathways.json")
enr_csv <- Sys.getenv("CHASSIX_ENRICH_CSV", "/outputs/enrichment_table.csv")
enr_csv_uri <- Sys.getenv("CHASSIX_ENRICH_CSV_URI", paste0("file://", normalizePath(enr_csv, mustWork = FALSE)))

emit_helper <- Sys.getenv("CHASSIX_EMIT_BUNDLE_R", "/opt/chassix/common/emit_bundle.R")
if (!file.exists(emit_helper)) {
  emit_helper <- file.path(dirname(dirname(normalizePath(sub(
    "^--file=", "", commandArgs(FALSE)[grepl("^--file=", commandArgs(FALSE))])))),
    "common", "emit_bundle.R")
}
source(emit_helper)

dir.create(dirname(output_path), showWarnings = FALSE, recursive = TRUE)
dir.create(dirname(enr_csv), showWarnings = FALSE, recursive = TRUE)

cp_version <- as.character(packageVersion("clusterProfiler"))

# params
params_path <- file.path(inputs_dir, "params.json")
params <- if (file.exists(params_path)) fromJSON(params_path) else list()
org_db <- if (!is.null(params$orgDb)) params$orgDb else "org.EcK12.eg.db"
key_type <- if (!is.null(params$keyType)) params$keyType else "SYMBOL"
ont <- if (!is.null(params$ont)) params$ont else "BP"
alpha <- if (!is.null(params$alpha)) as.numeric(params$alpha) else 0.05
padj_method <- if (!is.null(params$pAdjustMethod)) params$pAdjustMethod else "BH"

method_str <- sprintf(
  "clusterProfiler %s enrichGO(ont=%s, OrgDb=%s, keyType=%s, pAdjustMethod=%s)",
  cp_version, ont, org_db, key_type, padj_method)

# The geneExpression section is the schema-gap carrier (always not_run here).
gap_reason <- paste0(
  "Pathway enrichment has no first-class section in analysis-bundle.schema.json ",
  "v1.0.0; results are attached as the 'enrichment_table' artifact. ",
  "Tracked schema gap: add an 'enrichment' analysis definition.")

emit_gap_bundle <- function(artifacts, extra_reason = NULL) {
  reason <- if (is.null(extra_reason)) gap_reason else paste0(gap_reason, " ", extra_reason)
  art_ids <- if (length(artifacts) > 0) list("enrichment_table") else list()
  section <- list(
    status = "not_run",
    method = method_str,
    notAvailableReason = reason,
    artifactIds = art_ids,
    contrastId = NULL,
    results = list()
  )
  emit_bundle(list(geneExpression = section), artifacts, output_path)
}

fail_and_exit <- function(reason) {
  message("[pathways] FAILED: ", reason)
  section <- failed_section(reason, method = method_str)
  section$contrastId <- NULL
  emit_bundle(list(geneExpression = section), list(), output_path)
  quit(status = 1, save = "no")
}

# ---- build the gene list ----------------------------------------------------
de_path <- file.path(inputs_dir, "de_table.csv")
genes_path <- file.path(inputs_dir, "genes.txt")
gene_ids <- character(0)
ranked <- NULL

if (file.exists(de_path)) {
  de <- tryCatch(read.csv(de_path, stringsAsFactors = FALSE, check.names = FALSE),
                 error = function(e) fail_and_exit(paste0("Could not read de_table.csv: ", conditionMessage(e))))
  id_col <- intersect(c("feature_id", "featureId", "gene", "symbol"), colnames(de))[1]
  padj_col <- intersect(c("adjusted_p_value", "padj", "adjustedPValue"), colnames(de))[1]
  lfc_col <- intersect(c("log2_fold_change", "log2FoldChange"), colnames(de))[1]
  if (is.na(id_col)) fail_and_exit("de_table.csv lacks a gene id column (feature_id/symbol).")
  if (!is.na(padj_col)) {
    sig <- de[!is.na(de[[padj_col]]) & de[[padj_col]] < alpha, , drop = FALSE]
    gene_ids <- unique(as.character(sig[[id_col]]))
  } else {
    gene_ids <- unique(as.character(de[[id_col]]))
  }
  if (!is.na(lfc_col)) {
    ranked <- de[[lfc_col]]
    names(ranked) <- as.character(de[[id_col]])
    ranked <- sort(ranked[!is.na(ranked)], decreasing = TRUE)
  }
} else if (file.exists(genes_path)) {
  gene_ids <- unique(trimws(readLines(genes_path)))
  gene_ids <- gene_ids[nzchar(gene_ids)]
} else {
  fail_and_exit(paste0("No de_table.csv or genes.txt found in ", inputs_dir, "."))
}

if (length(gene_ids) == 0) {
  # Valid, non-fabricated outcome: nothing passed the significance cut.
  emit_gap_bundle(list(), extra_reason = paste0(
    "No genes passed the significance threshold (padj < ", alpha, "); ",
    "enrichment not run."))
  message("[pathways] no significant genes; emitted not_run carrier.")
  quit(status = 0, save = "no")
}

# ---- run enrichment (requires the organism OrgDb installed in the image) ----
if (!requireNamespace(org_db, quietly = TRUE)) {
  fail_and_exit(paste0("OrgDb '", org_db, "' is not installed in this image for the study organism."))
}

ego <- tryCatch(
  enrichGO(gene = gene_ids, OrgDb = org_db, keyType = key_type, ont = ont,
           pAdjustMethod = padj_method, pvalueCutoff = alpha, readable = FALSE),
  error = function(e) fail_and_exit(paste0("clusterProfiler enrichGO failed: ", conditionMessage(e)))
)

res_df <- if (is.null(ego)) data.frame() else as.data.frame(ego)
write.csv(res_df, enr_csv, row.names = FALSE, na = "")

artifacts <- list(make_artifact(
  "enrichment_table", enr_csv_uri, role = "pathway-enrichment-table",
  media_type = "text/csv", local_path = enr_csv
))

extra <- paste0(nrow(res_df), " enriched term(s) at p.adjust < ", alpha,
                " from ", length(gene_ids), " input genes.")
emit_gap_bundle(artifacts, extra_reason = extra)
message("[pathways] wrote ", output_path, " (", nrow(res_df), " enriched terms; table artifact attached)")
