# Pathways branch image -- clusterProfiler functional enrichment.
# Base: Bioconductor (RELEASE_3_19 ships clusterProfiler 4.12.x).
# An OrgDb for the study organism MUST be installed here. We install a default
# (org.EcK12.eg.db for E. coli K-12) as an example; add the OrgDb(s) your study
# organisms need, or extend this image per organism. clusterProfiler reads the
# OrgDb named in params.json (orgDb field).
FROM bioconductor/bioconductor_docker:RELEASE_3_19

# clusterProfiler pulls in fgsea, whose C++ compiles under C++11 — but current BH (Boost) headers
# require C++14+ in Boost.Math, which breaks the build with errors like
# "'is_final' has not been declared in 'std'" / "'enable_if_t' ... not declared".
# Pin BH to the last C++11-compatible release BEFORE installing clusterProfiler so fgsea builds
# against it (BH is header-only, so this is a fast copy; update=FALSE below keeps it pinned).
RUN R -e "install.packages('https://cran.r-project.org/src/contrib/Archive/BH/BH_1.81.0-1.tar.gz', repos=NULL, type='source')"

# Pin CRAN to a dated Posit snapshot that matches this Bioconductor release (3.19 was current
# from 2024-05 to 2024-10). Without this, BiocManager resolves CRAN to ".../cran/latest" (current
# 2025/2026 packages) while Bioconductor stays at 3.19 — a version skew that breaks the clusterProfiler
# dependency tree: e.g. treeio 1.28.0 (Bioc 3.19) imports `random_ref` from yulab.utils, which newer
# CRAN yulab.utils removed, so treeio fails to load ("object 'random_ref' not found") and ggtree →
# enrichplot → clusterProfiler all fail. Pinning CRAN to the 3.19 era keeps the CRAN deps compatible.
# (BH stays pinned above: it was installed from the archive with repos=NULL and update=FALSE keeps it.)
#
# BiocManager also pulls large annotation packages (e.g. GO.db ~27 MB); a flaky/truncated download
# otherwise aborts the build ("downloaded length != reported length"). Use a long timeout and
# retry up to 3x (already-installed packages are skipped, so each retry resumes), then verify the
# targets are actually installed — rather than escalating every transient download warning to an error.
RUN R -e "options(timeout = 3600, repos = c(CRAN = 'https://packagemanager.posit.co/cran/2024-10-28')); \
  has <- function(p) all(p %in% rownames(installed.packages())); \
  pkgs <- c('clusterProfiler', 'org.EcK12.eg.db'); \
  for (i in 1:3) { if (has(pkgs)) break; tryCatch(BiocManager::install(pkgs, update = FALSE, ask = FALSE), error = function(e) message('attempt ', i, ' failed: ', conditionMessage(e))); if (!has(pkgs)) Sys.sleep(5) }; \
  if (!has(pkgs)) quit(status = 1); \
  for (i in 1:3) { if (has('jsonlite')) break; try(install.packages('jsonlite')) }; \
  if (!has('jsonlite')) quit(status = 1)"

RUN mkdir -p /opt/chassix/common /opt/chassix/pathways
COPY common/ /opt/chassix/common/
COPY pathways/enrichment.R /opt/chassix/pathways/enrichment.R

ENV CHASSIX_INPUTS_DIR=/inputs \
    CHASSIX_OUTPUT=/outputs/bundle.pathways.json \
    CHASSIX_ENRICH_CSV=/outputs/enrichment_table.csv \
    CHASSIX_EMIT_BUNDLE_R=/opt/chassix/common/emit_bundle.R \
    CHASSIX_EMIT_BUNDLE_PY=/opt/chassix/common/emit_bundle.py \
    PYTHON=python3

ENTRYPOINT ["Rscript", "/opt/chassix/pathways/enrichment.R"]
