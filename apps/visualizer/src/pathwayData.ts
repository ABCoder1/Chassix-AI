import type { ChassisId, Environment, Response } from "./model";

export type PathwayMode = "organelle" | "grn";
export type NetworkNode = {
  id: string;
  label: string;
  short: string;
  description: string;
  color: string;
  base: number;
  x: number;
  y: number;
  position: [number, number, number];
  role?: "regulator" | "target";
  fixtureValue?: string;
  motif?: string;
};
export type PathwayNetwork = {
  title: string;
  subtitle: string;
  nodes: NetworkNode[];
  edges: [string, string][];
  provenance: string;
};

const yeastMap: PathwayNetwork = {
  title: "Saccharomyces cerevisiae · conceptual cellular stress map",
  subtitle: "Illustrative response index · 0–100",
  provenance:
    "Conceptual systems and connections are design-reference fixtures. They are not measured molecular flux or validated pathways.",
  nodes: [
    {
      id: "stress",
      label: "Physicochemical Stress",
      short: "Stress input",
      description:
        "Environmental inputs summarize the selected temperature, salinity and pH scenario.",
      color: "#f0a22e",
      base: 19,
      x: 51,
      y: 12,
      position: [0, 1.34, 0.15],
    },
    {
      id: "aggregates",
      label: "Cytoplasmic Aggregates",
      short: "Aggregates",
      description:
        "Conceptual protein-aggregation response marker; not a measured aggregate count.",
      color: "#f06c32",
      base: 0,
      x: 46,
      y: 25,
      position: [-0.38, 0.89, 0.55],
    },
    {
      id: "envelope",
      label: "Plasma Membrane & Wall Mesh",
      short: "Cell envelope",
      description:
        "The yeast cell wall and plasma membrane are represented as a schematic envelope.",
      color: "#a16bff",
      base: 26,
      x: 23,
      y: 36,
      position: [-1.3, 0.18, 0.58],
    },
    {
      id: "folding",
      label: "ER / Periplasmic Misfolding",
      short: "Protein folding",
      description: "A conceptual endoplasmic-reticulum protein-folding response label.",
      color: "#ff842f",
      base: 30,
      x: 47,
      y: 46,
      position: [-0.3, 0.12, 0.9],
    },
    {
      id: "catalase",
      label: "Peroxisome / Catalase System",
      short: "Peroxisome",
      description: "A conceptual oxidative-defense system label; the index is illustrative.",
      color: "#10b8d0",
      base: 42,
      x: 82,
      y: 39,
      position: [1.25, 0.2, 0.52],
    },
    {
      id: "ros",
      label: "Reactive Oxygen Species (ROS)",
      short: "ROS response",
      description: "An illustrative oxidative-response node, not a measured ROS concentration.",
      color: "#fb4d52",
      base: 38,
      x: 63,
      y: 59,
      position: [0.52, -0.33, 0.88],
    },
    {
      id: "sensors",
      label: "Transmembrane Stress Sensors",
      short: "Stress sensors",
      description: "Conceptual membrane-associated sensing systems.",
      color: "#e8469d",
      base: 32,
      x: 27,
      y: 70,
      position: [-1.02, -0.62, 0.38],
    },
    {
      id: "genome",
      label: "Nucleus / Genome Center",
      short: "Genome",
      description: "The nuclear genome is shown as a conceptual response-system node.",
      color: "#f6c52e",
      base: 34,
      x: 40,
      y: 86,
      position: [-0.38, -1.04, 0.58],
    },
    {
      id: "homeostasis",
      label: "Homeostatic Chaperones",
      short: "Chaperones",
      description: "A conceptual protein-homeostasis response label.",
      color: "#06bd91",
      base: 32,
      x: 68,
      y: 86,
      position: [0.36, -1.03, 0.53],
    },
    {
      id: "mitochondria",
      label: "Mitochondrion / Respiratory Chain",
      short: "Mitochondrion",
      description: "A conceptual mitochondrial-system label; no respiratory flux is measured.",
      color: "#358eff",
      base: 73,
      x: 84,
      y: 75,
      position: [1.18, -0.68, 0.24],
    },
  ],
  edges: [
    ["stress", "folding"],
    ["stress", "envelope"],
    ["folding", "aggregates"],
    ["folding", "homeostasis"],
    ["ros", "catalase"],
    ["sensors", "genome"],
    ["genome", "homeostasis"],
    ["ros", "mitochondria"],
    ["envelope", "sensors"],
    ["ros", "genome"],
  ],
};

