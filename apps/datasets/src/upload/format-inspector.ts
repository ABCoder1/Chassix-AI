import { Modality } from "../types.js";

/**
 * Supported upload formats for the pilot (PRD §C; exact schemas/limits finalized with
 * pipeline owners, ADR-D10). Raw sequencing (FASTQ/BAM) is intentionally NOT advertised as
 * supported yet — it is "separately sized and validated" — so it yields a concrete remedy.
 */
export const UploadFormat = {
  Fasta: "fasta",
  Gff: "gff",
  CountMatrix: "count_matrix",
  SampleMetadata: "sample_metadata",
  PathwayTable: "pathway_table",
} as const;
export type UploadFormat = (typeof UploadFormat)[keyof typeof UploadFormat];

export type FormatInspection =
  | {
      readonly ok: true;
      readonly format: UploadFormat;
      readonly modality: Modality;
      readonly note: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      /** Concrete next step — never a generic "upload failed" (PRD §C, Step 2.5 DoD). */
      readonly remedy: string;
    };

const ext = (fileName: string): string => {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
};

const head = (bytes: Uint8Array, n = 4096): string =>
  Buffer.from(bytes.subarray(0, n)).toString("utf8");

const SUPPORTED_SUMMARY =
  "Supported uploads: FASTA (.fasta/.fa/.fna) or GFF3 (.gff/.gff3) for genomics; " +
  "count matrix (.csv/.tsv with a gene column + sample columns) plus a sample-metadata sheet " +
  "for expression/perturbation; pathway tables (.tsv) or SBML model files (.sbml/.xml) for pathways.";

/**
 * Inspect an uploaded file by name + content sniff. Content-based detection is deliberate so
 * a mislabeled extension is caught. Unsupported input returns a concrete remedy.
 * Uploaded bytes are treated strictly as data (cross-cutting rule) — never executed.
 */
export const inspectFormat = (fileName: string, bytes: Uint8Array): FormatInspection => {
  const e = ext(fileName);
  const text = head(bytes);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";

  // Raw sequencing: recognized but explicitly not-yet-supported, with a concrete remedy.
  if (["fastq", "fq", "bam", "sam", "cram"].includes(e) || firstLine.startsWith("@")) {
    return {
      ok: false,
      reason: `Raw sequencing input ("${e || "fastq-like"}") is not yet an advertised upload format.`,
      remedy:
        "Raw sequencing intake is sized and validated separately. For now, upload a processed " +
        "count matrix (.csv/.tsv) with a sample-metadata sheet, or an assembled FASTA, instead.",
    };
  }

  if (["fasta", "fa", "fna"].includes(e) || firstLine.startsWith(">")) {
    return {
      ok: true,
      format: UploadFormat.Fasta,
      modality: Modality.Genomics,
      note: firstLine.startsWith(">") ? "FASTA header detected" : "FASTA by extension",
    };
  }

  if (["gff", "gff3"].includes(e) || firstLine.startsWith("##gff-version")) {
    return {
      ok: true,
      format: UploadFormat.Gff,
      modality: Modality.Genomics,
      note: "GFF annotation detected",
    };
  }

  if (["sbml"].includes(e) || text.includes("<sbml")) {
    return {
      ok: true,
      format: UploadFormat.PathwayTable,
      modality: Modality.Pathways,
      note: "SBML model detected",
    };
  }

  if (["csv", "tsv", "txt", "xml"].includes(e)) {
    const sep = e === "csv" ? "," : "\t";
    const header = firstLine.split(sep).map((h) => h.trim().toLowerCase());
    const looksPathway = header.some((h) => ["pathway", "reaction", "ko", "module"].includes(h));
    if (looksPathway) {
      return {
        ok: true,
        format: UploadFormat.PathwayTable,
        modality: Modality.Pathways,
        note: "Pathway table header detected",
      };
    }
    const looksMetadata = header.some((h) => ["sample", "sample_id", "condition"].includes(h));
    const geneCol = header.some((h) => ["gene", "gene_id", "locus_tag", "feature"].includes(h));
    if (geneCol && header.length >= 2) {
      return {
        ok: true,
        format: UploadFormat.CountMatrix,
        modality: Modality.TranscriptomicsPerturbation,
        note: "Count matrix (gene column + sample columns) detected",
      };
    }
    if (looksMetadata) {
      return {
        ok: true,
        format: UploadFormat.SampleMetadata,
        modality: Modality.TranscriptomicsPerturbation,
        note: "Sample-metadata sheet detected",
      };
    }
    return {
      ok: false,
      reason: `Delimited file "${fileName}" did not match a count matrix, sample-metadata sheet, or pathway table.`,
      remedy:
        `Add a recognizable header: a gene column (gene/gene_id/locus_tag) plus one column per sample for a count matrix, ` +
        `or a sample/condition column for metadata, or a pathway/reaction column for a pathway table. ${SUPPORTED_SUMMARY}`,
    };
  }

  return {
    ok: false,
    reason: `Unsupported file type ".${e || "(none)"}" for "${fileName}".`,
    remedy: `Convert the file to a supported format and re-upload. ${SUPPORTED_SUMMARY}`,
  };
};
