#!/usr/bin/env Rscript
# Transcriptomics / perturbation branch -- DESeq2 differential expression.
#
# Branch contract (docs/scientific-contracts.md): differential expression with
# DESeq2 from a count matrix + sample sheet, producing a contrast table with
# uncertainty (p / adjusted-p).
#
# Inputs (read from CHASSIX_INPUTS_DIR, by default the gcsFuse-mounted
# gs://.../studies/<RUN>/inputs):
#   * counts.csv       -- raw integer count matrix; first column = gene id
#                         (feature_id), remaining columns = sample ids.
#   * samples.csv      -- sample sheet; columns: sample_id, condition
#                         (the factor being contrasted), plus optional covariates.
#   * contrast.json    -- {"factor":"condition","test":"treated","reference":"control"}
#                         (optional; defaults to the two levels of `condition`).
#
# Output: analyses.geneExpression with featureId, featureType "gene",
#   log2FoldChange, pValue, adjustedPValue (padj), baseMean, unit "log2FoldChange",
#   contrastId, method "DESeq2 <version>". The full DE table is also written as a
#   CSV artifact. Native values only; NA shrinks to JSON null, never 0.

suppressMessages({
  library(DESeq2)
  library(jsonlite)
})

inputs_dir <- Sys.getenv("CHASSIX_INPUTS_DIR", "/inputs")
output_path <- Sys.getenv("CHASSIX_OUTPUT", "/outputs/bundle.transcriptomics.json")
de_csv <- Sys.getenv("CHASSIX_DE_CSV", "/outputs/differential_expression.csv")
de_csv_uri <- Sys.getenv("CHASSIX_DE_CSV_URI", paste0("file://", normalizePath(de_csv, mustWork = FALSE)))
cond_id <- Sys.getenv("CHASSIX_CONDITION_ID", "REPLACE_WITH_CONDITION_ID")

# Resolve the shared bridge helper.
emit_helper <- Sys.getenv("CHASSIX_EMIT_BUNDLE_R", "/opt/chassix/common/emit_bundle.R")
if (!file.exists(emit_helper)) {
  emit_helper <- file.path(dirname(dirname(normalizePath(sub(
    "^--file=", "", commandArgs(FALSE)[grepl("^--file=", commandArgs(FALSE))])))),
    "common", "emit_bundle.R")
}
source(emit_helper)

dir.create(dirname(output_path), showWarnings = FALSE, recursive = TRUE)
dir.create(dirname(de_csv), showWarnings = FALSE, recursive = TRUE)

deseq2_version <- as.character(packageVersion("DESeq2"))
method_str <- paste0("DESeq2 ", deseq2_version, " (Wald test, BH adjustment)")

fail_and_exit <- function(reason) {
  message("[deseq2] FAILED: ", reason)
  emit_bundle(
    list(geneExpression = failed_section(reason, method = method_str)),
    list(),
    output_path
  )
  quit(status = 1, save = "no")
}

# ---- load inputs -----------------------------------------------------------
counts_path <- file.path(inputs_dir, "counts.csv")
samples_path <- file.path(inputs_dir, "samples.csv")
if (!file.exists(counts_path)) fail_and_exit(paste0("Missing counts matrix: ", counts_path))
if (!file.exists(samples_path)) fail_and_exit(paste0("Missing sample sheet: ", samples_path))

counts <- tryCatch(
  as.matrix(read.csv(counts_path, row.names = 1, check.names = FALSE)),
  error = function(e) fail_and_exit(paste0("Could not read counts.csv: ", conditionMessage(e)))
)
samples <- tryCatch(
  read.csv(samples_path, stringsAsFactors = FALSE, check.names = FALSE),
  error = function(e) fail_and_exit(paste0("Could not read samples.csv: ", conditionMessage(e)))
)

if (!"sample_id" %in% colnames(samples)) fail_and_exit("samples.csv needs a 'sample_id' column.")
rownames(samples) <- samples$sample_id

