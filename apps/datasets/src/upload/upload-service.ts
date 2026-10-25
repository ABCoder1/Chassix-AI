import {
  DatasetSourceKind,
  LicenseAccess,
  AvailabilityStatus,
  stableDatasetId,
  asUploadSessionId,
} from "../types.js";
import type {
  DatasetVersion,
  Modality,
  SampleMappingRow,
  UploadSessionId,
  WorkspaceId,
} from "../types.js";
import { verifyChecksum } from "./checksum.js";
import { inspectFormat } from "./format-inspector.js";

/** Parameters to open (or resume) a resumable upload. */
export interface UploadInit {
  /** Client idempotency key: the same key always maps to the same session (enables resume). */
  readonly uploadKey: string;
  readonly workspaceId: WorkspaceId;
  readonly fileName: string;
  /** Declared sha256 hex the assembled bytes must match. */
  readonly declaredChecksum: string;
  readonly totalSize: number;
  readonly chunkSize: number;
  readonly sampleMapping?: readonly SampleMappingRow[];
}

export type UploadSessionStatus = "in_progress" | "finalized";

/** Public view of a resumable upload's progress (chunk/offset model). */
export interface UploadProgress {
  readonly sessionId: UploadSessionId;
  readonly workspaceId: WorkspaceId;
  readonly fileName: string;
  readonly totalSize: number;
  readonly chunkSize: number;
  readonly receivedBytes: number;
  readonly receivedChunkIndices: readonly number[];
  /** Next chunk index the server expects (the first gap). */
  readonly nextChunkIndex: number;
  readonly status: UploadSessionStatus;
}

interface UploadSession {
  readonly id: UploadSessionId;
  readonly init: UploadInit;
  readonly chunks: Map<number, Uint8Array>;
  status: UploadSessionStatus;
  /** Set exactly once on successful finalize — the guard against duplicate DatasetVersions. */
  datasetVersion: DatasetVersion | null;
}

export type FinalizeOutcome =
  | { readonly kind: "ok"; readonly datasetVersion: DatasetVersion; readonly deduplicated: boolean }
  | {
      readonly kind: "checksum_mismatch";
      readonly expected: string;
      readonly actual: string;
      readonly message: string;
    }
  | { readonly kind: "unsupported_format"; readonly reason: string; readonly remedy: string };

/** Raised on a cross-workspace access attempt (BF-14; files are workspace-scoped). */
export class CrossWorkspaceAccessError extends Error {
  constructor() {
    super("Access denied: dataset/upload belongs to another workspace");
    this.name = "CrossWorkspaceAccessError";
  }
}

/**
 * Resumable upload + validation service (PRD §C; Step 2.5).
 *
 * Resume-without-duplicate: sessions are keyed by (workspaceId, uploadKey). Re-initiating
 * with the same key returns the SAME session, and `finalize` records its DatasetVersion
 * exactly once — a second finalize (or a finalize after a re-init) returns that same record
 * (`deduplicated: true`) instead of creating another. So an interrupted-then-resumed upload
 * yields exactly one DatasetVersion.
 *
 * Workspace scoping: every session and DatasetVersion carries a workspaceId; reads require a
 * matching workspace or raise {@link CrossWorkspaceAccessError}.
 */
export class UploadService {
  private readonly sessions = new Map<UploadSessionId, UploadSession>();
  private readonly byKey = new Map<string, UploadSessionId>();
  private readonly datasets = new Map<string, DatasetVersion>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private static sessionKey(workspaceId: WorkspaceId, uploadKey: string): string {
    return `${workspaceId}::${uploadKey}`;
  }

