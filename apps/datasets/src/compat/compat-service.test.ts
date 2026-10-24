import { describe, it, expect } from "vitest";
import { asId } from "@chassix/shared";
import {
  Modality,
  DatasetSourceKind,
  LicenseAccess,
  AvailabilityStatus,
  stableDatasetId,
  asHostId,
} from "../types.js";
import type { DatasetVersion } from "../types.js";
import { CompatCheck, CompatClass, DEFAULT_COMPAT_POLICY, classify } from "./policy.js";
import type { BranchRequirement } from "./checks.js";
import { CompatibilityService, BlockingNotAcknowledgeableError } from "./compat-service.js";

const ws = asId<"WorkspaceId">("ws-1");
const actor = asId<"UserId">("user-1");
const branchId = asId<"BranchId">("branch-genomics");
const hostId = asHostId("host-geobac");

const dataset = (over: Partial<DatasetVersion> = {}): DatasetVersion => ({
  id: stableDatasetId(DatasetSourceKind.PublicRepository, "ACC-1", "v1"),
  workspaceId: ws,
  accession: "ACC-1",
  source: DatasetSourceKind.PublicRepository,
  repository: "fixture-geo",
  version: "v1",
  retrievalTimestamp: "2026-10-20T00:00:00.000Z",
  checksum: null,
  licenseAccess: LicenseAccess.Open,
  availability: AvailabilityStatus.Available,
  taxonomy: "Geobacillus thermoglucosidasius",
  strain: "C56-YS93",
  reference: "ASM18260v1",
  modality: Modality.Genomics,
  condition: null,
  sampleMapping: [],
  replicateCount: 3,
  fileSizeBytes: null,
  sourceLink: null,
  assay: null,
  qualitySummary: null,
  geneIdScheme: "locus_tag",
  contrasts: [],
  compatibilityWarnings: [],
  illustrative: true,
  ...over,
});

const requirement = (over: Partial<BranchRequirement> = {}): BranchRequirement => ({
  branchId,
  kind: Modality.Genomics,
  hostId,
  expectedTaxonomy: "Geobacillus thermoglucosidasius",
  expectedStrain: "C56-YS93",
  expectedReference: "ASM18260v1",
  requiredReplicates: 3,
  requiredContrasts: [],
  expectedConditions: [],
  expectedGeneIdScheme: "locus_tag",
  prerequisites: [],
  availablePrerequisites: [],
  ...over,
});

describe("Compatibility policy table (Step 2.6)", () => {
  it("classifies structural checks as blocking and the rest as warnings", () => {
    expect(classify(CompatCheck.TaxonomyStrainIdentity)).toBe(CompatClass.Blocking);
    expect(classify(CompatCheck.GenomeReferenceVersion)).toBe(CompatClass.Blocking);
    expect(classify(CompatCheck.BranchPrerequisiteAvailability)).toBe(CompatClass.Blocking);
    expect(classify(CompatCheck.SampleLabelConsistency)).toBe(CompatClass.Warning);
    expect(classify(CompatCheck.RequiredReplicates)).toBe(CompatClass.Warning);
    expect(classify(CompatCheck.Contrasts)).toBe(CompatClass.Warning);
    expect(classify(CompatCheck.ConditionMismatch)).toBe(CompatClass.Warning);
    expect(classify(CompatCheck.GeneIdentifiers)).toBe(CompatClass.Warning);
    // Every check has a policy entry.
    expect(Object.keys(DEFAULT_COMPAT_POLICY).sort()).toEqual(Object.values(CompatCheck).sort());
  });
});

