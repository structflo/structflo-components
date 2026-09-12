import { describe, expect, it } from "vitest";
import { computeReplicateStats, evaluate4PL, generate4PLCurve, generate4PLPoints } from "./math";


/**
 * Pin the 4PL Hill convention to GraphPad Prism (matches backend
 * ``infrastructure/lmfit/curve_fitter.py``):
 *
 *     y = bottom + (top - bottom) / (1 + 10^((logEC50 - log(c)) * hill))
 *
 * - hill > 0 ⇒ RISING curve (response increases with dose)
 * - hill < 0 ⇒ FALLING curve
 *
 * A second copy of this evaluator used to live in
 * ``research-organization/lib/curve-math.ts`` with the Hill sign inverted —
 * making search-results curves render flipped relative to the protocol view.
 * That copy is gone; this test guards against re-introducing the same bug
 * if someone re-implements the math closer to a consumer.
 */
describe("evaluate4PL — Prism convention", () => {
  const RISING = { top: 100, bottom: 0, fitted_value: 1, hill_slope: 1 };
  const FALLING = { top: 100, bottom: 0, fitted_value: 1, hill_slope: -1 };

  it("hill > 0 produces a rising curve", () => {
    const yLow = evaluate4PL(Math.log10(0.01), RISING);
    const yMid = evaluate4PL(Math.log10(1), RISING);
    const yHigh = evaluate4PL(Math.log10(100), RISING);
    expect(yLow).toBeLessThan(yMid);
    expect(yMid).toBeLessThan(yHigh);
  });

  it("hill < 0 produces a falling curve", () => {
    const yLow = evaluate4PL(Math.log10(0.01), FALLING);
    const yMid = evaluate4PL(Math.log10(1), FALLING);
    const yHigh = evaluate4PL(Math.log10(100), FALLING);
    expect(yLow).toBeGreaterThan(yMid);
    expect(yMid).toBeGreaterThan(yHigh);
  });

  it("y crosses (top + bottom) / 2 at the EC50 for hill ≠ 0", () => {
    expect(evaluate4PL(Math.log10(1), RISING)).toBeCloseTo(50, 6);
    expect(evaluate4PL(Math.log10(1), FALLING)).toBeCloseTo(50, 6);
  });

  it("approaches the asymptotes far from the EC50", () => {
    expect(evaluate4PL(Math.log10(1e-9), RISING)).toBeCloseTo(0, 6);
    expect(evaluate4PL(Math.log10(1e9), RISING)).toBeCloseTo(100, 6);
  });
});

describe("generate4PLPoints", () => {
  const PARAMS = { top: 100, bottom: 0, fitted_value: 1, hill_slope: 1 };

  it("emits n samples spanning [xMin, xMax] in log space", () => {
    const { x, y, logX } = generate4PLPoints(PARAMS, 0.001, 1000, 11);
    expect(x).toHaveLength(11);
    expect(y).toHaveLength(11);
    expect(logX).toHaveLength(11);
    expect(x[0]).toBeCloseTo(0.001, 8);
    expect(x[x.length - 1]).toBeCloseTo(1000, 6);
  });

  it("y values increase monotonically for a rising curve", () => {
    const { y } = generate4PLPoints(PARAMS, 0.001, 1000, 50);
    for (let i = 1; i < y.length; i++) {
      expect(y[i]).toBeGreaterThanOrEqual(y[i - 1]);
    }
  });

  it("agrees with evaluate4PL pointwise", () => {
    const { x, y } = generate4PLPoints(PARAMS, 0.01, 100, 25);
    for (let i = 0; i < x.length; i++) {
      expect(y[i]).toBeCloseTo(evaluate4PL(Math.log10(x[i]), PARAMS), 9);
    }
  });
});

// ─── computeReplicateStats ────────────────────────────────────────────────────

describe("computeReplicateStats", () => {
  it("returns empty arrays for empty input", () => {
    const result = computeReplicateStats([], []);
    expect(result.meanX).toEqual([]);
    expect(result.meanY).toEqual([]);
    expect(result.sdY).toEqual([]);
    expect(result.replicateX).toEqual([]);
    expect(result.replicateY).toEqual([]);
  });

  it("returns single points unchanged with zero SD for singletons", () => {
    const { meanX, meanY, sdY, replicateX } = computeReplicateStats([1, 10], [50, 80]);
    expect(meanX).toEqual([1, 10]);
    expect(meanY).toEqual([50, 80]);
    expect(sdY).toEqual([0, 0]);
    // No replicates for singleton groups
    expect(replicateX).toEqual([]);
  });

  it("groups replicates at the same concentration and computes mean + SD", () => {
    // Two replicates at 1 µM: 48 and 52 → mean 50, SD = sqrt(((48-50)^2+(52-50)^2)/(2-1)) = 2.828...
    const x = [1, 1];
    const y = [48, 52];
    const { meanX, meanY, sdY, replicateX, replicateY } = computeReplicateStats(x, y);
    expect(meanX).toHaveLength(1);
    expect(meanX[0]).toBe(1);
    expect(meanY[0]).toBeCloseTo(50, 8);
    expect(sdY[0]).toBeCloseTo(Math.sqrt(8), 6);
    // Both individual replicates are surfaced
    expect(replicateX).toEqual([1, 1]);
    expect(replicateY).toEqual([48, 52]);
  });

  it("handles a mix of singleton and replicate concentrations", () => {
    const x = [0.1, 1, 1, 10];
    const y = [10, 48, 52, 90];
    const { meanX, meanY } = computeReplicateStats(x, y);
    // Three distinct groups: 0.1, 1, 10
    expect(meanX).toHaveLength(3);
    // Group at 1: mean of [48,52] = 50
    const idx = meanX.indexOf(1);
    expect(meanY[idx]).toBeCloseTo(50, 8);
  });
});

// ─── generate4PLCurve ─────────────────────────────────────────────────────────

describe("generate4PLCurve", () => {
  // Only the fields consumed by generate4PLPoints / isDegenerateFit are needed;
  // cast to the full type so the rest of the suite doesn't need all required fields.
  const CURVE = {
    id: "test",
    top: 100,
    bottom: 0,
    fitted_value: 1,
    hill_slope: 1,
    curve_class: "full",
  } as Parameters<typeof generate4PLCurve>[0];

  it("returns non-empty parallel x/y arrays", () => {
    const { x, y } = generate4PLCurve(CURVE, 0.001, 1000);
    expect(x.length).toBeGreaterThan(0);
    expect(x.length).toBe(y.length);
  });

  it("x values span the requested range in log space", () => {
    const xMin = 0.001;
    const xMax = 1000;
    const { x } = generate4PLCurve(CURVE, xMin, xMax);
    expect(x[0]).toBeCloseTo(xMin, 8);
    expect(x[x.length - 1]).toBeCloseTo(xMax, 5);
  });

  it("produces a rising curve for hill_slope > 0", () => {
    const { y } = generate4PLCurve(CURVE, 0.001, 1000);
    expect(y[0]).toBeLessThan(y[y.length - 1]);
  });

  it("y midpoint is near 50 at the EC50 concentration", () => {
    // At x = fitted_value = 1, the 4PL evaluates to exactly (top + bottom) / 2 = 50
    const { x, y } = generate4PLCurve(CURVE, 0.001, 1000);
    const midIdx = x.findIndex((v) => Math.abs(v - 1) < 0.01);
    expect(y[midIdx]).toBeCloseTo(50, 0);
  });
});
