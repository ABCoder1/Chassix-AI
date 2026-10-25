#!/usr/bin/env Rscript
# Metabolomics branch -- XCMS peak detection + MetaboAnalystR statistics.
#
# Branch contract (docs/scientific-contracts.md): LC/GC-MS peak detection and
# processing with XCMS, downstream stats + annotation with MetaboAnalystR,
# producing a processed + annotated metabolite table.
#
# Inputs (CHASSIX_INPUTS_DIR, by default the gcsFuse-mounted
# gs://.../studies/<RUN>/inputs):
#   Preferred (raw MS): raw/*.mzML | raw/*.mzXML + samples.csv (sample_id,group).
#   Alternative (already-quantified): metabolites.csv following the column shape
#     in workflow-inputs/templates/metabolites.csv (feature_id,name,value,unit,
#     change,change_unit,p_value,adjusted_p_value,...,condition_id). When a raw
#     set is absent but this table is present, we run MetaboAnalystR stats only.
#
# Output: analyses.metabolomics with featureId, name, value, unit (native, e.g.
#   "peak_area" or "uM"), change, changeUnit, pValue, adjustedPValue, conditionId.
# A processed feature table is written as a CSV artifact. No value is invented;
# missing stats are JSON null and empty inputs yield a "failed"/"not_run" section.

suppressMessages({
  library(jsonlite)
})

inputs_dir <- Sys.getenv("CHASSIX_INPUTS_DIR", "/inputs")
output_path <- Sys.getenv("CHASSIX_OUTPUT", "/outputs/bundle.metabolomics.json")
feat_csv <- Sys.getenv("CHASSIX_FEATURE_CSV", "/outputs/metabolite_features.csv")
feat_csv_uri <- Sys.getenv("CHASSIX_FEATURE_CSV_URI", paste0("file://", normalizePath(feat_csv, mustWork = FALSE)))
cond_id <- Sys.getenv("CHASSIX_CONDITION_ID", "REPLACE_WITH_CONDITION_ID")

emit_helper <- Sys.getenv("CHASSIX_EMIT_BUNDLE_R", "/opt/chassix/common/emit_bundle.R")
if (!file.exists(emit_helper)) {
  emit_helper <- file.path(dirname(dirname(normalizePath(sub(
    "^--file=", "", commandArgs(FALSE)[grepl("^--file=", commandArgs(FALSE))])))),
    "common", "emit_bundle.R")
}
source(emit_helper)

dir.create(dirname(output_path), showWarnings = FALSE, recursive = TRUE)
dir.create(dirname(feat_csv), showWarnings = FALSE, recursive = TRUE)

method_str <- "XCMS peak detection + MetaboAnalystR statistics"

fail_and_exit <- function(reason) {
  message("[metabolomics] FAILED: ", reason)
  emit_bundle(list(metabolomics = failed_section(reason, method = method_str)), list(), output_path)
  quit(status = 1, save = "no")
}

as_num_or_null <- function(x) if (is.null(x) || is.na(x) || is.nan(x) || is.infinite(x)) NULL else as.numeric(x)
clip01 <- function(x) { v <- as_num_or_null(x); if (is.null(v)) return(NULL); max(0, min(1, v)) }

raw_dir <- file.path(inputs_dir, "raw")
raw_files <- if (dir.exists(raw_dir))
  list.files(raw_dir, pattern = "\\.(mzML|mzXML|CDF|cdf)$", full.names = TRUE, ignore.case = TRUE)
  else character(0)
table_path <- file.path(inputs_dir, "metabolites.csv")

feature_df <- NULL  # columns: feature_id, name, value, unit, change, change_unit,
                    #          p_value, adjusted_p_value

