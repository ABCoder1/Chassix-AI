# Flux analysis / fluxomics branch image -- COBRApy FBA / pFBA.
# Base: slim CPython. COBRApy + a MILP/LP solver install cleanly via pip.
# COBRApy ships the GLPK solver (via optlang/swiglpk) by default, which is enough
# for FBA/pFBA; no proprietary solver license is required.
FROM python:3.12-slim

# libxml2 is needed by python-libsbml to parse SBML models.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libxml2 \
    && rm -rf /var/lib/apt/lists/*

# Pin COBRApy (docs/scientific-contracts.md: COBRApy via pip).
RUN pip install --no-cache-dir \
      cobra==0.29.0 \
      python-libsbml==5.20.4

WORKDIR /opt/chassix/flux
COPY common/ /opt/chassix/common/
COPY flux/flux_analysis.py /opt/chassix/flux/flux_analysis.py

ENV CHASSIX_INPUTS_DIR=/inputs \
    CHASSIX_OUTPUT=/outputs/bundle.flux.json \
    CHASSIX_FLUX_CSV=/outputs/flux_distribution.csv

ENTRYPOINT ["python", "/opt/chassix/flux/flux_analysis.py"]
