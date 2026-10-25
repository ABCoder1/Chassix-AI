import { describe, expect, it } from 'vitest';
import { CHASSIS, type ChassisId } from './model';
import { simulateDemo } from './simulation';

const run = (chassisId: ChassisId, changes: Partial<typeof CHASSIS.yeast.reference> = {}) => simulateDemo({
  schemaVersion: 1,
  chassisId,
  environment: { ...CHASSIS[chassisId].reference, ...changes },
});

describe('demo simulation adapter', () => {
  it('updates different outputs when individual stressors change', () => {
    const reference = run('yeast');
    const hot = run('yeast', { temperature: 60 });
    const salty = run('yeast', { salinity: 2.5 });
    const alkaline = run('yeast', { ph: 9 });

    expect(hot.genes.find((item) => item.id === 'hsf')?.index).toBeGreaterThan(reference.genes.find((item) => item.id === 'hsf')!.index);
    expect(salty.metabolites.find((item) => item.id === 'osmoadaptation')?.index).toBeGreaterThan(reference.metabolites.find((item) => item.id === 'osmoadaptation')!.index);
    expect(alkaline.metabolites.find((item) => item.id === 'redox')?.index).toBeLessThan(reference.metabolites.find((item) => item.id === 'redox')!.index);
    expect(hot.pathways.find((item) => item.id === 'folding')?.index).not.toBe(reference.pathways.find((item) => item.id === 'folding')?.index);
  });

  it('shows broken and newly forming schematic links under stress', () => {
    const result = run('yeast', { temperature: 70, salinity: 2.5, ph: 9 });
    expect(result.bonds.some((bond) => bond.state === 'broken')).toBe(true);
    expect(result.bonds.some((bond) => bond.state === 'forming')).toBe(true);
    expect(result.bonds.every((bond) => bond.intensity >= 0 && bond.intensity <= 1)).toBe(true);
  });

  it('returns a visible component breakdown for each demo flux calculation', () => {
    const result = run('yeast', { temperature: 60, salinity: 1.1, ph: 7.5 });
    const folding = result.pathways.find((item) => item.id === 'folding')!;
    const { calculation } = folding;
    expect(calculation.raw).toBeCloseTo(calculation.baseline + calculation.temperature + calculation.salinity + calculation.ph + calculation.combinedStress, 8);
    expect(folding.index).toBe(Math.round(Math.max(0, Math.min(100, calculation.raw))));
    expect(calculation.temperature).toBeGreaterThan(0);
    expect(calculation.ph).toBeGreaterThan(0);
  });

  it('keeps simulated yield fit centered on each chassis demo reference', () => {
    (Object.keys(CHASSIS) as ChassisId[]).forEach((chassisId) => {
      const result = run(chassisId);
      const selected = result.yieldComparisons.find((item) => item.chassisId === chassisId)!;
      expect(selected.index).toBe(96);
      expect(selected.index).toBe(Math.max(...result.yieldComparisons.map((item) => item.index)));
    });
  });

  it('does not invent gene expression for a chassis without a fixture', () => {
    const reference = run('bacterium');
    const stressed = run('bacterium', { temperature: 65, salinity: 2.4, ph: 4 });
    expect(reference.genes).toEqual([]);
    expect(reference.pathways).toEqual([]);
    expect(reference.wholeCellFlux.index).toBe(Math.round(reference.wholeCellFlux.atp * reference.wholeCellFlux.carbon * reference.wholeCellFlux.redox / 10_000));
    expect(stressed.wholeCellFlux.index).toBeLessThan(reference.wholeCellFlux.index);
  });
});
