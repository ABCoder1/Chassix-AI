export type ChassisId = 'yeast' | 'bacterium' | 'archaeon';
export type StructureId = 'envelope' | 'genome' | 'energy' | 'repair' | 'ribosomes';
export type Environment = { temperature: number; salinity: number; ph: number };
export type ViewSettings = { mesh: boolean; internals: boolean; cutaway: boolean; pathways: boolean; rotating: boolean; playing: boolean };
export type Structure = { id: StructureId; label: string; color: string; description: string };
export type Chassis = { id: ChassisId; name: string; scientific: string; category: string; shape: string; color: string; reference: Environment; structures: Structure[] };

// Scenario anchors are visualization parameters, not experimentally established optima.
export const CHASSIS: Record<ChassisId, Chassis> = {
  yeast: {
    id: 'yeast', name: 'Budding yeast', scientific: 'Saccharomyces cerevisiae', category: 'Eukaryote', shape: 'Budding ellipsoid', color: '#ac8cff',
    reference: { temperature: 30, salinity: 0.2, ph: 5.5 },
    structures: [
      { id: 'envelope', label: 'Cell envelope', color: '#ac8cff', description: 'A stylized cell wall and membrane surrounding the yeast. Surface motion illustrates the selected stress scenario.' },
      { id: 'genome', label: 'Nucleus', color: '#ffc66c', description: 'A membrane-bound compartment containing the nuclear genome. The model shows its location schematically.' },
      { id: 'energy', label: 'Mitochondria', color: '#62b4ff', description: 'Stylized mitochondria illustrate cellular energy systems. Their animated signal is not a measured ATP flux.' },
      { id: 'repair', label: 'Proteostasis network', color: '#63dfb6', description: 'A conceptual network for protein folding and repair, shown as linked green structures rather than a separate organelle.' },
      { id: 'ribosomes', label: 'Ribosomes', color: '#e7a9db', description: 'Small particles represent protein synthesis machinery. Particle count and motion are illustrative.' },
    ],
  },
  bacterium: {
    id: 'bacterium', name: 'Bacterial chassis', scientific: 'Escherichia coli', category: 'Bacterium', shape: 'Rod-shaped capsule', color: '#65dcd1',
    reference: { temperature: 37, salinity: 0.15, ph: 7 },
    structures: [
      { id: 'envelope', label: 'Cell envelope', color: '#65dcd1', description: 'Two schematic boundaries represent the bacterial envelope. They do not resolve its molecular layers.' },
      { id: 'genome', label: 'Nucleoid', color: '#ffc66c', description: 'A schematic DNA coil in the cytoplasm. Bacteria have a nucleoid rather than a membrane-bound nucleus.' },
      { id: 'energy', label: 'Membrane energy systems', color: '#62b4ff', description: 'Blue markers represent membrane-associated energy systems. They are not mitochondria.' },
      { id: 'repair', label: 'Protein folding network', color: '#63dfb6', description: 'A conceptual protein folding and stress response network. No gene-specific activity is inferred.' },
      { id: 'ribosomes', label: 'Ribosomes', color: '#e7a9db', description: 'Schematic protein synthesis particles in the cytoplasm; their placement is illustrative.' },
    ],
  },
  archaeon: {
    id: 'archaeon', name: 'Archaeal chassis', scientific: 'Pyrococcus furiosus', category: 'Archaeon', shape: 'Spherical envelope', color: '#f4bc72',
    reference: { temperature: 95, salinity: 0.5, ph: 7 },
    structures: [
      { id: 'envelope', label: 'S-layer & membrane', color: '#f4bc72', description: 'A geometric envelope suggests the archaeal surface layer and membrane, without resolving their molecular architecture.' },
      { id: 'genome', label: 'Genome region', color: '#ffc66c', description: 'A schematic genome region without a membrane-bound nucleus.' },
      { id: 'energy', label: 'Energy-conserving systems', color: '#62b4ff', description: 'Conceptual membrane-associated energy systems. The display does not assume mitochondria or aerobic respiration.' },
      { id: 'repair', label: 'Protein maintenance', color: '#63dfb6', description: 'Illustrative protein maintenance structures. Their signal is not a validated thermotolerance prediction.' },
      { id: 'ribosomes', label: 'Ribosomes', color: '#e7a9db', description: 'Schematic particles representing archaeal protein synthesis machinery.' },
    ],
  },
};

export const DEFAULT_VIEW: ViewSettings = { mesh: true, internals: false, cutaway: false, pathways: true, rotating: true, playing: true };
export const LIMITS = { temperature: [5, 110], salinity: [0, 5], ph: [2, 11] } as const;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function sanitizeEnvironment(value: Environment, reference: Environment): Environment {
  return Object.fromEntries((Object.keys(LIMITS) as (keyof Environment)[]).map((key) => {
    const [min, max] = LIMITS[key];
    const n = Number.isFinite(value[key]) ? value[key] : reference[key];
    return [key, Math.max(min, Math.min(max, n))];
  })) as Environment;
}

export function calculateResponse(id: ChassisId, input: Environment) {
  const reference = CHASSIS[id].reference;
  const environment = sanitizeEnvironment(input, reference);
  const thermal = clamp(Math.abs(environment.temperature - reference.temperature) / 35);
  const osmotic = clamp(Math.abs(environment.salinity - reference.salinity) / 2);
  const acidity = clamp(Math.abs(environment.ph - reference.ph) / 3);
  const stress = clamp(thermal * 0.55 + osmotic * 0.25 + acidity * 0.2);
  return { stress, thermal, osmotic, acidity, envelope: clamp(stress * 1.25), repair: clamp(stress * 1.15), energy: clamp(1 - stress * 0.8) };
}
export type Response = ReturnType<typeof calculateResponse>;
export function scenario(id: ChassisId, name: 'reference' | 'heat' | 'combined'): Environment {
  const reference = CHASSIS[id].reference;
  return sanitizeEnvironment({ ...reference,
    temperature: reference.temperature + (name === 'reference' ? 0 : 25),
    salinity: reference.salinity + (name === 'combined' ? 1.8 : 0),
    ph: reference.ph + (name === 'combined' ? 2.5 : 0),
  }, reference);
}
export function createSnapshot(id: ChassisId, environment: Environment, view: ViewSettings, selected: StructureId, timestamp = new Date().toISOString()) {
  const clean = sanitizeEnvironment(environment, CHASSIS[id].reference);
  return { schemaVersion: 1, project: 'Chassix-AI', model: 'illustrative-response-v1', scientificallyValidated: false,
    limitations: ['Conceptual geometry; not to scale.', 'Scenario reference values are demo parameters, not measured optima.', 'The simulation block contains synthetic demo indices, including a scenario-fit yield heuristic; it is not an experimental result or a viability, titer, or metabolic flux prediction.'],
    capturedAt: timestamp, chassis: id, scientificName: CHASSIS[id].scientific, environment: clean,
    units: { temperature: 'degrees Celsius', salinity: 'mol/L', ph: 'pH' }, response: calculateResponse(id, clean), view: { ...view }, selectedStructure: selected };
}
