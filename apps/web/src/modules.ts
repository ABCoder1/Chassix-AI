/**
 * Supported module cards shown on the welcome screen (Screen 1, BF-01).
 * These describe capabilities the assembled workflow can include; they are
 * product descriptions, not results.
 */
export interface ModuleCard {
  id: string;
  title: string;
  description: string;
}

export const MODULES: readonly ModuleCard[] = [
  {
    id: "literature-host",
    title: "Literature & host discovery",
    description: "Citation-first retrieval and advisory host ranking with evidence coverage.",
  },
  {
    id: "genomics",
    title: "Genomics",
    description: "Genome quality, annotation and host comparison from public or uploaded data.",
  },
  {
    id: "transcriptomics",
    title: "Transcriptomics & perturbation",
    description: "Expression quality, contrast tables and uncertainty across conditions.",
  },
  {
    id: "pathways",
    title: "Pathway analysis",
    description: "Pathway mapping and enrichment with explicit method assumptions.",
  },
  {
    id: "harmonization",
    title: "Evidence harmonization",
    description:
      "Normalize identifiers and reconcile references without averaging incompatible units.",
  },
  {
    id: "critic",
    title: "Scientific critic",
    description: "Independent review of each recommendation with an explicit disposition.",
  },
  {
    id: "results-chat",
    title: "Results & AI chat",
    description: "Comparison dashboard and grounded chat where every claim links to a source.",
  },
];

/** A single illustrative example goal the composer can be prefilled with. */
export const EXAMPLE_GOAL =
  "I want a more thermotolerant microbial host for producing an industrial enzyme with reduced cooling requirements.";

/**
 * Illustrative host candidates offered as selectable chips on the canvas.
 * Identities and any figures are fixtures, not established scientific claims.
 */
export interface HostOption {
  id: string;
  name: string;
}

export const HOST_OPTIONS: readonly HostOption[] = [
  { id: "host-a", name: "Host candidate A" },
  { id: "host-b", name: "Host candidate B" },
  { id: "host-c", name: "Host candidate C" },
];

/** Illustrative dataset candidates offered as selectable chips on the canvas. */
export interface DatasetOption {
  id: string;
  name: string;
  modality: string;
}

export const DATASET_OPTIONS: readonly DatasetOption[] = [
  { id: "ds-genome-1", name: "Reference genome assembly", modality: "genomics" },
  { id: "ds-rna-1", name: "Heat-stress expression series", modality: "transcriptomics" },
  { id: "ds-pathway-1", name: "Curated pathway model", modality: "pathways" },
];
