import { CHASSIS, calculateResponse, sanitizeEnvironment, type ChassisId, type Environment, type Response } from './model';
import { networkFor } from './pathwayData';

export type SimulationInput = { schemaVersion: 1; chassisId: ChassisId; environment: Environment };
export type BondState = 'stable' | 'forming' | 'rearranging' | 'weakening' | 'broken';
export type BondSignal = {
  id: string;
  label: string;
  state: BondState;
  intensity: number;
  start: [number, number, number];
  end: [number, number, number];
};
export type SimulationResult = {
  schemaVersion: 1;
  provider: string;
  illustrative: boolean;
  chassisId: ChassisId;
  environment: Environment;
  response: Response;
  genes: { id: string; label: string; index: number; delta: number; fixtureValue?: string }[];
  pathways: {
    id: string;
    label: string;
    index: number;
    calculation: { baseline: number; temperature: number; salinity: number; ph: number; combinedStress: number; raw: number };
  }[];
  wholeCellFlux: { index: number; atp: number; carbon: number; redox: number };
  metabolites: { id: string; label: string; index: number; delta: number }[];
  bonds: BondSignal[];
  yieldComparisons: { chassisId: ChassisId; label: string; index: number }[];
};

/**
 * Replace this adapter with the Chassix-AI service when its API is ready.
 * Keep the returned schema stable so the visualizer stays independent of the
 * backend transport and model implementation.
 */
