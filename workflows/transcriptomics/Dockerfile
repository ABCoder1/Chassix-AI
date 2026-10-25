# Transcriptomics branch image -- DESeq2 differential expression.
# Base: Bioconductor's official image (ships R + BiocManager + system libs).
# Pin the Bioconductor release so DESeq2's version is reproducible; RELEASE_3_19
# ships DESeq2 1.44.x. jsonlite is the only extra R dep for the emit bridge.
FROM bioconductor/bioconductor_docker:RELEASE_3_19

# python3 is present in this image; it runs the canonical emit_bundle.py.
RUN R -e "options(warn=2); BiocManager::install(c('DESeq2'), update=FALSE, ask=FALSE); install.packages('jsonlite', repos='https://cloud.r-project.org')"

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
