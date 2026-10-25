# Pathways branch image -- clusterProfiler functional enrichment.
# Base: Bioconductor (RELEASE_3_19 ships clusterProfiler 4.12.x).
# An OrgDb for the study organism MUST be installed here. We install a default
# (org.EcK12.eg.db for E. coli K-12) as an example; add the OrgDb(s) your study
# organisms need, or extend this image per organism. clusterProfiler reads the
# OrgDb named in params.json (orgDb field).
FROM bioconductor/bioconductor_docker:RELEASE_3_19

RUN R -e "options(warn=2); BiocManager::install(c('clusterProfiler','org.EcK12.eg.db'), update=FALSE, ask=FALSE); install.packages('jsonlite', repos='https://cloud.r-project.org')"

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