export type SimulationAdapter = {
  simulate: (input: SimulationInput, signal?: AbortSignal) => Promise<SimulationResult>;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const rounded = (value: number) => Math.round(clamp(value));
type Axis = 'thermal' | 'osmotic' | 'acidity' | 'stress';

const pathwayWeights: Record<string, Partial<Record<Axis, number>>> = {
  stress: { thermal: 0.35, osmotic: 0.25, acidity: 0.2, stress: 0.45 },
  aggregates: { thermal: 0.55, acidity: 0.08, stress: 0.2 },
  envelope: { osmotic: 0.45, acidity: 0.35, stress: 0.15 },
  folding: { thermal: 0.5, acidity: 0.14, stress: 0.2 },
  catalase: { thermal: 0.12, acidity: 0.38, stress: 0.3 },
  ros: { thermal: 0.3, acidity: 0.35, stress: 0.18 },
  sensors: { osmotic: 0.4, thermal: 0.2, stress: 0.18 },
  genome: { thermal: 0.2, osmotic: 0.15, acidity: 0.15, stress: 0.12 },
  homeostasis: { thermal: 0.38, acidity: 0.2, stress: 0.25 },
  mitochondria: { thermal: -0.35, osmotic: -0.15, acidity: -0.2, stress: -0.3 },
};

const geneWeights: Record<ChassisId, Record<string, Partial<Record<Axis, number>>>> = {
  yeast: {
    msn: { thermal: 20, osmotic: 18, acidity: 16, stress: 8 },
    hsf: { thermal: 34, stress: 4 },
    skn: { thermal: 7, osmotic: 5, acidity: 27 },
    hsp104: { thermal: 24, acidity: 4 },
    tps1: { thermal: 7, osmotic: 23, acidity: 2, stress: -8 },
    ssa1: { thermal: 22, acidity: 5 },
    ctt1: { thermal: 8, acidity: 24 },
  },
  bacterium: {},
  archaeon: {
    tbp: { thermal: 20, osmotic: 8, acidity: 4 },
    hmf: { thermal: 9, osmotic: 13, acidity: 4 },
    'reverse-gyrase': { thermal: 24, stress: 2 },
    thermosome: { thermal: 29, acidity: 2 },
    'lipid-synthase': { thermal: 4, osmotic: 20, acidity: 4 },
  },
};

type BondRecipe = {
  id: string; label: string; axis: Axis; adaptive?: boolean; sensitivity: number;
  start: [number, number, number]; end: [number, number, number];
};
const bondRecipes: BondRecipe[] = [
  { id: 'membrane-packing', label: 'Membrane packing contact', axis: 'osmotic', sensitivity: 1.15, start: [-0.78, 0.35, 0.95], end: [-0.12, 0.62, 1.05] },
  { id: 'folding-contact', label: 'Protein-folding contact', axis: 'thermal', sensitivity: 1.1, start: [-0.18, 0.25, 1.08], end: [0.42, 0.54, 1.02] },
  { id: 'redox-contact', label: 'Redox-system contact', axis: 'acidity', sensitivity: 1.05, start: [0.45, 0.25, 1.06], end: [0.82, -0.18, 0.98] },
  { id: 'energy-contact', label: 'Energy-system contact', axis: 'stress', sensitivity: 0.95, start: [-0.68, -0.3, 1.02], end: [-0.08, -0.62, 1.08] },
  { id: 'chaperone-recruitment', label: 'Chaperone recruitment', axis: 'thermal', adaptive: true, sensitivity: 1.05, start: [-0.12, -0.36, 1.12], end: [0.38, -0.08, 1.08] },
  { id: 'osmoadaptation-contact', label: 'Osmoadaptation contact', axis: 'osmotic', adaptive: true, sensitivity: 0.65, start: [0.1, -0.72, 1.02], end: [0.68, -0.55, 0.98] },
  { id: 'repair-recruitment', label: 'Repair-system recruitment', axis: 'stress', adaptive: true, sensitivity: 1.15, start: [-0.7, 0.02, 1.08], end: [-0.24, -0.08, 1.16] },
];

function bondState(signal: number, adaptive: boolean): BondState {
  if (adaptive) {
    if (signal < 0.12) return 'stable';
    return signal > 0.72 ? 'rearranging' : 'forming';
  }
  if (signal < 0.18) return 'stable';
  if (signal < 0.38) return 'weakening';
  if (signal < 0.68) return 'rearranging';
  return 'broken';
}

const yieldScales: Record<ChassisId, Environment> = {
  yeast: { temperature: 18, salinity: 1.4, ph: 2.5 },
  bacterium: { temperature: 18, salinity: 1.5, ph: 2.6 },
  archaeon: { temperature: 15, salinity: 2.1, ph: 2.8 },
};

function yieldIndex(id: ChassisId, environment: Environment) {
  const reference = CHASSIS[id].reference;
  const scale = yieldScales[id];
  const distance = ((environment.temperature - reference.temperature) / scale.temperature) ** 2
    + ((environment.salinity - reference.salinity) / scale.salinity) ** 2
    + ((environment.ph - reference.ph) / scale.ph) ** 2;
  return rounded(96 * Math.exp(-0.5 * distance));
}

/** A deterministic, explicitly illustrative response for connecting the UI before the service exists. */
export function simulateDemo(input: SimulationInput): SimulationResult {
  const environment = sanitizeEnvironment(input.environment, CHASSIS[input.chassisId].reference);
  const response = calculateResponse(input.chassisId, environment);
  const axes = { thermal: response.thermal, osmotic: response.osmotic, acidity: response.acidity, stress: response.stress };
  const network = networkFor(input.chassisId, 'organelle');
  const genesNetwork = networkFor(input.chassisId, 'grn');
  const pathways = (network?.nodes ?? []).map((node) => {
    const weights = pathwayWeights[node.id] ?? { stress: 0.15 };
    const calculation = {
      baseline: node.base,
      temperature: response.thermal * (weights.thermal ?? 0) * 100,
      salinity: response.osmotic * (weights.osmotic ?? 0) * 100,
      ph: response.acidity * (weights.acidity ?? 0) * 100,
      combinedStress: response.stress * (weights.stress ?? 0) * 100,
      raw: 0,
    };
    calculation.raw = calculation.baseline + calculation.temperature + calculation.salinity + calculation.ph + calculation.combinedStress;
    return { id: node.id, label: node.short, index: rounded(calculation.raw), calculation };
  });
  const genes = (genesNetwork?.nodes ?? []).map((node) => {
    const weights = geneWeights[input.chassisId][node.id] ?? {};
    const delta = Math.round(Object.entries(weights).reduce((total, [axis, weight]) => total + axes[axis as Axis] * (weight ?? 0), 0));
    return { id: node.id, label: node.label, index: rounded(node.base + delta), delta, fixtureValue: node.fixtureValue };
  });
  const metabolites = [
    { id: 'energy', label: 'ATP availability proxy', index: rounded(84 - response.thermal * 24 - response.osmotic * 9 - response.acidity * 13) },
    { id: 'carbon', label: 'Carbon reserve proxy', index: rounded(68 - response.thermal * 13 + response.osmotic * 8 - response.acidity * 5) },
    { id: 'redox', label: 'Redox balance proxy', index: rounded(76 - response.thermal * 14 - response.osmotic * 8 - response.acidity * 22) },
    { id: 'osmoadaptation', label: 'Osmoadaptation proxy', index: rounded(30 + response.osmotic * 61 + response.thermal * 4) },
  ].map((item) => ({ ...item, delta: item.index - ({ energy: 84, carbon: 68, redox: 76, osmoadaptation: 30 }[item.id] ?? item.index) }));
  const atp = metabolites.find((item) => item.id === 'energy')!.index;
  const carbon = metabolites.find((item) => item.id === 'carbon')!.index;
  const redox = metabolites.find((item) => item.id === 'redox')!.index;
  const wholeCellFlux = { index: rounded(atp * carbon * redox / 10_000), atp, carbon, redox };
  const bonds = bondRecipes.map((recipe) => {
    const intensity = clamp(axes[recipe.axis] * recipe.sensitivity, 0, 1);
    return { id: recipe.id, label: recipe.label, state: bondState(intensity, Boolean(recipe.adaptive)), intensity, start: recipe.start, end: recipe.end };
  });
  const yieldComparisons = (Object.keys(CHASSIS) as ChassisId[]).map((chassisId) => ({ chassisId, label: CHASSIS[chassisId].name, index: yieldIndex(chassisId, environment) }));
  return { schemaVersion: 1, provider: 'demo-heuristic-v1', illustrative: true, chassisId: input.chassisId, environment, response, genes, pathways, wholeCellFlux, metabolites, bonds, yieldComparisons };
}

export const demoSimulationAdapter: SimulationAdapter = {
  async simulate(input, signal) {
    if (signal?.aborted) throw new DOMException('Simulation aborted', 'AbortError');
    return simulateDemo(input);
  },
};
