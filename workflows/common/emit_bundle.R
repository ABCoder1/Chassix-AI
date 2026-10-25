# emit_bundle.R -- R bridge to the canonical Python bundle emitter.
#
# The R/Bioconductor branches (transcriptomics, pathways, metabolomics) do their
# science in R, write their native results to a plain intermediate (data frame ->
# the section's `results` array), then call this bridge. The bridge serializes
# the `analyses` object and `artifacts` array to temp JSON and shells out to
# `emit_bundle.py`, so there is ONE validation + assembly path for every branch.
#
# Rationale: keeping assembly/validation in a single implementation avoids schema
# drift between a Python and an R copy. R only needs jsonlite (ships in every
# Bioconductor image).
#
# Example (see deseq2_analysis.R):
#   source("/opt/chassix/common/emit_bundle.R")
#   section <- list(
#     status = "available",
#     method = paste0("DESeq2 ", as.character(packageVersion("DESeq2"))),
#     contrastId = contrast_id,
#     artifactIds = list("de_table"),
#     results = de_rows            # list of named lists, native units
#   )
#   artifacts <- list(list(
#     id = "de_table", uri = out_uri, role = "differential-expression-table",
#     mediaType = "text/csv", localPath = de_csv_path
#   ))
#   emit_bundle(list(geneExpression = section), artifacts, output_path)

suppressMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("emit_bundle.R requires the 'jsonlite' package.")
  }
})

# Path to the Python emitter; override with CHASSIX_EMIT_BUNDLE_PY if needed.
.emit_bundle_py <- function() {
  env <- Sys.getenv("CHASSIX_EMIT_BUNDLE_PY", "")
  if (nzchar(env)) return(env)
  # Default container layout copies the helper next to this file.
  cand <- file.path(dirname(.emit_bundle_self_dir()), "common", "emit_bundle.py")
  if (file.exists(cand)) return(cand)
  cand2 <- file.path(.emit_bundle_self_dir(), "emit_bundle.py")
  if (file.exists(cand2)) return(cand2)
  "/opt/chassix/common/emit_bundle.py"
}

.emit_bundle_self_dir <- function() {
  # Best-effort: directory of this sourced file.
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grepl("^--file=", args)])
  if (length(file_arg) == 1 && nzchar(file_arg)) return(dirname(normalizePath(file_arg)))
  getwd()
}

#' Build a schema `artifact` list, computing sha256 is deferred to Python.
#' @param local_path optional path on disk; Python computes sha256 from it.
make_artifact <- function(id, uri, role, media_type = NULL, local_path = NULL) {
  a <- list(id = id, uri = uri, role = role)
  if (!is.null(media_type)) a$mediaType <- media_type
  if (!is.null(local_path)) a$localPath <- local_path
  a
}

#' A section for a step that errored -- empty results, explicit failure.
failed_section <- function(reason, method = NULL) {
  list(
    status = "failed",
    method = method,
    notAvailableReason = reason,
    artifactIds = list(),
    results = list()
  )
}

#' Assemble + validate + write a bundle by delegating to emit_bundle.py.
#' @param analyses named list mapping schema keys to section lists.
#' @param artifacts list of artifact lists (see make_artifact), or list().
#' @param output_path final bundle path.
emit_bundle <- function(analyses, artifacts = list(), output_path) {
  tmp_analyses <- tempfile(fileext = ".json")
  tmp_artifacts <- tempfile(fileext = ".json")
  on.exit(unlink(c(tmp_analyses, tmp_artifacts)), add = TRUE)

  # auto_unbox so scalars are not wrapped in length-1 arrays; keep [] for lists.
  jsonlite::write_json(analyses, tmp_analyses, auto_unbox = TRUE,
                       null = "null", pretty = TRUE)
  jsonlite::write_json(artifacts, tmp_artifacts, auto_unbox = TRUE,
                       null = "null", pretty = TRUE)

  py <- Sys.getenv("PYTHON", "python3")
  script <- .emit_bundle_py()
  status <- system2(
    py,
    args = c("-I", shQuote(script),
             "--analyses", shQuote(tmp_analyses),
             "--artifacts", shQuote(tmp_artifacts),
             "--output", shQuote(output_path))
  )
  if (status != 0) {
    stop(sprintf("emit_bundle.py exited with status %d", status))
  }
  invisible(output_path)
}
