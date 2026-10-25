# Metabolomics branch image -- XCMS peak detection + MetaboAnalystR statistics.
# Base: Bioconductor (RELEASE_3_19 ships xcms 4.2.x). MetaboAnalystR is NOT on
# Bioconductor/CRAN; it installs from GitHub with a number of Bioc/CRAN deps.
# The remotes install line below is the documented route; pin to a release tag.
FROM bioconductor/bioconductor_docker:RELEASE_3_19

# fgsea (installed below for MetaboAnalystR) compiles its C++ under C++11, but current BH (Boost)
# headers require C++14+ in Boost.Math ("'is_final'/'enable_if_t' ... not declared in 'std'").
# Pin BH to the last C++11-compatible release first (header-only, fast; kept pinned by update=FALSE).
RUN R -e "install.packages('https://cran.r-project.org/src/contrib/Archive/BH/BH_1.81.0-1.tar.gz', repos=NULL, type='source')"

# XCMS + MSnbase from Bioconductor; jsonlite + remotes from CRAN.
RUN R -e "options(warn=2); BiocManager::install(c('xcms','MSnbase'), update=FALSE, ask=FALSE); install.packages(c('jsonlite','remotes'), repos='https://cloud.r-project.org')"

# MetaboAnalystR downstream stats/annotation. Its dependency set is large; install
# the documented deps first, then the package from GitHub at a pinned tag.
# (Network access is required AT BUILD TIME only; the analysis script makes no
# network calls. Pin <TAG> to a MetaboAnalystR release for reproducibility.)
RUN R -e "options(warn=1); BiocManager::install(c('impute','pcaMethods','globaltest','GlobalAncova','Rgraphviz','preprocessCore','genefilter','sva','limma','KEGGgraph','siggenes','BiocParallel','MSnbase','multtest','RBGL','edgeR','fgsea'), update=FALSE, ask=FALSE)" \
    && R -e "remotes::install_github('xia-lab/MetaboAnalystR', ref='v4.0.0', dependencies=TRUE, upgrade='never')"

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
