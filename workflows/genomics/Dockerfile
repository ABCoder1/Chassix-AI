# Genomics branch image -- FastQC read QC.
# Base: micromamba (conda-forge/bioconda) so we get a version-pinned FastQC plus
# a Python runtime for the shared emit_bundle helper.
FROM mambaorg/micromamba:1.5.8

# Tool versions pinned to docs/scientific-contracts.md (FastQC 0.12.x).
# fastqc pulls a JRE; python runs the branch driver + bundle emitter.
RUN micromamba install -y -n base -c conda-forge -c bioconda \
      python=3.12 \
      fastqc=0.12.1 \
    && micromamba clean --all --yes

ENV PATH=/opt/conda/bin:$PATH
ARG MAMBA_DOCKERFILE_ACTIVATE=1

# Layout: /opt/chassix/common holds the shared helper; branch code beside it.
WORKDIR /opt/chassix/genomics
COPY common/ /opt/chassix/common/
COPY genomics/run_genomics.py /opt/chassix/genomics/run_genomics.py

# Default I/O paths match the gcsFuse mounts in batch-genomics.json.
ENV CHASSIX_INPUTS_DIR=/inputs \
    CHASSIX_QC_DIR=/outputs/fastqc \
    CHASSIX_OUTPUT=/outputs/bundle.genomics.json

ENTRYPOINT ["python", "/opt/chassix/genomics/run_genomics.py"]
