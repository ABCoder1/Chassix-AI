import { AccessStatus, ClaimType } from "./types.js";

/**
 * ILLUSTRATIVE fixture corpus for host literature retrieval (Step 2.1).
 *
 * This is a deterministic, hand-authored corpus used by `FixtureRetrievalProvider` for tests and
 * keyless dev. It is NOT real literature: the passages, claims and metadata are illustrative until
 * a live provider and scientific sign-off land (ADR-D9, ADR-D10; cross-cutting rule: fixtures are
 * labeled illustrative). The corpus deliberately contains:
 *   - a DUPLICATE source passage (same text, two entries) to exercise dedupe;
 *   - a PAYWALLED and an UNAVAILABLE entry to exercise not-read handling;
 *   - a CONFLICTING finding for one host to exercise ranking's conflict surfacing.
 */

/** Raw corpus entry — a source passage plus its bibliographic + access metadata. */
export interface CorpusEntry {
  readonly id: string;
  readonly host: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly venue: string;
  readonly doi?: string;
  readonly url?: string;
  readonly passage: string;
  readonly locator?: string;
  readonly claim: string;
  readonly claimType: ClaimType;
  readonly accessStatus: AccessStatus;
  /** Lower-cased keywords used for deterministic matching against a query. */
  readonly keywords: readonly string[];
}

/** A passage reused verbatim to prove duplicates are not counted as independent evidence. */
const DUPLICATE_PASSAGE =
  "Engineered Bacillus subtilis strains retained >80% secreted amylase activity after sustained culture at 52 C.";