  /** Open a new session, or return the existing one for this (workspace, uploadKey) — resume. */
  initiate(init: UploadInit): UploadProgress {
    const key = UploadService.sessionKey(init.workspaceId, init.uploadKey);
    const existingId = this.byKey.get(key);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing) return this.progress(existing);
    }
    const id = asUploadSessionId(`upl_${key}`);
    const session: UploadSession = {
      id,
      init,
      chunks: new Map(),
      status: "in_progress",
      datasetVersion: null,
    };
    this.sessions.set(id, session);
    this.byKey.set(key, id);
    return this.progress(session);
  }

  /** Append (or re-send) a chunk. Re-sending an already-received index is a no-op (idempotent). */
  receiveChunk(
    sessionId: UploadSessionId,
    workspaceId: WorkspaceId,
    index: number,
    bytes: Uint8Array,
  ): UploadProgress {
    const session = this.requireSession(sessionId, workspaceId);
    if (session.status === "finalized") return this.progress(session);
    if (!session.chunks.has(index)) session.chunks.set(index, bytes);
    return this.progress(session);
  }

  /** Current progress — the basis for a client resuming from `nextChunkIndex`. */
  getProgress(sessionId: UploadSessionId, workspaceId: WorkspaceId): UploadProgress {
    return this.progress(this.requireSession(sessionId, workspaceId));
  }

  /**
   * Assemble chunks in order, verify checksum, inspect format, and create exactly one
   * DatasetVersion. Idempotent: a finalized session returns its existing record.
   */
  finalize(
    sessionId: UploadSessionId,
    workspaceId: WorkspaceId,
    opts: { readonly modalityOverride?: Modality } = {},
  ): FinalizeOutcome {
    const session = this.requireSession(sessionId, workspaceId);

    // Already finalized → return the one DatasetVersion (no duplicate).
    if (session.datasetVersion) {
      return { kind: "ok", datasetVersion: session.datasetVersion, deduplicated: true };
    }

    const assembled = this.assemble(session);

    const check = verifyChecksum(assembled, session.init.declaredChecksum);
    if (!check.ok) {
      // Blocking: do NOT create a DatasetVersion; return an actionable message.
      return {
        kind: "checksum_mismatch",
        expected: check.expected,
        actual: check.actual,
        message:
          `Checksum mismatch for "${session.init.fileName}": expected sha256 ${check.expected}, ` +
          `computed ${check.actual}. The transfer was likely corrupted or incomplete — ` +
          `re-upload the file (resume with the same upload key) and finalize again.`,
      };
    }

    const inspection = inspectFormat(session.init.fileName, assembled);
    if (!inspection.ok) {
      return { kind: "unsupported_format", reason: inspection.reason, remedy: inspection.remedy };
    }

    const modality = opts.modalityOverride ?? inspection.modality;
    const version = "v1";
    const id = stableDatasetId(DatasetSourceKind.Upload, session.init.uploadKey, version);
    const record: DatasetVersion = {
      id,
      workspaceId,
      accession: session.init.uploadKey,
      source: DatasetSourceKind.Upload,
      repository: null,
      version,
      retrievalTimestamp: this.now().toISOString(),
      checksum: check.actual,
      // Private upload: license/availability posture is workspace-local, not a public claim.
      licenseAccess: LicenseAccess.Unknown,
      availability: AvailabilityStatus.Available,
      taxonomy: null,
      strain: null,
      reference: null,
      modality,
      condition: null,
      sampleMapping: session.init.sampleMapping ? [...session.init.sampleMapping] : [],
      replicateCount: null,
      fileSizeBytes: assembled.byteLength,
      sourceLink: null,
      assay: null,
      qualitySummary: `Validated upload (${inspection.format}); ${inspection.note}`,
      geneIdScheme: null,
      contrasts: [],
      compatibilityWarnings: [],
      illustrative: false,
    };

    session.datasetVersion = record;
    session.status = "finalized";
    this.datasets.set(record.id, record);
    return { kind: "ok", datasetVersion: record, deduplicated: false };
  }

  /** Workspace-scoped read of a finalized DatasetVersion (BF-14). */
  readDatasetVersion(id: DatasetVersion["id"], workspaceId: WorkspaceId): DatasetVersion | null {
    const record = this.datasets.get(id);
    if (!record) return null;
    if (record.workspaceId !== workspaceId) throw new CrossWorkspaceAccessError();
    return record;
  }

  private requireSession(sessionId: UploadSessionId, workspaceId: WorkspaceId): UploadSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown upload session: ${sessionId}`);
    if (session.init.workspaceId !== workspaceId) throw new CrossWorkspaceAccessError();
    return session;
  }

  private assemble(session: UploadSession): Uint8Array {
    const indices = [...session.chunks.keys()].sort((a, b) => a - b);
    const parts: Uint8Array[] = [];
    for (const i of indices) {
      const chunk = session.chunks.get(i);
      if (chunk) parts.push(chunk);
    }
    return Buffer.concat(parts);
  }

  private progress(session: UploadSession): UploadProgress {
    const received = [...session.chunks.keys()].sort((a, b) => a - b);
    const receivedBytes = [...session.chunks.values()].reduce((n, c) => n + c.byteLength, 0);
    let nextChunkIndex = 0;
    while (session.chunks.has(nextChunkIndex)) nextChunkIndex += 1;
    return {
      sessionId: session.id,
      workspaceId: session.init.workspaceId,
      fileName: session.init.fileName,
      totalSize: session.init.totalSize,
      chunkSize: session.init.chunkSize,
      receivedBytes,
      receivedChunkIndices: received,
      nextChunkIndex,
      status: session.status,
    };
  }
}