# ---- contrast spec ---------------------------------------------------------
contrast_path <- file.path(inputs_dir, "contrast.json")
if (file.exists(contrast_path)) {
  cj <- fromJSON(contrast_path)
  factor_col <- cj$factor
  test_level <- cj$test
  ref_level <- cj$reference
} else {
  factor_col <- "condition"
  test_level <- NULL
  ref_level <- NULL
}
if (!factor_col %in% colnames(samples)) {
  fail_and_exit(paste0("Contrast factor '", factor_col, "' not a column in samples.csv."))
}

# Align count columns with the sample sheet.
common <- intersect(colnames(counts), rownames(samples))
if (length(common) < 2) fail_and_exit("Fewer than 2 samples shared between counts and sample sheet.")
counts <- counts[, common, drop = FALSE]
samples <- samples[common, , drop = FALSE]

samples[[factor_col]] <- factor(samples[[factor_col]])
if (!is.null(ref_level)) samples[[factor_col]] <- relevel(samples[[factor_col]], ref = ref_level)
levels_present <- levels(samples[[factor_col]])
if (length(levels_present) < 2) fail_and_exit("Contrast factor has fewer than 2 levels.")
if (is.null(test_level)) test_level <- levels_present[length(levels_present)]
if (is.null(ref_level)) ref_level <- levels_present[1]
contrast_id <- paste0(factor_col, ":", test_level, "_vs_", ref_level)

# DESeq2 requires integer counts.
storage.mode(counts) <- "integer"

# ---- run DESeq2 ------------------------------------------------------------
res <- tryCatch({
  dds <- DESeqDataSetFromMatrix(
    countData = counts,
    colData = samples,
    design = as.formula(paste0("~ ", factor_col))
  )
  dds <- DESeq(dds)
  results(dds, contrast = c(factor_col, test_level, ref_level))
}, error = function(e) fail_and_exit(paste0("DESeq2 run failed: ", conditionMessage(e))))

res_df <- as.data.frame(res)
res_df$feature_id <- rownames(res_df)

# ---- write the full DE table artifact (native values) ----------------------
out_table <- data.frame(
  feature_id = res_df$feature_id,
  base_mean = res_df$baseMean,
  log2_fold_change = res_df$log2FoldChange,
  lfc_se = res_df$lfcSE,
  stat = res_df$stat,
  p_value = res_df$pvalue,
  adjusted_p_value = res_df$padj,
  contrast_id = contrast_id,
  unit = "log2FoldChange",
  stringsAsFactors = FALSE
)
write.csv(out_table, de_csv, row.names = FALSE, na = "")

# ---- shape the schema `results` array (NA -> null) -------------------------
as_num_or_null <- function(x) if (is.na(x) || is.nan(x) || is.infinite(x)) NULL else as.numeric(x)
clip01 <- function(x) {  # p-values must be within [0,1]
  v <- as_num_or_null(x)
  if (is.null(v)) return(NULL)
  max(0, min(1, v))
}

rows <- lapply(seq_len(nrow(res_df)), function(i) {
  r <- res_df[i, ]
  list(
    featureId = r$feature_id,
    featureType = "gene",
    log2FoldChange = as_num_or_null(r$log2FoldChange),
    pValue = clip01(r$pvalue),
    adjustedPValue = clip01(r$padj),
    baseMean = as_num_or_null(r$baseMean),
    unit = "log2FoldChange"
  )
})

n_tested <- sum(!is.na(res_df$padj))
status <- if (n_tested == 0) "partial" else "available"
reason <- if (status == "partial")
  "DESeq2 ran but no gene passed independent filtering (all padj are NA)." else NULL

if (length(rows) == 0) {
  fail_and_exit("DESeq2 produced no result rows.")
}

section <- list(
  status = status,
  method = method_str,
  notAvailableReason = reason,
  artifactIds = list("de_table"),
  contrastId = contrast_id,
  results = rows
)

artifacts <- list(make_artifact(
  "de_table", de_csv_uri, role = "differential-expression-table",
  media_type = "text/csv", local_path = de_csv
))

emit_bundle(list(geneExpression = section), artifacts, output_path)
message("[deseq2] wrote ", output_path, " (", length(rows), " genes, contrast ", contrast_id, ")")