describe("CompatibilityService", () => {
  it("a fully matching dataset produces no findings and is reachable", () => {
    const svc = new CompatibilityService();
    const findings = svc.evaluate(dataset(), requirement());
    expect(findings).toHaveLength(0);
    expect(svc.isReachable(dataset(), requirement())).toBe(true);
  });

  it("wrong strain → blocking finding per policy", () => {
    const svc = new CompatibilityService();
    const findings = svc.evaluate(dataset({ strain: "WRONG-STRAIN" }), requirement());
    const f = findings.find((x) => x.checkId === CompatCheck.TaxonomyStrainIdentity);
    expect(f?.class).toBe(CompatClass.Blocking);
  });

  it("wrong reference → blocking finding per policy", () => {
    const svc = new CompatibilityService();
    const findings = svc.evaluate(dataset({ reference: "hg38" }), requirement());
    const f = findings.find((x) => x.checkId === CompatCheck.GenomeReferenceVersion);
    expect(f?.class).toBe(CompatClass.Blocking);
  });

  it("too few replicates → warning finding per policy", () => {
    const svc = new CompatibilityService();
    const findings = svc.evaluate(dataset({ replicateCount: 1 }), requirement());
    const f = findings.find((x) => x.checkId === CompatCheck.RequiredReplicates);
    expect(f?.class).toBe(CompatClass.Warning);
  });

  it("an incompatible dataset CANNOT reach a blocked branch", () => {
    const svc = new CompatibilityService();
    const bad = dataset({ taxonomy: "Escherichia coli" });
    expect(svc.isReachable(bad, requirement())).toBe(false);
  });

  it("acknowledging a warning is recorded as an audit event", () => {
    const svc = new CompatibilityService(
      DEFAULT_COMPAT_POLICY,
      () => new Date("2026-10-24T09:00:00.000Z"),
    );
    const findings = svc.evaluate(dataset({ replicateCount: 1 }), requirement());
    const warn = findings.find((f) => f.class === CompatClass.Warning)!;
    const ev = svc.acknowledge(warn, actor, "Pilot accepts n=1 for this exploratory host");
    expect(ev.type).toBe("compatibility.acknowledged");
    expect(ev.actor).toBe(actor);
    expect(ev.timestamp).toBe("2026-10-24T09:00:00.000Z");
    expect(svc.isAcknowledged(warn)).toBe(true);
    expect(svc.auditLog()).toHaveLength(1);
  });

  it("acknowledging a BLOCKING finding is refused (cannot clear a structural block)", () => {
    const svc = new CompatibilityService();
    const findings = svc.evaluate(dataset({ strain: "WRONG" }), requirement());
    const block = findings.find((f) => f.class === CompatClass.Blocking)!;
    expect(() => svc.acknowledge(block, actor, "pretty please")).toThrow(
      BlockingNotAcknowledgeableError,
    );
    // Still unreachable even after attempting to acknowledge.
    expect(svc.isReachable(dataset({ strain: "WRONG" }), requirement())).toBe(false);
  });

  it("branch-prerequisite availability blocks when a prerequisite is missing", () => {
    const svc = new CompatibilityService();
    const req = requirement({ prerequisites: ["genome_assembly"], availablePrerequisites: [] });
    const f = svc
      .evaluate(dataset(), req)
      .find((x) => x.checkId === CompatCheck.BranchPrerequisiteAvailability);
    expect(f?.class).toBe(CompatClass.Blocking);
    expect(svc.isReachable(dataset(), req)).toBe(false);
  });

  it("coverage matrix links datasets → branch → host with worst-case status", () => {
    const svc = new CompatibilityService();
    const ok = dataset();
    const blocked = dataset({ reference: "hg38" });
    const warnOnly = dataset({ replicateCount: 1 });
    const matrix = svc.buildCoverageMatrix([
      { dataset: ok, requirement: requirement() },
      { dataset: blocked, requirement: requirement() },
      { dataset: warnOnly, requirement: requirement() },
    ]);
    expect(matrix[0]!.status).toBe("ok");
    expect(matrix[0]!.reachable).toBe(true);
    expect(matrix[1]!.status).toBe("blocked");
    expect(matrix[1]!.reachable).toBe(false);
    expect(matrix[2]!.status).toBe("warning");
    expect(matrix[2]!.reachable).toBe(true);
    expect(matrix[2]!.acknowledged).toBe(false);
  });

  it("unknown expectation does not fabricate a mismatch (unknown stays unknown)", () => {
    const svc = new CompatibilityService();
    // dataset has unknown reference; requirement expects one → no reference finding fabricated.
    const findings = svc.evaluate(dataset({ reference: null }), requirement());
    expect(findings.some((f) => f.checkId === CompatCheck.GenomeReferenceVersion)).toBe(false);
  });
});
