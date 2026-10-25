# Metabolomics branch image -- XCMS peak detection + MetaboAnalystR statistics.
# Base: Bioconductor (RELEASE_3_19 ships xcms 4.2.x). MetaboAnalystR is NOT on
# Bioconductor/CRAN; it installs from GitHub with a number of Bioc/CRAN deps.
# The remotes install line below is the documented route; pin to a release tag.
FROM bioconductor/bioconductor_docker:RELEASE_3_19

# fgsea (installed below for MetaboAnalystR) compiles its C++ under C++11, but current BH (Boost)
# headers require C++14+ in Boost.Math ("'is_final'/'enable_if_t' ... not declared in 'std'").
# Pin BH to the last C++11-compatible release first (header-only, fast; kept pinned by update=FALSE).
RUN R -e "install.packages('https://cran.r-project.org/src/contrib/Archive/BH/BH_1.81.0-1.tar.gz', repos=NULL, type='source')"

# Pin CRAN to a dated Posit snapshot matching this Bioconductor release (3.19 was current 2024-05 to
# 2024-10). Otherwise BiocManager resolves CRAN to ".../cran/latest" (2025/2026 packages) against
# Bioc 3.19 — a skew that breaks the ggtree/treeio dependency tree MetaboAnalystR pulls in (newer CRAN
# yulab.utils dropped `random_ref`, which Bioc-3.19 treeio imports → "object 'random_ref' not found").
# (BH stays pinned above: installed from the archive with repos=NULL, kept by update=FALSE.)
ENV CHASSIX_CRAN=https://packagemanager.posit.co/cran/2024-10-28

# XCMS + MSnbase from Bioconductor; jsonlite + remotes from the pinned CRAN. Long timeout + retry so a
# flaky/truncated download of a large package does not abort the build; verify the targets installed.
RUN R -e "options(timeout = 3600, repos = c(CRAN = Sys.getenv('CHASSIX_CRAN'))); \
  has <- function(p) all(p %in% rownames(installed.packages())); \
  pkgs <- c('xcms', 'MSnbase', 'jsonlite', 'remotes'); \
  for (i in 1:3) { if (has(pkgs)) break; tryCatch({ BiocManager::install(c('xcms','MSnbase'), update = FALSE, ask = FALSE); install.packages(c('jsonlite','remotes')) }, error = function(e) message('attempt ', i, ' failed: ', conditionMessage(e))); if (!has(pkgs)) Sys.sleep(5) }; \
  if (!has(pkgs)) quit(status = 1)"

# MetaboAnalystR downstream stats/annotation. Its dependency set is large; install the documented
# deps first (long timeout + retry for the many big annotation downloads), then the package from
# GitHub at a pinned tag. (Network is required AT BUILD TIME only; the analysis script makes none.)
RUN R -e "options(timeout = 3600, repos = c(CRAN = Sys.getenv('CHASSIX_CRAN'))); \
  deps <- c('impute','pcaMethods','globaltest','GlobalAncova','Rgraphviz','preprocessCore','genefilter','sva','limma','KEGGgraph','siggenes','BiocParallel','MSnbase','multtest','RBGL','edgeR','fgsea'); \
  has <- function(p) all(p %in% rownames(installed.packages())); \
  for (i in 1:3) { if (has(deps)) break; tryCatch(BiocManager::install(deps, update = FALSE, ask = FALSE), error = function(e) message('attempt ', i, ' failed: ', conditionMessage(e))); if (!has(deps)) Sys.sleep(5) }; \
  if (!has(deps)) quit(status = 1)" \
    && R -e "options(timeout = 3600, repos = c(CRAN = Sys.getenv('CHASSIX_CRAN'))); remotes::install_github('xia-lab/MetaboAnalystR', ref='v4.0.0', dependencies=TRUE, upgrade='never'); if (!('MetaboAnalystR' %in% rownames(installed.packages()))) quit(status = 1)"

RUN mkdir -p /opt/chassix/common /opt/chassix/metabolomics
COPY common/ /opt/chassix/common/
COPY metabolomics/metabolomics_analysis.R /opt/chassix/metabolomics/metabolomics_analysis.R

ENV CHASSIX_INPUTS_DIR=/inputs \
    CHASSIX_OUTPUT=/outputs/bundle.metabolomics.json \
    CHASSIX_FEATURE_CSV=/outputs/metabolite_features.csv \
    CHASSIX_EMIT_BUNDLE_R=/opt/chassix/common/emit_bundle.R \
    CHASSIX_EMIT_BUNDLE_PY=/opt/chassix/common/emit_bundle.py \
    PYTHON=python3

ENTRYPOINT ["Rscript", "/opt/chassix/metabolomics/metabolomics_analysis.R"]
