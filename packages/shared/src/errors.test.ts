import { describe, it, expect } from "vitest";
import { apiError, ApiErrorSchema } from "./errors.js";

describe("ApiError envelope (PRD §7)", () => {
  it("builds a valid, retryability-tagged error with a correlation id", () => {
    const err = apiError("UNAUTHORIZED", "Sign in to continue.", {
      correlationId: "corr_123",
    });
    expect(err).toEqual({
      code: "UNAUTHORIZED",
      message: "Sign in to continue.",
      retryable: false,
      correlationId: "corr_123",
    });
    expect(ApiErrorSchema.safeParse(err).success).toBe(true);
  });

  it("carries optional non-secret details and an explicit retryable flag", () => {
    const err = apiError("UPSTREAM_TIMEOUT", "Try again shortly.", {
      retryable: true,
      correlationId: "corr_456",
      details: { upstream: "literature" },
    });
    expect(err.retryable).toBe(true);
    expect(err.details).toEqual({ upstream: "literature" });
  });

  it("rejects an envelope missing a correlation id", () => {
    expect(ApiErrorSchema.safeParse({ code: "X", message: "y", retryable: false }).success).toBe(
      false,
    );
  });
});