const archaealMap: PathwayNetwork = {
  title: "Pyrococcus furiosus · conceptual cellular stress map",
  subtitle: "Illustrative response index · 0–100",
  provenance:
    "Conceptual systems and connections are design-reference fixtures adapted for an archaeal chassis; they are not measured flux or validated pathways.",
  nodes: [
    {
      id: "stress",
      label: "Physicochemical Stress",
      short: "Stress input",
      description:
        "Environmental inputs summarize the selected temperature, salinity and pH scenario.",
      color: "#f0a22e",
      base: 19,
      x: 51,
      y: 12,
      position: [0, 1.2, 0.15],
    },
    {
      id: "aggregates",
      label: "Protein Aggregation",
      short: "Aggregation",
      description:
        "Conceptual protein-aggregation response marker; not a measured aggregate count.",
      color: "#f06c32",
      base: 0,
      x: 46,
      y: 25,
      position: [-0.38, 0.8, 0.55],
    },
    {
      id: "envelope",
      label: "S-layer & Membrane Mesh",
      short: "S-layer / membrane",
      description: "Schematic archaeal S-layer and membrane boundary.",
      color: "#a16bff",
      base: 26,
      x: 23,
      y: 36,
      position: [-1.25, 0.12, 0.5],
    },
    {
      id: "folding",
      label: "Thermosome / Protein Folding",
      short: "Thermosome",
      description: "Conceptual protein-folding system for the archaeal chassis.",
      color: "#ff842f",
      base: 30,
      x: 47,
      y: 46,
      position: [-0.28, 0.1, 0.86],
    },
    {
      id: "catalase",
      label: "Redox Defense Systems",
      short: "Redox defense",
      description:
        "Generic redox-response label; no specific organelle or concentration is implied.",
      color: "#10b8d0",
      base: 42,
      x: 82,
      y: 39,
      position: [1.2, 0.2, 0.52],
    },
    {
      id: "ros",
      label: "Reactive Oxygen Response",
      short: "Redox response",
      description:
        "Illustrative redox-response node, not a measured reactive-oxygen concentration.",
      color: "#fb4d52",
      base: 38,
      x: 63,
      y: 59,
      position: [0.48, -0.32, 0.86],
    },
    {
      id: "sensors",
      label: "Membrane Stress Response",
      short: "Membrane response",
      description: "Conceptual membrane-associated response systems.",
      color: "#e8469d",
      base: 32,
      x: 27,
      y: 70,
      position: [-1, -0.6, 0.34],
    },
    {
      id: "genome",
      label: "Genome Region",
      short: "Genome",
      description: "A schematic archaeal genome region without a membrane-bound nucleus.",
      color: "#f6c52e",
      base: 34,
      x: 40,
      y: 86,
      position: [-0.38, -1, 0.56],
    },
    {
      id: "homeostasis",
      label: "Protein Homeostasis",
      short: "Protein homeostasis",
      description: "Conceptual protein-maintenance response label.",
      color: "#06bd91",
      base: 32,
      x: 68,
      y: 86,
      position: [0.36, -0.98, 0.5],
    },
    {
      id: "mitochondria",
      label: "Energy-Conserving Membrane",
      short: "Energy system",
      description:
        "Archaeal energy-conserving systems are membrane-associated; this is not a mitochondrion.",
      color: "#358eff",
      base: 73,
      x: 84,
      y: 75,
      position: [1.12, -0.65, 0.24],
    },
  ],
  edges: yeastMap.edges,
};

export const ORGANELLE_NETWORKS: Partial<Record<ChassisId, PathwayNetwork>> = {
  yeast: yeastMap,
  archaeon: archaealMap,
};

const yeastGrn: PathwayNetwork = {
  title: "Saccharomyces cerevisiae (yeast) · gene regulatory network",
  subtitle: "Design-reference expression examples",
  provenance:
    "Names, values and dashed links are copied from the supplied recording as demo fixtures. No sample, assay or citation was attached; links are illustrative, not validated.",
  nodes: [
    {
      id: "msn",
      label: "Msn2/Msn4 TF",
      short: "General Stress Factor",
      description: "Upstream transcription-factor example from the design reference.",
      color: "#f0ad28",
      base: 45,
      x: 26,
      y: 27,
      position: [-1.02, 0.56, 0.55],
      role: "regulator",
      fixtureValue: "+1.52 log₂FC",
      motif: "5′–CCCCT–3′ (STRE)",
    },
    {
      id: "hsf",
      label: "HSF1 Trimer",
      short: "Heat Shock Factor",
      description: "Upstream transcription-factor example from the design reference.",
      color: "#f0ad28",
      base: 58,
      x: 50,
      y: 21,
      position: [0, 0.8, 0.55],
      role: "regulator",
      fixtureValue: "+2.07 log₂FC",
      motif: "Heat Shock Element (HSE)",
    },
    {
      id: "skn",
      label: "Skn7 Factor",
      short: "Oxidative Regulator",
      description: "Upstream factor example from the supplied design reference.",
      color: "#f0ad28",
      base: 42,
      x: 75,
      y: 27,
      position: [1.02, 0.56, 0.55],
      role: "regulator",
      fixtureValue: "+1.33 log₂FC",
      motif: "Receiver domain signal",
    },
    {
      id: "hsp104",
      label: "HSP104",
      short: "Protein Disaggregase",
      description: "Target-gene example shown in the supplied design reference.",
      color: "#32c68e",
      base: 62,
      x: 14,
      y: 68,
      position: [-1.16, -0.58, 0.55],
      role: "target",
      fixtureValue: "+1.42 FC",
    },
    {
      id: "tps1",
      label: "TPS1",
      short: "Trehalose Synthase",
      description: "Target-gene example shown in the supplied design reference.",
      color: "#32c68e",
      base: 57,
      x: 38,
      y: 72,
      position: [-0.42, -0.86, 0.65],
      role: "target",
      fixtureValue: "+1.32 FC",
    },
    {
      id: "ssa1",
      label: "SSA1 (HSP70)",
      short: "Cytoplasmic Chaperone",
      description: "Target-gene example shown in the supplied design reference.",
      color: "#32c68e",
      base: 65,
      x: 62,
      y: 72,
      position: [0.42, -0.86, 0.65],
      role: "target",
      fixtureValue: "+1.62 FC",
    },
    {
      id: "ctt1",
      label: "CTT1",
      short: "Cytosolic Catalase T",
      description: "Target-gene example shown in the supplied design reference.",
      color: "#32c68e",
      base: 48,
      x: 86,
      y: 68,
      position: [1.16, -0.58, 0.55],
      role: "target",
      fixtureValue: "+1.22 FC",
    },
  ],
  edges: [
    ["msn", "hsp104"],
    ["msn", "tps1"],
    ["msn", "ssa1"],
    ["hsf", "hsp104"],
    ["hsf", "ssa1"],
    ["skn", "ctt1"],
    ["msn", "ctt1"],
  ],
};

