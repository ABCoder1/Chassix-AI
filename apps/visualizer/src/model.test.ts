import { describe, expect, it } from "vitest";
import {
  CHASSIS,
  DEFAULT_VIEW,
  calculateResponse,
  createSnapshot,
  sanitizeEnvironment,
  scenario,
  type ChassisId,
} from "./model";

describe("illustrative environmental response", () => {
  for (const id of Object.keys(CHASSIS) as ChassisId[]) {
    it(`${id}: has zero stress at its own scenario reference`, () => {
      expect(calculateResponse(id, CHASSIS[id].reference).stress).toBe(0);
    });
    it(`${id}: responds to both warmer and colder conditions`, () => {
      const reference = CHASSIS[id].reference;
      expect(
        calculateResponse(id, { ...reference, temperature: reference.temperature + 10 }).stress,
      ).toBeGreaterThan(0);
      expect(
        calculateResponse(id, { ...reference, temperature: reference.temperature - 10 }).stress,
      ).toBeGreaterThan(0);
    });
    it(`${id}: keeps extreme inputs bounded and finite`, () => {
      const response = calculateResponse(id, { temperature: Infinity, salinity: -100, ph: NaN });
      for (const value of Object.values(response)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
    it(`${id}: applies reachable scenario presets and resets without modifying references`, () => {
      const before = { ...CHASSIS[id].reference };
      const combined = scenario(id, "combined");
      expect(combined.temperature).toBeLessThanOrEqual(110);
      expect(calculateResponse(id, combined).stress).toBeGreaterThan(
        calculateResponse(id, scenario(id, "reference")).stress,
      );
      expect(CHASSIS[id].reference).toEqual(before);
    });
  }
  it("does not label bacterial or archaeal structures as a nucleus or mitochondria", () => {
    for (const id of ["bacterium", "archaeon"] as const) {
      const labels = CHASSIS[id].structures.map((item) => item.label).join(" ");
      expect(labels).not.toMatch(/nucleus|mitochondri/i);
    }
  });
  it("clamps out-of-range inputs to the visible control limits", () => {
    expect(
      sanitizeEnvironment({ temperature: 200, salinity: -2, ph: 20 }, CHASSIS.yeast.reference),
    ).toEqual({ temperature: 110, salinity: 0, ph: 11 });
  });
  it("exports a reproducible snapshot with units, model identity, and explicit limitations", () => {
    const env = scenario("bacterium", "combined");
    const snapshot = createSnapshot(
      "bacterium",
      env,
      DEFAULT_VIEW,
      "genome",
      "2026-10-24T00:00:00Z",
    );
    expect(snapshot.response).toEqual(calculateResponse("bacterium", env));
    expect(snapshot.scientificallyValidated).toBe(false);
    expect(snapshot.model).toBe("illustrative-response-v1");
    expect(snapshot.units.salinity).toBe("mol/L");
    expect(snapshot.limitations.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    snapshot.environment.temperature = 5;
    expect(env.temperature).not.toBe(5);
  });
});
