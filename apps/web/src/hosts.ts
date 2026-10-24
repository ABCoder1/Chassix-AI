/**
 * ILLUSTRATIVE host-discovery fixtures (Step 2.3 / BF-02, PRD §B).
 *
 * These are static fixtures, NOT the output of live literature retrieval or a
 * ranking model. Per the cross-cutting rules, every organism identity, score,
 * count, passage and date here is illustrative and labeled as such in the UI.
 * The suitability score is advisory and is NOT a probability of experimental
 * success. Host ids align with `HOST_OPTIONS` in modules.ts so selections made
 * here share the one persisted selection store used by the canvas.
 */

/** How well a host's recommendation is supported by retrieved evidence. */
export type EvidenceQuality = "well-supported" | "sparse" | "unsupported";

export interface HostCitation {
  id: string;
  /** Bibliographic metadata. */
  title: string;
  authors: string;
  venue: string;
  year: number;
  /** When this passage was retrieved (illustrative). */
  retrievalDate: string;
  /** The verbatim source passage the claim is grounded in. */
  passage: string;
  /** Which host claim this citation supports (claim linkage). */
  claimLinkage: string;
  /** Whether the full text was accessible (inaccessible papers are not shown as "read full text"). */
  accessible: boolean;
}

export interface HostCandidate {
  id: string;
  organism: string;
  strain: string;
  /** Advisory suitability estimate in [0,1]. NOT a probability of success. */
  score: number;
  /** Human-readable label for the score band (shown alongside the number). */
  suitabilityLabel: string;
  /** Short description of evidence coverage. */
  evidenceCoverage: string;
  /** Count of distinct supporting sources (deduplicated). */
  supportingSources: number;
  rationale: string;
  tradeoffs: string[];
  /** Explicit conflicting findings across the literature, if any. */
  conflictingFindings: string[];
  /** Freshness of the most recent supporting source. */
  freshness: string;
  evidenceQuality: EvidenceQuality;
  citations: HostCitation[];
}

export const HOST_CANDIDATES: readonly HostCandidate[] = [
  {
    id: "host-a",
    organism: "Bacillus licheniformis",
    strain: "strain BL-01 (illustrative)",
    score: 0.82,
    suitabilityLabel: "Strong fit",
    evidenceCoverage: "High — 12 supporting sources across 3 claims",
    supportingSources: 12,
    rationale:
      "Thermostable secretion machinery and an established industrial enzyme track record align with the stated goal.",
    tradeoffs: [
      "Genetic toolkit less mature than model hosts",
      "Sporulation may complicate continuous fermentation",
    ],
    conflictingFindings: [
      "One source reports reduced secretion above 55°C, conflicting with two sources claiming stable secretion to 60°C.",
    ],
    freshness: "Most recent supporting source: 2024",
    evidenceQuality: "well-supported",
    citations: [
      {
        id: "cite-a1",
        title: "Thermostable enzyme secretion in Bacillus licheniformis",
        authors: "Illustrative A. et al.",
        venue: "Journal of Illustrative Microbiology",
        year: 2024,
        retrievalDate: "2026-10-20",
        passage:
          "Secretion of the model enzyme remained stable at cultivation temperatures up to 60°C in the tested strains.",
        claimLinkage: "Supports: thermostable secretion machinery",
        accessible: true,
      },
      {
        id: "cite-a2",
        title: "Industrial deployment of Bacillus hosts",
        authors: "Illustrative B. et al.",
        venue: "Illustrative Bioprocess Reviews",
        year: 2022,
        retrievalDate: "2026-10-20",
        passage:
          "Reduced secretion yields were observed above 55°C, suggesting an upper operating bound for some constructs.",
        claimLinkage: "Conflicts with: stable secretion to 60°C",
        accessible: true,
      },
    ],
  },
  {
    id: "host-b",
    organism: "Kluyveromyces marxianus",
    strain: "strain KM-07 (illustrative)",
    score: 0.68,
    suitabilityLabel: "Moderate fit",
    evidenceCoverage: "Moderate — 5 supporting sources across 2 claims",
    supportingSources: 5,
    rationale:
      "Reported growth at elevated temperatures and eukaryotic post-translational processing may suit secreted enzymes.",
    tradeoffs: [
      "Fewer characterized expression cassettes than Saccharomyces",
      "Strain-to-strain thermotolerance varies widely",
    ],
    conflictingFindings: [],
    freshness: "Most recent supporting source: 2023",
    evidenceQuality: "well-supported",
    citations: [
      {
        id: "cite-b1",
        title: "Thermotolerant yeast chassis for secreted products",
        authors: "Illustrative C. et al.",
        venue: "Illustrative Yeast Letters",
        year: 2023,
        retrievalDate: "2026-10-19",
        passage:
          "Several isolates maintained viability and product formation at 45°C under the tested conditions.",
        claimLinkage: "Supports: growth at elevated temperatures",
        accessible: true,
      },
    ],
  },
  {
    id: "host-c",
    organism: "Thermus thermophilus",
    strain: "strain TT-03 (illustrative)",
    score: 0.41,
    suitabilityLabel: "Weak fit",
    evidenceCoverage: "Sparse — 1 supporting source",
    supportingSources: 1,
    rationale:
      "Extreme thermotolerance is attractive, but evidence for industrial enzyme secretion at scale is sparse.",
    tradeoffs: [
      "Limited heterologous expression tooling",
      "Scant evidence for secreted-enzyme titers",
    ],
    conflictingFindings: [],
    freshness: "Most recent supporting source: 2019",
    evidenceQuality: "sparse",
    citations: [
      {
        id: "cite-c1",
        title: "Expression systems in extreme thermophiles",
        authors: "Illustrative D. et al.",
        venue: "Illustrative Extremophile Reports",
        year: 2019,
        retrievalDate: "2026-10-18",
        passage:
          "Abstract only — full text was not retrievable; secreted-enzyme yields were not reported in the accessible metadata.",
        claimLinkage: "Weakly supports: extreme thermotolerance",
        accessible: false,
      },
    ],
  },
];

export const ILLUSTRATIVE_HOSTS_LABEL =
  "Illustrative shortlist — scores, counts and passages are fixtures, not live retrieval results.";
