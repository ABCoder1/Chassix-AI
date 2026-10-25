/**
 * Step 3.5 — artifact-validation gate (PRD §F, BF-06 "Validating outputs").
 *
 * A raw executor "succeeded" advances a branch to `ValidatingOutputs`, NOT straight to
 * `Succeeded` (that mapping lives in `@chassix/shared`). Success requires the branch's
 * outputs to validate against its output schema — an exit code of 0 is not enough. The
 * validator is a pluggable port (`OutputValidator`); the fixture validator below checks that
 * every required artifact kind is present, available, and checksummed, so an "exit-0 but
 * invalid artifact" run is recorded as a FAILURE with a reason, never silently as success.
 */
import type { OutputValidator, ValidationResult, ArtifactRecord } from "./types.js";

/** Per-branch output contract: which artifact kinds a successful branch must emit. */
export type BranchOutputSchema = Readonly<
  Record<string, { readonly requiredKinds: readonly string[] }>
>;

/**
 * Fixture validator (illustrative until real scientific output contracts land — ADR-D10 /
 * cross-cutting rule). Requires, for the branch, every `requiredKind` to be matched by an
 * artifact that is `available` and carries a checksum (hash-verified, Step 3.5 DoD).
 */
export class FixtureOutputValidator implements OutputValidator {
  constructor(private readonly schema: BranchOutputSchema) {}

  async validate(input: {
    readonly branch: string;
    readonly artifacts: readonly ArtifactRecord[];
  }): Promise<ValidationResult> {
    const contract = this.schema[input.branch];
    // "Unknown stays unknown": with no output contract we cannot claim success.
    if (!contract) {
      return { valid: false, reason: `no output schema registered for branch '${input.branch}'` };
    }
    const missing: string[] = [];
    for (const kind of contract.requiredKinds) {
      const artifact = input.artifacts.find((a) => a.kind === kind);
      if (!artifact) {
        missing.push(`${kind} (absent)`);
      } else if (!artifact.available) {
        missing.push(`${kind} (unavailable)`);
      } else if (!artifact.checksum) {
        missing.push(`${kind} (no checksum)`);
      }
    }
    if (missing.length > 0) {
      return { valid: false, reason: `artifact validation failed: ${missing.join(", ")}` };
    }
    return { valid: true };
  }
}
