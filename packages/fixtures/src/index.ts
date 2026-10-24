/**
 * Fixture corpus (Step 0 / PRD §11). Everything here is ILLUSTRATIVE until real
 * scientific tools and scientific-owner sign-off land (see docs/decisions.md ADR-D10).
 * No fabricated results are presented as real — fixtures are explicitly labeled.
 *
 * The §11 scenarios each get a fixture as the corresponding steps are implemented:
 * empty/ambiguous goal, no/conflicting literature, wrong strain/reference, interrupted
 * upload, double launch, out-of-order branches, partial failure, late retry, reconnect,
 * unsupported chat claim, chart-filter agreement, cross-workspace denial.
 */
export const FIXTURES_ARE_ILLUSTRATIVE = true as const;

/** Marker so downstream code can assert it is not treating a fixture as real evidence. */
export interface IllustrativeFixture {
  readonly illustrative: true;
  readonly scenario: string;
}