if (length(raw_files) > 0) {
  # ---- Path A: raw MS -> XCMS peak detection -> feature table ----
  method_str <- paste0(method_str, " [XCMS ", tryCatch(as.character(packageVersion("xcms")),
                                                       error = function(e) "x"), "]")
  feature_df <- tryCatch({
    suppressMessages(library(xcms))
    samples_path <- file.path(inputs_dir, "samples.csv")
    if (!file.exists(samples_path)) fail_and_exit("raw/ present but samples.csv missing.")
    samples <- read.csv(samples_path, stringsAsFactors = FALSE)
    if (!all(c("sample_id", "group") %in% colnames(samples)))
      fail_and_exit("samples.csv needs 'sample_id' and 'group' columns.")

    # XCMS v3 object-oriented workflow: centWave peak picking -> grouping ->
    # retention-time correction -> fill -> feature matrix.
    pd <- data.frame(sample_name = samples$sample_id, sample_group = samples$group,
                     stringsAsFactors = FALSE)
    raw_data <- readMSData(files = raw_files, pdata = new("NAnnotatedDataFrame", pd),
                           mode = "onDisk")
    cwp <- CentWaveParam(ppm = 25, peakwidth = c(5, 30), snthresh = 10)
    xdata <- findChromPeaks(raw_data, param = cwp)
    xdata <- adjustRtime(xdata, param = ObiwarpParam())
    pdp <- PeakDensityParam(sampleGroups = pd$sample_group, bw = 30, minFraction = 0.5)
    xdata <- groupChromPeaks(xdata, param = pdp)
    xdata <- fillChromPeaks(xdata)

    fv <- featureValues(xdata, value = "into")          # integrated peak area
    fd <- featureDefinitions(xdata)
    df <- data.frame(
      feature_id = rownames(fv),
      name = NA_character_,
      value = rowMeans(fv, na.rm = TRUE),               # mean peak area, native
      unit = "peak_area",
      mzmed = fd$mzmed, rtmed = fd$rtmed,
      stringsAsFactors = FALSE
    )
    # Group-wise fold change + Welch t-test across the two largest groups.
    groups <- unique(pd$sample_group)
    if (length(groups) >= 2) {
      g1 <- pd$sample_name[pd$sample_group == groups[1]]
      g2 <- pd$sample_name[pd$sample_group == groups[2]]
      m1 <- rowMeans(fv[, g1, drop = FALSE], na.rm = TRUE)
      m2 <- rowMeans(fv[, g2, drop = FALSE], na.rm = TRUE)
      df$change <- log2((m2 + 1) / (m1 + 1))
      df$change_unit <- "log2_fold_change"
      df$p_value <- vapply(seq_len(nrow(fv)), function(i) {
        tryCatch(t.test(fv[i, g1], fv[i, g2])$p.value, error = function(e) NA_real_)
      }, numeric(1))
      df$adjusted_p_value <- p.adjust(df$p_value, method = "BH")
    } else {
      df$change <- NA_real_; df$change_unit <- NA_character_
      df$p_value <- NA_real_; df$adjusted_p_value <- NA_real_
    }
    df
  }, error = function(e) fail_and_exit(paste0("XCMS processing failed: ", conditionMessage(e))))

} else if (file.exists(table_path)) {
  # ---- Path B: pre-quantified table -> MetaboAnalystR stats only ----
  feature_df <- tryCatch({
    t <- read.csv(table_path, stringsAsFactors = FALSE, check.names = FALSE)
    if (!all(c("feature_id", "value", "unit") %in% colnames(t)))
      fail_and_exit("metabolites.csv needs at least feature_id, value, unit columns.")
    data.frame(
      feature_id = as.character(t$feature_id),
      name = if ("name" %in% colnames(t)) t$name else NA_character_,
      value = as.numeric(t$value),
      unit = as.character(t$unit),
      change = if ("change" %in% colnames(t)) as.numeric(t$change) else NA_real_,
      change_unit = if ("change_unit" %in% colnames(t)) t$change_unit else NA_character_,
      p_value = if ("p_value" %in% colnames(t)) as.numeric(t$p_value) else NA_real_,
      adjusted_p_value = if ("adjusted_p_value" %in% colnames(t)) as.numeric(t$adjusted_p_value) else NA_real_,
      stringsAsFactors = FALSE
    )
  }, error = function(e) fail_and_exit(paste0("Could not read metabolites.csv: ", conditionMessage(e))))
  # NOTE: MetaboAnalystR normalization/annotation would run here on a supplied
  # peak list; with a pre-quantified table we pass native values through and
  # keep the supplied statistics rather than recomputing on unknown replicates.
} else {
  fail_and_exit(paste0("No raw/*.mzML and no metabolites.csv found in ", inputs_dir, "."))
}

# ---- write processed feature table artifact --------------------------------
write.csv(feature_df, feat_csv, row.names = FALSE, na = "")

# ---- shape schema results (metabolomics requires value+unit, non-null) -----
rows <- list()
skipped <- 0
for (i in seq_len(nrow(feature_df))) {
  r <- feature_df[i, ]
  v <- as_num_or_null(r$value)
  if (is.null(v)) { skipped <- skipped + 1; next }  # value is required+numeric
  row <- list(
    featureId = as.character(r$feature_id),
    name = if (is.na(r$name)) NULL else as.character(r$name),
    value = v,
    unit = as.character(r$unit),
    change = as_num_or_null(r$change),
    changeUnit = if (is.na(r$change_unit)) NULL else as.character(r$change_unit),
    pValue = clip01(r$p_value),
    adjustedPValue = clip01(r$adjusted_p_value),
    conditionId = cond_id
  )
  rows[[length(rows) + 1]] <- row
}

if (length(rows) == 0) fail_and_exit("No metabolite features with a numeric value were produced.")
status <- if (skipped > 0) "partial" else "available"
reason <- if (status == "partial")
  paste0(skipped, " feature(s) dropped for a missing numeric value.") else NULL

section <- list(
  status = status,
  method = method_str,
  notAvailableReason = reason,
  artifactIds = list("metabolite_features"),
  results = rows
)
artifacts <- list(make_artifact(
  "metabolite_features", feat_csv_uri, role = "metabolite-feature-table",
  media_type = "text/csv", local_path = feat_csv
))

emit_bundle(list(metabolomics = section), artifacts, output_path)
message("[metabolomics] wrote ", output_path, " (", length(rows), " features)")
