import { expect, it } from 'vitest';
import { frameDelta, loopPhase } from './animation';

it('handles backward, suspended, and invalid frame timestamps without poisoning animation time', () => {
  expect(frameDelta(99, 100)).toBe(0);
  expect(frameDelta(100000, 100)).toBe(0.05);
  expect(frameDelta(NaN, 100)).toBe(0);
  expect(frameDelta(116, 100)).toBeCloseTo(0.016);
});

it('keeps particle interpolation inside the curve for negative, wrapping, and invalid phases', () => {
  for (const value of [-200.1, -0.01, 0, 0.99, 1, 1000.5, NaN, Infinity]) {
    const phase = loopPhase(value);
    expect(Number.isFinite(phase)).toBe(true);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
  }
});
