import { CHASSIS, type ChassisId, type Response, type StructureId } from './model';

export type ExplorerMode = 'organelles' | 'grn' | 'three';
export type ReferenceSource = { id: string; title: string; url: string; kind: 'Study' | 'Gene record' };
export const REFERENCES: Record<string, ReferenceSource> = {
  hsf: { id: 'hsf', title: 'Hsf1 binding and transcription in budding yeast · 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6340206/', kind: 'Study' },
  msn: { id: 'msn', title: 'Msn2/Msn4 and STRE-dependent induction · 1996', url: 'https://pubmed.ncbi.nlm.nih.gov/8641288/', kind: 'Study' },
  skn: { id: 'skn', title: 'NCBI / SGD · SKN7, S. cerevisiae S288C', url: 'https://www.ncbi.nlm.nih.gov/gene/856613', kind: 'Gene record' },
  rpoh: { id: 'rpoh', title: 'NCBI / EcoCyc · rpoH, E. coli K-12 MG1655', url: 'https://www.ncbi.nlm.nih.gov/gene/947970', kind: 'Gene record' },
  dnak: { id: 'dnak', title: 'EcoliWiki · dnaK, E. coli K-12 MG1655', url: 'https://ecoliwiki.org/colipedia/index.php/dnaK:Gene', kind: 'Gene record' },
  rpos: { id: 'rpos', title: 'NCBI / EcoCyc · rpoS, E. coli K-12 MG1655', url: 'https://www.ncbi.nlm.nih.gov/gene/947210', kind: 'Gene record' },
  archaeal: { id: 'archaeal', title: 'Heat-shock response in P. furiosus · 2003', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC154833/', kind: 'Study' },
};

export type Gene = { id: string; label: string; role: string; context: string; motif: string; color: string; sources: string[]; x: number; y: number; kind: 'Regulator' | 'Response gene' };
export type RegulatoryEdge = { from: string; to: string; label: string; evidence: 'Published regulation' | 'Conceptual association'; sources: string[] };
export type GeneCatalog = { scope: string; genes: Gene[]; edges: RegulatoryEdge[]; caveat: string };

export const CATALOGS: Record<ChassisId, GeneCatalog> = {
  yeast: {
    scope: 'S. cerevisiae reference biology',
    caveat: 'A small reference circuit, not a reconstructed whole-cell GRN. Published links do not establish activity in this scenario.',
    genes: [
      { id: 'HSF1', label: 'Hsf1', role: 'Heat-shock transcription factor', context: 'A transcriptional regulator of chaperone genes. HSP82 is among the targets examined in the linked binding/transcription study.', motif: 'Heat-shock element (HSE)', color: '#f0bb68', sources: ['hsf'], x: 235, y: 180, kind: 'Regulator' },
      { id: 'MSN2', label: 'Msn2', role: 'Environmental stress regulator', context: 'Msn2 and Msn4 participate in STRE-dependent induction of stress genes, including CTT1. Expression abundance alone does not establish nuclear localization or regulator activity.', motif: 'Stress-response element (STRE)', color: '#ed8ec7', sources: ['msn'], x: 235, y: 340, kind: 'Regulator' },
      { id: 'MSN4', label: 'Msn4', role: 'Environmental stress regulator', context: 'Msn4 contributes alongside Msn2 to stress-responsive transcription. A transcript fold change is distinct from transcription-factor activity.', motif: 'Stress-response element (STRE)', color: '#c49aef', sources: ['msn'], x: 235, y: 500, kind: 'Regulator' },
      { id: 'HSP82', label: 'Hsp82', role: 'Chaperone response gene', context: 'Shown as a chaperone target in the Hsf1 reference circuit. The linked study examines Hsf1 occupancy and transcription at this locus.', motif: 'Hsf1 target context', color: '#73dabc', sources: ['hsf'], x: 745, y: 210, kind: 'Response gene' },
      { id: 'CTT1', label: 'Ctt1', role: 'Catalase response gene', context: 'A stress-response gene whose induction through STREs requires Msn2/Msn4 in the linked study. No enzyme activity is calculated here.', motif: 'STRE-dependent response', color: '#7ab8f1', sources: ['msn'], x: 745, y: 445, kind: 'Response gene' },
      { id: 'SKN7', label: 'Skn7', role: 'Stress-responsive regulator', context: 'A curated stress-responsive transcription factor. It is included for inspection; this small circuit does not assert a specific target edge for Skn7.', motif: 'Response-regulator context', color: '#74d4da', sources: ['skn'], x: 490, y: 595, kind: 'Regulator' },
    ],
    edges: [
      { from: 'HSF1', to: 'HSP82', label: 'HSE-associated regulation', evidence: 'Published regulation', sources: ['hsf'] },
      { from: 'MSN2', to: 'CTT1', label: 'STRE-dependent induction', evidence: 'Published regulation', sources: ['msn'] },
      { from: 'MSN4', to: 'CTT1', label: 'STRE-dependent induction', evidence: 'Published regulation', sources: ['msn'] },
    ],
  },
  bacterium: {
    scope: 'E. coli K-12 MG1655 reference genes',
    caveat: 'Dashed links are conceptual stress-response associations. Direct regulatory edges have not been curated for this bacterial view.',
    genes: [
      { id: 'rpoH', label: 'RpoH / σ32', role: 'Heat-response sigma factor', context: 'A bacterial sigma-factor reference. Its transcript level is not a direct measurement of sigma-factor activity.', motif: 'Sigma-factor context', color: '#f0bb68', sources: ['rpoh'], x: 245, y: 230, kind: 'Regulator' },
      { id: 'dnaK', label: 'DnaK', role: 'Protein-folding chaperone', context: 'A bacterial chaperone gene, represented as a protein-maintenance component. The reference entry identifies the K-12 locus b0014.', motif: 'Protein folding', color: '#73dabc', sources: ['dnak'], x: 745, y: 325, kind: 'Response gene' },
      { id: 'rpoS', label: 'RpoS / σS', role: 'Stress-response sigma factor', context: 'A bacterial stress-response sigma-factor reference. No direct rpoS-to-dnaK regulatory link is asserted by this schematic.', motif: 'Sigma-factor context', color: '#a798f0', sources: ['rpos'], x: 245, y: 465, kind: 'Regulator' },
    ],
    edges: [{ from: 'rpoH', to: 'dnaK', label: 'Stress-response context', evidence: 'Conceptual association', sources: [] }],
  },
  archaeon: {
    scope: 'P. furiosus heat-response reference genes',
    caveat: 'These genes were studied in a heat-shock experiment. Their common context is not evidence of direct regulation between them.',
    genes: [
      { id: 'PF1974', label: 'PF1974', role: 'Thermosome / chaperonin', context: 'A chaperonin locus discussed in the P. furiosus heat-shock study. No yeast or bacterial regulatory circuit is transferred to this organism.', motif: 'Protein folding', color: '#f0bb68', sources: ['archaeal'], x: 250, y: 220, kind: 'Response gene' },
      { id: 'PF1883', label: 'PF1883', role: 'Small heat-shock protein', context: 'A small heat-shock-protein locus in the same experimental context. Scenario controls do not reproduce that experiment.', motif: 'Protein maintenance', color: '#ed8ec7', sources: ['archaeal'], x: 740, y: 325, kind: 'Response gene' },
      { id: 'PF1882', label: 'PF1882', role: 'AAA+ chaperone context', context: 'A chaperone locus associated with the reported heat-response study. No causal edge is inferred from co-response.', motif: 'Protein maintenance', color: '#73dabc', sources: ['archaeal'], x: 250, y: 460, kind: 'Response gene' },
    ],
    edges: [
      { from: 'PF1974', to: 'PF1883', label: 'Shared study context', evidence: 'Conceptual association', sources: ['archaeal'] },
      { from: 'PF1882', to: 'PF1883', label: 'Shared study context', evidence: 'Conceptual association', sources: ['archaeal'] },
    ],
  },
};

export type ModuleId = 'stress' | 'envelope' | 'sensor' | 'genome' | 'repair' | 'folding' | 'aggregates' | 'redox' | 'energy' | 'detox';
export type CellModule = { id: ModuleId; title: string; category: string; description: string; color: string; x: number; y: number; structure: StructureId | null; genes: string[] };
export function cellModules(id: ChassisId): CellModule[] {
  const yeast = id === 'yeast', bacteria = id === 'bacterium';
  return [
    { id: 'stress', title: 'Physicochemical stress', category: 'External scenario', description: 'A normalized combination of deviations from the scenario reference. This is an input-derived visualization signal, not a measured stress assay.', color: '#f4ba61', x: 500, y: 75, structure: null, genes: [] },
    { id: 'envelope', title: yeast ? 'Plasma membrane & wall' : CHASSIS[id].structures[0].label, category: 'Structural envelope', description: 'The outer boundary links the environmental scenario to a schematic envelope response. Layer thickness, tension, and pore size are not measured.', color: CHASSIS[id].color, x: 215, y: 215, structure: 'envelope', genes: [] },
    { id: 'sensor', title: 'Stress-sensing systems', category: 'Conceptual signal flow', description: 'Represents the role of cellular sensing. The arrows summarize a conceptual journey and do not identify a verified molecular sensor cascade.', color: '#e780bb', x: 210, y: 405, structure: 'envelope', genes: [] },
    { id: 'genome', title: yeast ? 'Nucleus / gene regulation' : 'Genome / gene regulation', category: 'Regulatory context', description: 'Connects the cell map to the species-specific reference genes. Transcript abundance, regulator activation, and downstream activity are different quantities.', color: '#f1c870', x: 325, y: 545, structure: 'genome', genes: yeast ? ['HSF1', 'MSN2', 'MSN4', 'SKN7'] : bacteria ? ['rpoH', 'rpoS'] : [] },
    { id: 'repair', title: yeast ? 'Homeostatic chaperones' : 'Protein maintenance', category: 'Proteostasis', description: 'A conceptual protein-maintenance response. The displayed signal does not quantify chaperone concentration, folding rate, or recovered viability.', color: '#67d8b4', x: 575, y: 565, structure: 'repair', genes: yeast ? ['HSP82'] : bacteria ? ['dnaK'] : ['PF1974', 'PF1883', 'PF1882'] },
    { id: 'folding', title: yeast ? 'ER / protein misfolding' : bacteria ? 'Periplasm / misfolding' : 'Protein-folding burden', category: 'Protein quality context', description: 'A schematic protein-folding burden. The organism-specific label avoids assigning an ER to bacteria or archaea. No unfolded-protein assay is connected.', color: '#eea06b', x: 550, y: 315, structure: 'repair', genes: [] },
    { id: 'aggregates', title: 'Cytoplasmic aggregates', category: 'Illustrative burden', description: 'A visual cue for proteotoxic burden. The index is not an aggregate count, a mass concentration, or a prediction of irreversible damage.', color: '#e58863', x: 540, y: 180, structure: 'repair', genes: [] },
    { id: 'redox', title: yeast || bacteria ? 'ROS / redox stress' : 'Redox-balance context', category: 'Illustrative redox response', description: 'A conceptual redox-stress indicator. No reactive oxygen concentration, oxygen requirement, or redox potential is inferred from the environment sliders.', color: '#ed798b', x: 785, y: 410, structure: 'energy', genes: yeast ? ['SKN7', 'CTT1'] : [] },
    { id: 'energy', title: yeast ? 'Mitochondrial systems' : bacteria ? 'Membrane energy systems' : 'Energy-conserving systems', category: 'Energy-system context', description: 'An illustrative energy-system signal. It is not ATP production, metabolic flux, or yield. Bacterial and archaeal views do not contain mitochondria.', color: '#79acf1', x: 835, y: 555, structure: 'energy', genes: [] },
    { id: 'detox', title: yeast ? 'Peroxisome / detox context' : 'Cellular defense systems', category: 'Defense context', description: 'A schematic defense compartment or system. No specific detoxification mechanism or enzyme activity is estimated.', color: '#67c9da', x: 835, y: 240, structure: 'repair', genes: yeast ? ['CTT1'] : [] },
  ];
}
export const MODULE_LINKS: [ModuleId, ModuleId][] = [['stress', 'envelope'], ['envelope', 'sensor'], ['sensor', 'genome'], ['genome', 'repair'], ['stress', 'folding'], ['folding', 'aggregates'], ['folding', 'redox'], ['redox', 'energy'], ['detox', 'redox']];
export function moduleSignal(id: ModuleId, response: Response): number {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  switch (id) {
    case 'stress': return response.stress;
    case 'envelope': return response.envelope;
    case 'sensor': return clamp(response.envelope * 1.1);
    case 'genome': return clamp(response.stress * 1.1);
    case 'repair': return response.repair;
    case 'folding': return clamp(response.stress * 1.3);
    case 'aggregates': return clamp((response.stress - 0.2) * 1.4);
    case 'redox': return clamp(response.stress * 1.15);
    case 'energy': return response.energy;
    case 'detox': return clamp(response.stress * 1.2);
  }
}
