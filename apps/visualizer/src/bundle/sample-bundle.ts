import { ANALYSIS_BUNDLE_SCHEMA_VERSION, type AnalysisBundle } from "@chassix/analysis-bundle";

/**
 * An EXPLICITLY SYNTHETIC bundle used to exercise the real-data dashboard without a
 * live engine. Every value here is illustrative test data, not a measured or validated
 * result — the workflowId and strain say so, and the dashboard shows the run metadata.
 * It demonstrates the shape the engine produces: native units, provenance, and a
 * deliberately mixed status set (available flux/yield, available gene expression,
 * failed metabolomics, not-run interactions).
 */
export const SAMPLE_BUNDLE: AnalysisBundle = {
  schemaVersion: ANALYSIS_BUNDLE_SCHEMA_VERSION,
  run: {
    id: "sample-run-0001",
    workflowId: "chassix-demo-synthetic",
    workflowVersion: "0.1.0",
    status: "partial",
    createdAt: "2026-10-24T18:00:00.000Z",
    completedAt: "2026-10-24T18:07:12.000Z",
    modelVersions: [
      { id: "genome-scale-model", version: "iMM904", uri: "http://bigg.ucsd.edu/models/iMM904" },
      { id: "deseq2", version: "1.44.0", uri: null },
    ],
  },
  organism: {
    chassisId: "yeast",
    taxonId: "559292",
    taxonName: "Saccharomyces cerevisiae",
    strainId: null,
    strainName: "S288C (synthetic demo)",
  },
  condition: {
    id: "heat-37c",
    temperatureC: 37,
    salinityMolL: 0.2,
    pH: 5.5,
    timepoint: { value: 6, unit: "h" },
    media: "SC glucose",
    oxygenation: "aerobic",
    other: {},
  },
  artifacts: [
    {
      id: "art-flux",
      uri: "gs://chassix-demo/sample/flux.csv",
      mediaType: "text/csv",
      sha256: null,
      role: "flux-distribution",
    },
    {
      id: "art-de",
      uri: "gs://chassix-demo/sample/deseq2.csv",
      mediaType: "text/csv",
      sha256: null,
      role: "differential-expression",
    },
    {
      id: "art-yield",
      uri: "gs://chassix-demo/sample/yields.csv",
      mediaType: "text/csv",
      sha256: null,
      role: "yield-table",
    },
  ],
  analyses: {
    geneExpression: {
      status: "available",
      method: "DESeq2 1.44.0 (Wald, apeglm shrink)",
      contrastId: "heat37_vs_ref30",
      artifactIds: ["art-de"],
      results: [
        {
          featureId: "YLL026W",
          symbol: "HSP104",
          featureType: "gene",
          log2FoldChange: 3.42,
          pValue: 2.1e-18,
          adjustedPValue: 5.6e-16,
          baseMean: 2140,
          unit: "log2FoldChange",
        },
        {
          featureId: "YLL024C",
          symbol: "SSA2",
          featureType: "gene",
          log2FoldChange: 2.11,
          pValue: 4.0e-9,
          adjustedPValue: 3.1e-7,
          baseMean: 5120,
          unit: "log2FoldChange",
        },
        {
          featureId: "YBR072W",
          symbol: "HSP26",
          featureType: "gene",
          log2FoldChange: 4.98,
          pValue: 1.0e-30,
          adjustedPValue: 9.0e-28,
          baseMean: 880,
          unit: "log2FoldChange",
        },
        {
          featureId: "YKL060C",
          symbol: "FBA1",
          featureType: "gene",
          log2FoldChange: -0.12,
          pValue: 0.41,
          adjustedPValue: 0.62,
          baseMean: 9900,
          unit: "log2FoldChange",
        },
      ],
    },
    flux: {
      status: "available",
      method: "COBRApy 0.29.0 parsimonious FBA",
      modelId: "iMM904",
      objective: "BIOMASS_SC5_notrace",
      artifactIds: ["art-flux"],
      results: [
        {
          reactionId: "EX_glc__D_e",
          reactionName: "D-glucose exchange",
          flux: -10.0,
          unit: "mmol/gDW/h",
          conditionId: "heat-37c",
          lowerBound: -10,
          upperBound: 1000,
        },
        {
          reactionId: "BIOMASS_SC5_notrace",
          reactionName: "Biomass",
          flux: 0.287,
          unit: "1/h",
          conditionId: "heat-37c",
          lowerBound: 0,
          upperBound: 1000,
          uncertainty: { lower: 0.27, upper: 0.3, confidenceLevel: 0.95 },
        },
        {
          reactionId: "EX_etoh_e",
          reactionName: "Ethanol exchange",
          flux: 15.8,
          unit: "mmol/gDW/h",
          conditionId: "heat-37c",
          lowerBound: 0,
          upperBound: 1000,
        },
      ],
      pathwaySummaries: [
        {
          pathwayId: "glycolysis",
          name: "Glycolysis / gluconeogenesis",
          flux: 18.4,
          unit: "mmol/gDW/h",
          conditionId: "heat-37c",
          direction: "forward",
          reactionIds: ["PGI", "PFK", "FBA"],
        },
      ],
    },
    yield: {
      status: "available",
      method: "Derived from pFBA flux distribution",
      artifactIds: ["art-yield"],
      results: [
        {
          metricId: "etoh_per_glc",
          name: "Ethanol yield on glucose",
          value: 0.44,
          unit: "g/g",
          kind: "predicted",
          conditionId: "heat-37c",
          uncertainty: { lower: 0.41, upper: 0.46, confidenceLevel: 0.95 },
        },
        {
          metricId: "biomass_per_glc",
          name: "Biomass yield on glucose",
          value: 0.16,
          unit: "gDW/g",
          kind: "predicted",
          conditionId: "heat-37c",
        },
      ],
    },
    metabolomics: {
      status: "failed",
      method: "XCMS 4.2.0",
      notAvailableReason: "Peak detection failed: no valid mzML files found in the input bundle.",
      results: [],
    },
  },
};
