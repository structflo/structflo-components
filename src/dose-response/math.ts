/**
 * Pure math + geometry for dose-response rendering. No DOM, no React.
 *
 * The 4PL evaluator must stay in lock-step with the backend fitter
 * (cellar's `infrastructure/lmfit/curve_fitter.py`); a drawn curve that
 * disagrees with the reported parameters is worse than no curve.
 */

import type { CurveLike } from "./types";

/** Number of points used to draw a fitted 4PL sigmoid. */
export const CURVE_FIT_POINTS = 100;

/** Hill parameters — the minimum needed to draw a sigmoid. */
export interface FitParams {
  top: number;
  bottom: number;
  fitted_value: number;
  hill_slope: number;
}

/** Industry-standard 4PL (Prism / GraphPad convention).
 *
 *     y = bottom + (top - bottom) / (1 + 10^((logEC50 - logX) * hill))
 *
 * `top` / `bottom` are the Y plateaus, direction-agnostic. `hill` is
 * signed: positive rising, negative falling. */
export function evaluate4PL(logX: number, params: FitParams): number {
  const { top, bottom, fitted_value, hill_slope } = params;
  const logEc50 = Math.log10(fitted_value);
  return bottom + (top - bottom) / (1 + 10 ** ((logEc50 - logX) * hill_slope));
}

/** `n` evenly-spaced (in log X) sigmoid points across [xMin, xMax], as
 *  parallel arrays so callers can feed Plotly, an SVG polyline or a canvas
 *  path without re-implementing the equation. */
export function generate4PLPoints(
  params: FitParams,
  xMin: number,
  xMax: number,
  n: number = CURVE_FIT_POINTS,
): { x: number[]; y: number[]; logX: number[] } {
  const logMin = Math.log10(xMin);
  const logMax = Math.log10(xMax);
  const x: number[] = [];
  const y: number[] = [];
  const logX: number[] = [];
  for (let i = 0; i < n; i++) {
    const lx = logMin + ((logMax - logMin) * i) / (n - 1);
    logX.push(lx);
    x.push(10 ** lx);
    y.push(evaluate4PL(lx, params));
  }
  return { x, y, logX };
}

/** Thin wrapper so callers with a whole curve don't destructure it. */
export function generate4PLCurve(
  curve: CurveLike,
  xMin: number,
  xMax: number,
): { x: number[]; y: number[] } {
  const { x, y } = generate4PLPoints(curve, xMin, xMax, CURVE_FIT_POINTS + 1);
  return { x, y };
}

/** Multiplier applied to the lowest data X to set the rendered axis floor. */
export const X_AXIS_MIN_RATIO = 0.1;
/** Multiplier applied to the highest data X to set the rendered axis ceiling. */
export const X_AXIS_MAX_RATIO = 10;
/** Fallback ratios when no data points are present (centred on fitted_value). */
export const X_AXIS_FALLBACK_MIN_RATIO = 0.01;
export const X_AXIS_FALLBACK_MAX_RATIO = 100;
/** Lower clamp on the rendered X axis to keep log10 stable. */
export const X_AXIS_FLOOR = 1e-12;

/** Marker styling for replicate / outlier points on the plot. */
export const PLOT_MARKER = {
  REPLICATE_SIZE: 5,
  REPLICATE_OPACITY: 0.35,
  EXCLUDED_SIZE: 8,
  MANUAL_EXCLUDED_OPACITY: 0.5,
  AUTO_EXCLUDED_OPACITY: 0.45,
  POINT_SIZE_INTERACTIVE: 9,
  POINT_SIZE_STATIC: 7,
} as const;

/**
 * A curve with no meaningful sigmoid to draw: classified inactive, or the
 * fit produced degenerate parameters. `ec50_at_bound` curves still render
 * (with an amber warning) so the data and the extrapolated fit are visible —
 * only truly inactive / zero curves are suppressed.
 */
export function isDegenerateFit(curve: CurveLike): boolean {
  return (
    curve.curve_class === "inactive" ||
    !Number.isFinite(curve.fitted_value) ||
    curve.fitted_value <= 0 ||
    curve.hill_slope === 0
  );
}

/** Group points by concentration; return mean ± SD arrays for error bars,
 *  plus the individual replicates for the semi-transparent scatter layer. */
export function computeReplicateStats(
  x: number[],
  y: number[],
): {
  meanX: number[];
  meanY: number[];
  sdY: number[];
  replicateX: number[];
  replicateY: number[];
} {
  if (x.length === 0) {
    return { meanX: [], meanY: [], sdY: [], replicateX: [], replicateY: [] };
  }

  // String key: float equality can't group 1e-7 reliably.
  const groups = new Map<string, { conc: number; responses: number[] }>();
  for (let i = 0; i < x.length; i++) {
    const key = x[i].toPrecision(10);
    if (!groups.has(key)) groups.set(key, { conc: x[i], responses: [] });
    groups.get(key)?.responses.push(y[i]);
  }

  const meanX: number[] = [];
  const meanY: number[] = [];
  const sdY: number[] = [];
  const replicateX: number[] = [];
  const replicateY: number[] = [];

  for (const { conc, responses } of groups.values()) {
    const mean = responses.reduce((a, b) => a + b, 0) / responses.length;
    meanX.push(conc);
    meanY.push(mean);

    if (responses.length > 1) {
      const variance =
        responses.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (responses.length - 1);
      sdY.push(Math.sqrt(variance));
    } else {
      sdY.push(0);
    }

    if (responses.length > 1) {
      for (const resp of responses) {
        replicateX.push(conc);
        replicateY.push(resp);
      }
    }
  }

  return { meanX, meanY, sdY, replicateX, replicateY };
}

/** Tailwind text color for an R² value. */
export function rSquaredColor(r2: number): string {
  if (r2 >= 0.9) return "text-green-400";
  if (r2 >= 0.8) return "text-yellow-400";
  return "text-destructive";
}