const archaealGrn: PathwayNetwork = {
  title: "Pyrococcus furiosus (archaea) · gene regulatory network",
  subtitle: "Design-reference expression examples",
  provenance:
    "Names, values and dashed links are copied from the supplied recording as demo fixtures. No sample, assay or citation was attached; links are illustrative, not validated.",
  nodes: [
    {
      id: "tbp",
      label: "TBP / TFB Complex",
      short: "Archaeal Transcription Machinery",
      description: "Upstream transcription-machinery example from the supplied recording.",
      color: "#f0ad28",
      base: 55,
      x: 32,
      y: 25,
      position: [-0.72, 0.56, 0.6],
      role: "regulator",
      fixtureValue: "+2.74 log₂FC",
      motif: "TATA-box / BRE motif",
    },
    {
      id: "hmf",
      label: "HMf Histone TF",
      short: "Chromatin Architect",
      description: "Chromatin-associated factor example from the supplied recording.",
      color: "#f0ad28",
      base: 38,
      x: 69,
      y: 25,
      position: [0.72, 0.56, 0.6],
      role: "regulator",
      fixtureValue: "+1.24 log₂FC",
      motif: "DNA supercoiling anchor",
    },
    {
      id: "reverse-gyrase",
      label: "Reverse Gyrase",
      short: "Positive Supercoiling Enzyme",
      description: "Target example from the supplied recording.",
      color: "#32c68e",
      base: 72,
      x: 25,
      y: 68,
      position: [-1, -0.62, 0.62],
      role: "target",
      fixtureValue: "+3.95 FC",
    },
    {
      id: "thermosome",
      label: "Thermosome",
      short: "Group II Archaeal Chaperonin",
      description: "Target example from the supplied recording.",
      color: "#32c68e",
      base: 77,
      x: 50,
      y: 72,
      position: [0, -0.86, 0.7],
      role: "target",
      fixtureValue: "+4.25 FC",
    },
    {
      id: "lipid-synthase",
      label: "Tetraether Lipid Synthase",
      short: "Ether-Monolayer Packing",
      description: "Target example from the supplied recording.",
      color: "#32c68e",
      base: 69,
      x: 76,
      y: 68,
      position: [1, -0.62, 0.62],
      role: "target",
      fixtureValue: "+3.75 FC",
    },
  ],
  edges: [
    ["tbp", "reverse-gyrase"],
    ["tbp", "thermosome"],
    ["tbp", "lipid-synthase"],
    ["hmf", "reverse-gyrase"],
    ["hmf", "thermosome"],
    ["hmf", "lipid-synthase"],
  ],
};

export const GRN_NETWORKS: Partial<Record<ChassisId, PathwayNetwork>> = {
  yeast: yeastGrn,
  archaeon: archaealGrn,
};

export function networkFor(chassis: ChassisId, mode: PathwayMode): PathwayNetwork | undefined {
  return mode === "organelle" ? ORGANELLE_NETWORKS[chassis] : GRN_NETWORKS[chassis];
}

export function illustrativeIndex(base: number, response: Response): number {
  return Math.round(base + (100 - base) * response.stress);
}

export function getExpressionRows(chassis: ChassisId) {
  return (GRN_NETWORKS[chassis]?.nodes ?? []).filter((node) => node.role === "regulator");
}

export function expressionScenarioValue(node: NetworkNode, _environment: Environment): string {
  return node.fixtureValue ?? "";
}
