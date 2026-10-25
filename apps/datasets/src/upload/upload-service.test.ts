import { describe, it, expect } from "vitest";
import { asId } from "@chassix/shared";
import { Modality } from "../types.js";
import { sha256 } from "./checksum.js";
import { inspectFormat } from "./format-inspector.js";
import { UploadService, CrossWorkspaceAccessError } from "./upload-service.js";

const ws = asId<"WorkspaceId">("ws-1");
const other = asId<"WorkspaceId">("ws-2");

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

const FASTA = ">contig1\nACGTACGTACGT\n>contig2\nTTTTGGGGCCCC\n";

describe("UploadService — resumable upload & validation (Step 2.5)", () => {
  it("interrupted upload resumes and yields exactly ONE DatasetVersion", () => {
    const svc = new UploadService(() => new Date("2026-10-24T00:00:00.000Z"));
    const data = bytes(FASTA);
    const checksum = sha256(data);
    const init = {
      uploadKey: "key-abc",
      workspaceId: ws,
      fileName: "assembly.fasta",
      declaredChecksum: checksum,
      totalSize: data.byteLength,
      chunkSize: 8,
    };

    // First attempt: send chunk 0, then "interrupt".
    const p0 = svc.initiate(init);
    const c0 = data.subarray(0, 8);
    svc.receiveChunk(p0.sessionId, ws, 0, c0);

    // Resume: re-initiate with SAME key → same session (no new one), continue from nextChunkIndex.
    const resumed = svc.initiate(init);
    expect(resumed.sessionId).toBe(p0.sessionId);
    expect(resumed.nextChunkIndex).toBe(1);
    svc.receiveChunk(resumed.sessionId, ws, 1, data.subarray(8));

    const r1 = svc.finalize(resumed.sessionId, ws);
    expect(r1.kind).toBe("ok");
    if (r1.kind !== "ok") return;
    expect(r1.deduplicated).toBe(false);
    const id = r1.datasetVersion.id;

    // Finalize again (double submit) → same DatasetVersion, deduplicated, no second record.
    const r2 = svc.finalize(resumed.sessionId, ws);
    expect(r2.kind).toBe("ok");
    if (r2.kind !== "ok") return;
    expect(r2.deduplicated).toBe(true);
    expect(r2.datasetVersion.id).toBe(id);

    // Re-initiate again after finalize → still the same session/record.
    const again = svc.initiate(init);
    const r3 = svc.finalize(again.sessionId, ws);
    expect(r3.kind === "ok" && r3.datasetVersion.id).toBe(id);

    expect(r1.datasetVersion.checksum).toBe(checksum);
    expect(r1.datasetVersion.modality).toBe(Modality.Genomics);
    expect(r1.datasetVersion.fileSizeBytes).toBe(data.byteLength);
  });

  it("checksum mismatch BLOCKS with an actionable message and creates no DatasetVersion", () => {
    const svc = new UploadService();
    const data = bytes(FASTA);
    const init = {
      uploadKey: "key-bad",
      workspaceId: ws,
      fileName: "assembly.fasta",
      declaredChecksum: "deadbeef", // wrong on purpose
      totalSize: data.byteLength,
      chunkSize: 1024,
    };
    const p = svc.initiate(init);
    svc.receiveChunk(p.sessionId, ws, 0, data);
    const out = svc.finalize(p.sessionId, ws);
    expect(out.kind).toBe("checksum_mismatch");
    if (out.kind !== "checksum_mismatch") return;
    expect(out.expected).toBe("deadbeef");
    expect(out.actual).toBe(sha256(data));
    expect(out.message).toMatch(/re-upload/i);

    // No DatasetVersion was created.
    const stableId = asId<"DatasetVersionId">("upload:key-bad:v1");
    expect(svc.readDatasetVersion(stableId, ws)).toBeNull();
  });

  it("unsupported format returns a CONCRETE remedy, not a generic failure", () => {
    const svc = new UploadService();
    const data = bytes("@read1\nACGT\n+\nFFFF\n"); // FASTQ-like
    const checksum = sha256(data);
    const init = {
      uploadKey: "key-fastq",
      workspaceId: ws,
      fileName: "reads.fastq",
      declaredChecksum: checksum,
      totalSize: data.byteLength,
      chunkSize: 1024,
    };
    const p = svc.initiate(init);
    svc.receiveChunk(p.sessionId, ws, 0, data);
    const out = svc.finalize(p.sessionId, ws);
    expect(out.kind).toBe("unsupported_format");
    if (out.kind !== "unsupported_format") return;
    expect(out.remedy).toMatch(/count matrix|FASTA/i);
    expect(out.remedy.length).toBeGreaterThan(20);
  });

  it("files are workspace-scoped: cross-workspace read is denied", () => {
    const svc = new UploadService();
    const data = bytes(FASTA);
    const init = {
      uploadKey: "key-scope",
      workspaceId: ws,
      fileName: "a.fasta",
      declaredChecksum: sha256(data),
      totalSize: data.byteLength,
      chunkSize: 1024,
    };
    const p = svc.initiate(init);
    svc.receiveChunk(p.sessionId, ws, 0, data);
    const out = svc.finalize(p.sessionId, ws);
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;

    // Same-workspace read works.
    expect(svc.readDatasetVersion(out.datasetVersion.id, ws)).not.toBeNull();
    // Cross-workspace read denied.
    expect(() => svc.readDatasetVersion(out.datasetVersion.id, other)).toThrow(
      CrossWorkspaceAccessError,
    );
    // Cross-workspace session access denied.
    expect(() => svc.getProgress(p.sessionId, other)).toThrow(CrossWorkspaceAccessError);
  });
});

describe("inspectFormat", () => {
  it("detects the initial supported formats", () => {
    expect(inspectFormat("x.fasta", bytes(">a\nACGT")).ok).toBe(true);
    expect(inspectFormat("x.gff3", bytes("##gff-version 3\n")).ok).toBe(true);
    expect(inspectFormat("counts.csv", bytes("gene_id,S1,S2\nG1,10,20\n")).ok).toBe(true);
    expect(inspectFormat("meta.tsv", bytes("sample_id\tcondition\nS1\tctrl\n")).ok).toBe(true);
    expect(inspectFormat("paths.tsv", bytes("pathway\tscore\nglycolysis\t1.2\n")).ok).toBe(true);
  });
});
