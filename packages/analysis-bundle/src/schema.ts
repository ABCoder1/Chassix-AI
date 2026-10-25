import { z } from "zod";

/**
 * Chassix-AI workflow analysis bundle — the data contract between the core
 * engine (producer) and the digital-twin dashboard (consumer).
 *
 * This is the typed/validated mirror of `analysis-bundle.schema.json`
 * (`urn:chassix-ai:workflow-analysis-bundle:1.0.0`). It stores **native values
 * with their units and provenance**; it is NOT a prediction model and never
 * coerces real fluxes / expression / concentrations / titers into a display
 * scale. "Unknown stays unknown": an ungroundable scalar is `null`, never
 * inferred. An absent analysis carries an explicit `status` ("not_run" /
 * "failed" / "partial"), so a missing section is never shown as a plausible value.
 *
 * Keep this file in lock-step with the JSON schema; bump {@link ANALYSIS_BUNDLE_SCHEMA_VERSION}
 * and the JSON `$id` together on any breaking change.
 */

export const ANALYSIS_BUNDLE_SCHEMA_VERSION = "1.0.0" as const;

/** Lifecycle of the workflow run that produced the bundle. */
export const RunStatus = z.enum(["queued", "running", "completed", "partial", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

/** Per-analysis availability. `not_run` and `failed` are first-class, never a 0-value stand-in. */
export const AnalysisStatus = z.enum(["available", "partial", "not_run", "failed"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const ChassisId = z.enum(["yeast", "bacterium", "archaeon", "other"]);
export type ChassisId = z.infer<typeof ChassisId>;

const sha256 = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, "sha256 must be 64 hex characters")
  .nullable();

/** Symmetric-or-not interval with an optional confidence level in (0,1). */
export const Uncertainty = z
  .object({
    lower: z.number(),
    upper: z.number(),
    confidenceLevel: z.number().gt(0).lt(1).nullable(),
  })
  .strict()
  .nullable();
export type Uncertainty = z.infer<typeof Uncertainty>;

export const ModelVersion = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    uri: z.string().nullable().optional(),
  })
  .strict();
export type ModelVersion = z.infer<typeof ModelVersion>;

export const RunMeta = z
  .object({
    id: z.string().min(1),
    workflowId: z.string().min(1),
    workflowVersion: z.string().nullable().optional(),
    status: RunStatus,
    createdAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    modelVersions: z.array(ModelVersion).optional(),
  })
  .strict();
export type RunMeta = z.infer<typeof RunMeta>;

export const Organism = z
  .object({
    chassisId: ChassisId,
    taxonId: z.string().nullable(),
    taxonName: z.string().min(1),
    strainId: z.string().nullable(),
    strainName: z.string().nullable(),
  })
  .strict();
export type Organism = z.infer<typeof Organism>;

export const Timepoint = z
  .object({ value: z.number().min(0), unit: z.enum(["s", "min", "h", "d"]) })
  .strict()
  .nullable();
export type Timepoint = z.infer<typeof Timepoint>;

export const Condition = z
  .object({
    id: z.string().min(1),
    temperatureC: z.number().min(-273.15).nullable().optional(),
    salinityMolL: z.number().min(0).nullable().optional(),
    pH: z.number().nullable().optional(),
    timepoint: Timepoint.optional(),
    media: z.string().nullable().optional(),
    oxygenation: z.string().nullable().optional(),
    other: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })
  .strict();
export type Condition = z.infer<typeof Condition>;

export const Artifact = z
  .object({
    id: z.string().min(1),
    uri: z.string().min(1),
    mediaType: z.string().nullable().optional(),
    sha256: sha256.optional(),
    role: z.string().min(1),
  })
  .strict();
export type Artifact = z.infer<typeof Artifact>;

/** Fields shared by every analysis section. */
const analysisBase = {
  status: AnalysisStatus,
  method: z.string().nullable().optional(),
  notAvailableReason: z.string().nullable().optional(),
  artifactIds: z.array(z.string()).optional(),
};

const probability = z.number().min(0).max(1).nullable();

export const GeneExpressionResult = z
  .object({
    featureId: z.string().min(1),
    symbol: z.string().nullable().optional(),
    featureType: z.enum(["gene", "transcript", "protein"]),
    log2FoldChange: z.number().nullable(),
    pValue: probability,
    adjustedPValue: probability,
    baseMean: z.number().min(0).nullable().optional(),
    unit: z.literal("log2FoldChange").optional(),
  })
  .strict();
export type GeneExpressionResult = z.infer<typeof GeneExpressionResult>;

export const GeneExpression = z
  .object({
    ...analysisBase,
    contrastId: z.string().nullable().optional(),
    results: z.array(GeneExpressionResult),
  })
  .strict();
export type GeneExpression = z.infer<typeof GeneExpression>;

export const FluxResult = z
  .object({
    reactionId: z.string().min(1),
    reactionName: z.string().nullable().optional(),
    flux: z.number(),
    unit: z.string().min(1),
    conditionId: z.string().min(1),
    lowerBound: z.number().nullable().optional(),
    upperBound: z.number().nullable().optional(),
    uncertainty: Uncertainty.optional(),
  })
  .strict();
export type FluxResult = z.infer<typeof FluxResult>;

export const PathwaySummary = z
  .object({
    pathwayId: z.string().min(1),
    name: z.string().min(1),
    flux: z.number(),
    unit: z.string().min(1),
    conditionId: z.string().min(1),
    direction: z.enum(["forward", "reverse", "net", "unknown"]).optional(),
    reactionIds: z.array(z.string()).optional(),
    uncertainty: Uncertainty.optional(),
  })
  .strict();
export type PathwaySummary = z.infer<typeof PathwaySummary>;

export const FluxAnalysis = z
  .object({
    ...analysisBase,
    modelId: z.string().nullable().optional(),
    objective: z.string().nullable().optional(),
    results: z.array(FluxResult),
    pathwaySummaries: z.array(PathwaySummary).optional(),
  })
  .strict();
export type FluxAnalysis = z.infer<typeof FluxAnalysis>;

export const MetaboliteResult = z
  .object({
    featureId: z.string().min(1),
    name: z.string().nullable().optional(),
    value: z.number(),
    unit: z.string().min(1),
    change: z.number().nullable().optional(),
    changeUnit: z.string().nullable().optional(),
    pValue: probability.optional(),
    adjustedPValue: probability.optional(),
    uncertainty: Uncertainty.optional(),
    conditionId: z.string().min(1),
  })
  .strict();
export type MetaboliteResult = z.infer<typeof MetaboliteResult>;

export const Metabolomics = z
  .object({ ...analysisBase, results: z.array(MetaboliteResult) })
  .strict();
export type Metabolomics = z.infer<typeof Metabolomics>;

export const YieldResult = z
  .object({
    metricId: z.string().min(1),
    name: z.string().nullable().optional(),
    value: z.number(),
    unit: z.string().min(1),
    kind: z.enum(["measured", "predicted", "derived"]),
    conditionId: z.string().min(1),
    replicateCount: z.number().int().min(1).nullable().optional(),
    timepoint: z.number().min(0).nullable().optional(),
    timeUnit: z.string().nullable().optional(),
    uncertainty: Uncertainty.optional(),
  })
  .strict();
export type YieldResult = z.infer<typeof YieldResult>;

export const YieldAnalysis = z.object({ ...analysisBase, results: z.array(YieldResult) }).strict();
export type YieldAnalysis = z.infer<typeof YieldAnalysis>;

export const InteractionResult = z
  .object({
    sourceId: z.string().min(1),
    targetId: z.string().min(1),
    interactionType: z.string().min(1),
    evidenceType: z.string().min(1),
    score: probability.optional(),
    state: z.enum(["stable", "forming", "rearranging", "weakening", "disrupted"]).optional(),
    artifactIds: z.array(z.string()).optional(),
  })
  .strict();
export type InteractionResult = z.infer<typeof InteractionResult>;

export const Interactions = z
  .object({ ...analysisBase, results: z.array(InteractionResult) })
  .strict();
export type Interactions = z.infer<typeof Interactions>;

export const Analyses = z
  .object({
    geneExpression: GeneExpression.optional(),
    flux: FluxAnalysis.optional(),
    metabolomics: Metabolomics.optional(),
    yield: YieldAnalysis.optional(),
    interactions: Interactions.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length >= 1, {
    message: "analyses must contain at least one section",
  });
export type Analyses = z.infer<typeof Analyses>;

export const AnalysisBundle = z
  .object({
    schemaVersion: z.literal(ANALYSIS_BUNDLE_SCHEMA_VERSION),
    run: RunMeta,
    organism: Organism,
    condition: Condition,
    artifacts: z.array(Artifact).optional(),
    analyses: Analyses,
  })
  .strict();
export type AnalysisBundle = z.infer<typeof AnalysisBundle>;

/** Parse + validate untrusted input, throwing a ZodError on any violation. */
export const parseAnalysisBundle = (input: unknown): AnalysisBundle => AnalysisBundle.parse(input);

/** Non-throwing variant for UI load paths that want a typed error to display. */
export const safeParseAnalysisBundle = (
  input: unknown,
): z.SafeParseReturnType<unknown, AnalysisBundle> => AnalysisBundle.safeParse(input);