export const FIXTURE_CORPUS: readonly CorpusEntry[] = [
  {
    id: "lit-0001",
    host: "Bacillus subtilis",
    title: "Thermotolerance of industrial Bacillus subtilis enzyme-secretion strains",
    authors: ["Okafor, N.", "Lindqvist, S."],
    year: 2023,
    venue: "Journal of Industrial Microbiology (illustrative)",
    doi: "10.0000/illus.bsub.2023",
    url: "https://example.org/illustrative/bsub-2023",
    passage: DUPLICATE_PASSAGE,
    locator: "Results, p. 4",
    claim: "Bacillus subtilis maintains secreted enzyme activity at elevated temperature.",
    claimType: ClaimType.Observed,
    accessStatus: AccessStatus.OpenAccess,
    keywords: [
      "thermotolerant",
      "thermotolerance",
      "enzyme",
      "amylase",
      "secretion",
      "temperature",
      "bacillus",
      "host",
    ],
  },
  {
    // Duplicate of lit-0001's passage reproduced in a review — must be deduped, not double-counted.
    id: "lit-0002",
    host: "Bacillus subtilis",
    title: "A review of thermostable secretion hosts (reproduces prior figure)",
    authors: ["Mehta, R."],
    year: 2024,
    venue: "Reviews in Bioprocess Engineering (illustrative)",
    doi: "10.0000/illus.review.2024",
    passage: DUPLICATE_PASSAGE,
    locator: "Table 1 (reproduced)",
    claim: "Bacillus subtilis maintains secreted enzyme activity at elevated temperature.",
    claimType: ClaimType.Observed,
    accessStatus: AccessStatus.OpenAccess,
    keywords: [
      "thermotolerant",
      "thermotolerance",
      "enzyme",
      "secretion",
      "temperature",
      "bacillus",
      "host",
      "review",
    ],
  },
  {
    id: "lit-0003",
    host: "Bacillus subtilis",
    title: "Growth-rate penalty of B. subtilis above 50 C in fed-batch culture",
    authors: ["Alvarez, P.", "Tan, W."],
    year: 2022,
    venue: "Bioprocess Letters (illustrative)",
    doi: "10.0000/illus.bsub.penalty.2022",
    passage:
      "Specific growth rate declined by ~40% above 50 C, suggesting a productivity tradeoff despite retained enzyme stability.",
    locator: "Fig. 3",
    claim: "Bacillus subtilis incurs a growth-rate penalty at high temperature (tradeoff).",
    claimType: ClaimType.Observed,
    accessStatus: AccessStatus.OpenAccess,
    keywords: [
      "thermotolerance",
      "temperature",
      "growth",
      "tradeoff",
      "bacillus",
      "host",
      "productivity",
    ],
  },
  {
    id: "lit-0004",
    host: "Thermus thermophilus",
    title: "Native thermophily of Thermus thermophilus for high-temperature bioprocessing",
    authors: ["Sato, K.", "Boulanger, M."],
    year: 2021,
    venue: "Extremophiles Today (illustrative)",
    doi: "10.0000/illus.tthermo.2021",
    url: "https://example.org/illustrative/tthermo-2021",
    passage:
      "Thermus thermophilus grows optimally at 65-72 C, offering an intrinsically thermotolerant chassis for heat-intensive processes.",
    locator: "Abstract",
    claim: "Thermus thermophilus is intrinsically thermotolerant.",
    claimType: ClaimType.Observed,
    accessStatus: AccessStatus.OpenAccess,
    keywords: [
      "thermotolerant",
      "thermotolerance",
      "temperature",
      "thermus",
      "thermophile",
      "host",
      "chassis",
    ],
  },
  {
    id: "lit-0005",
    host: "Thermus thermophilus",
    title: "Heterologous enzyme secretion remains limited in Thermus thermophilus",
    authors: ["Dubois, A."],
    year: 2020,
    venue: "Applied Chassis Engineering (illustrative)",
    doi: "10.0000/illus.tthermo.secretion.2020",
    passage:
      "Despite its thermophily, heterologous enzyme secretion titers in T. thermophilus remained low relative to mesophilic hosts.",
    locator: "Discussion",
    claim:
      "Thermus thermophilus shows limited heterologous enzyme secretion (conflicts with suitability as a production host).",
    claimType: ClaimType.Observed,
    accessStatus: AccessStatus.OpenAccess,
    keywords: ["enzyme", "secretion", "temperature", "thermus", "host", "production", "titer"],
  },
  {
    id: "lit-0006",
    host: "Saccharomyces cerevisiae",
    title: "Inferred thermotolerance ceiling of industrial S. cerevisiae",
    authors: ["Nguyen, H.", "Park, J."],
    year: 2019,
    venue: "Yeast Bioprocessing (illustrative)",
    doi: "10.0000/illus.scer.2019",
    passage:
      "Modeling suggests limited headroom above 40 C for industrial S. cerevisiae without adaptive engineering.",
    locator: "Model section",
    claim: "S. cerevisiae has an inferred thermotolerance ceiling near 40 C.",
    claimType: ClaimType.Inferred,
    accessStatus: AccessStatus.OpenAccess,
    keywords: ["thermotolerance", "temperature", "yeast", "saccharomyces", "host", "enzyme"],
  },
  {
    id: "lit-0007",
    host: "Pichia pastoris",
    title: "Proprietary high-temperature P. pastoris secretion dataset",
    authors: ["Industrial Consortium (illustrative)"],
    year: 2024,
    venue: "Paywalled Proceedings (illustrative)",
    doi: "10.0000/illus.ppas.paywall.2024",
    url: "https://paywall.example.org/illustrative/ppas-2024",
    passage:
      "[Full text behind paywall — abstract indicates improved secretion at elevated temperature, full data not accessible.]",
    locator: "Abstract (paywalled)",
    claim:
      "Pichia pastoris may secrete enzymes at elevated temperature (full text not accessible).",
    claimType: ClaimType.Hypothesis,
    accessStatus: AccessStatus.Paywalled,
    keywords: ["thermotolerance", "enzyme", "secretion", "temperature", "pichia", "host"],
  },
  {
    id: "lit-0008",
    host: "Pichia pastoris",
    title: "Withdrawn preprint on P. pastoris heat shock response",
    authors: ["Unknown"],
    year: null,
    venue: "Preprint server (illustrative)",
    passage: "[Record unavailable — link resolves to a withdrawn/removed preprint.]",
    locator: "N/A",
    claim: "Unavailable source (cannot be used as evidence).",
    claimType: ClaimType.Hypothesis,
    accessStatus: AccessStatus.Unavailable,
    keywords: ["thermotolerance", "temperature", "pichia", "host", "heat"],
  },
];
