import { z } from "zod";

/**
 * Goal interpretation (PRD §A / Implementation Guide Step 1.6). The planner extracts a
 * structured GoalVersion from a plain-language goal. It must NOT fabricate missing details:
 * a field it cannot ground is marked `unknown` (value null), and genuinely missing critical
 * details become `clarifyingQuestions`. `assumptions` are always editable by the user.
 */

export const FieldStatus = {
  /** Stated in or directly entailed by the user's prompt. */
  Extracted: "extracted",
  /** A reasonable assumption the planner made explicit (user-editable). */
  Assumed: "assumed",
  /** Not determinable from the prompt — never fabricated. */
  Unknown: "unknown",
} as const;
export type FieldStatus = (typeof FieldStatus)[keyof typeof FieldStatus];

export const ExtractedFieldSchema = z.object({
  /** Null when status is "unknown". */
  value: z.string().nullable(),
  status: z.enum([FieldStatus.Extracted, FieldStatus.Assumed, FieldStatus.Unknown]),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const GoalVersionDraftSchema = z.object({
  organismConstraints: ExtractedFieldSchema,
  desiredPhenotype: ExtractedFieldSchema,
  productContext: ExtractedFieldSchema,
  analysisObjectives: z.array(z.string()),
  successMeasures: z.array(z.string()),
  /** Explicit, user-editable assumptions the planner is making. */
  assumptions: z.array(z.object({ text: z.string(), editable: z.literal(true) })),
  /** Targeted questions for missing *critical* details — asked, never fabricated. */
  clarifyingQuestions: z.array(z.string()),
  /** Names of fields the planner marked unknown (mirrors any status:"unknown" above). */
  unknowns: z.array(z.string()),
});
export type GoalVersionDraft = z.infer<typeof GoalVersionDraftSchema>;

/** A draft plus the original prompt it was derived from (stored on the GoalVersion). */
export const GoalInterpretationSchema = z.object({
  originalPrompt: z.string().min(1),
  draft: GoalVersionDraftSchema,
});
export type GoalInterpretation = z.infer<typeof GoalInterpretationSchema>;
