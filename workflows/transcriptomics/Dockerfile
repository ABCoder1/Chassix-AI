# Transcriptomics branch image -- DESeq2 differential expression.
# Base: Bioconductor's official image (ships R + BiocManager + system libs).
# Pin the Bioconductor release so DESeq2's version is reproducible; RELEASE_3_19
# ships DESeq2 1.44.x. jsonlite is the only extra R dep for the emit bridge.
FROM bioconductor/bioconductor_docker:RELEASE_3_19

# python3 is present in this image; it runs the canonical emit_bundle.py.
# Pin CRAN to a dated Posit snapshot matching this Bioconductor release (3.19 was current 2024-05 to
# 2024-10). Otherwise BiocManager resolves CRAN to ".../cran/latest" (2025/2026 packages) against
# Bioc 3.19 — a version skew that can break DESeq2's CRAN deps. Long timeout + retry so a flaky/
# truncated download does not abort the build; verify the targets installed (replaces options(warn=2),
# which escalated every transient download warning to a hard error).
RUN R -e "options(timeout = 3600, repos = c(CRAN = 'https://packagemanager.posit.co/cran/2024-10-28')); \
  has <- function(p) all(p %in% rownames(installed.packages())); \
  pkgs <- c('DESeq2', 'jsonlite'); \
  for (i in 1:3) { if (has(pkgs)) break; tryCatch({ BiocManager::install('DESeq2', update = FALSE, ask = FALSE); install.packages('jsonlite') }, error = function(e) message('attempt ', i, ' failed: ', conditionMessage(e))); if (!has(pkgs)) Sys.sleep(5) }; \
  if (!has(pkgs)) quit(status = 1)"

# Layout mirrors the other branches.
RUN mkdir -p /opt/chassix/common /opt/chassix/transcriptomics
COPY common/ /opt/chassix/common/
COPY transcriptomics/deseq2_analysis.R /opt/chassix/transcriptomics/deseq2_analysis.R

ENV CHASSIX_INPUTS_DIR=/inputs \
    CHASSIX_OUTPUT=/outputs/bundle.transcriptomics.json \
    CHASSIX_DE_CSV=/outputs/differential_expression.csv \
    CHASSIX_EMIT_BUNDLE_R=/opt/chassix/common/emit_bundle.R \
    CHASSIX_EMIT_BUNDLE_PY=/opt/chassix/common/emit_bundle.py \
    PYTHON=python3

ENTRYPOINT ["Rscript", "/opt/chassix/transcriptomics/deseq2_analysis.R"]
