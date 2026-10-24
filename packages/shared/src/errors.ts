import { z } from "zod";

/**
 * Machine-readable API error envelope (PRD §7): a stable code, an actionable human
 * message, whether the caller may retry, and a correlation ID for tracing. Every
 * non-2xx API response body uses this shape.
 */
export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  correlationId: z.string().min(1),
  /** Optional structured detail; never contains secrets. */
  details: z.record(z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const apiError = (
  code: string,
  message: string,
  opts: { retryable?: boolean; correlationId: string; details?: Record<string, unknown> },
): ApiError =>
  ApiErrorSchema.parse({
    code,
    message,
    retryable: opts.retryable ?? false,
    correlationId: opts.correlationId,
    ...(opts.details ? { details: opts.details } : {}),
  });
