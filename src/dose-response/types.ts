/**
 * Wire shapes the dose-response visuals accept.
 *
 * Hand-written `*Like` interfaces, never an app's generated DTO: every
 * consumer maps its own payload into these. Two shapes exist because two
 * shapes are in the wild — a fitted curve as the backend returns it
 * (`{concentration, response}` points, `intercept_values` as typed rows) and
 * the frozen `curve_snapshot` JSONB a campaign stores (`{x, y}` points,
 * everything else loose after the JSONB round-trip). `CurveLike` accepts
 * either; the readers in `read.ts` do the narrowing once, so no consumer
 * needs a placeholder-filled adapter to be allowed to draw.
 */

import type { CSSProperties, ComponentType } from "react";

// ─── Plotly injection ────────────────────────────────────────────────────────

/** Loose Plotly props — mirrors each app's own wrapper so no app needs
 *  `@types/plotly.js` and the object-typed props accept plain literals. */
export interface PlotProps {
  data: ReadonlyArray<Record<string, unknown>>;
  layout: Record<string, unknown>;
  config?: Record<string, unknown>;
  style?: CSSProperties;
  useResizeHandler?: boolean;
  onClick?: (event: unknown) => void;
  className?: string;
}

/**
 * The host app's Plotly component, passed in rather than imported.
 *
 * Plotly touches `document` at module load, so every app already owns a
 * client-only wrapper (`next/dynamic` with `ssr: false`). Taking it as a prop
 * keeps this package free of `next`, `react-plotly.js` and `plotly.js`, and
 * lets each app's existing test mocks keep working.
 */
export type PlotComponent = ComponentType<PlotProps>;

// ─── Points ──────────────────────────────────────────────────────────────────

/** A point on a frozen snapshot: `{x, y}` plus display flags. Type alias
 *  (not an interface) so an array of these is assignable to the loose
 *  `unknown[]` a `CurveLike` carries. */
export type CurvePoint = {
  x: number;
  y: number;
  is_excluded?: boolean;
  is_outlier?: boolean;
  replicate_count?: number | null;
};

/** A point after narrowing, whichever wire shape it arrived in. */
export interface ReadPoint {
  concentration: number;
  response: number;
}

// ─── Intercepts ──────────────────────────────────────────────────────────────

/** An intercept spec after narrowing. `kind`/`basis` stay strings: the
 *  vocabulary is the protocol's, not this package's. */
export interface InterceptSpecLike {
  kind: string;
  level: number;
  basis?: string | null;
  label?: string | null;
}

/** One intercept derived from a fit (EC50, EC90, …), after narrowing. */
export interface InterceptValueLike {
  spec: InterceptSpecLike;
  value: number;
  confidence_interval_low: number | null;
  confidence_interval_high: number | null;
  at_bound: boolean;
}

// ─── Curves ──────────────────────────────────────────────────────────────────

/** Aggregate marker, present only on MEAN_ACROSS_RUNS / GEOMETRIC_MEAN
 *  cells. When set, the chart draws one vertical line here and suppresses
 *  the per-curve intercept lines — a per-run `fitted_value` does not equal
 *  the aggregated cell value, and a marker at the wrong place misleads. */
export interface AggregateMarker {
  marker_x: number;
  marker_label: string;
  unit?: string;
}

/** A non-representative contributing curve on an aggregate-mode cell,
 *  drawn muted underneath the primary so the per-run spread is visible. */
export interface AdditionalCurve {
  fitted_value: number;
  top: number;
  bottom: number;
  hill_slope: number;
  r_squared?: number | null;
  curve_class?: string | null;
  raw_data?: CurvePoint[] | null;
  intercept_values?: readonly unknown[] | null;
  curve_type?: string | null;
  run_date: string;
  run_id?: string;
}

/**
 * A fitted dose-response curve, as much of one as the picture needs.
 *
 * Only the four Hill parameters are required. Everything else is optional
 * and read defensively, so a backend DTO and a frozen `curve_snapshot` both
 * satisfy it as they are — that is what removes the placeholder-UUID
 * adapters consumers used to need.
 */
export interface CurveLike {
  /** Only used to key React children and to scope edit interactions. */
  id?: string | null;
  /** Preferred display name (registration number, compound label). Falls
   *  back to `registration_number`, then `molecule_name`, then the curve-type
   *  label. */
  label?: string | null;
  registration_number?: string | null;
  molecule_name?: string | null;

  fitted_value: number;
  top: number;
  bottom: number;
  hill_slope: number;

  fitted_unit?: string | null;
  r_squared?: number | null;
  /** Descriptive only (`"ic50"`, `"ec50"`, …) — post-033 the readout
   *  definition carries identity. Used for the legacy headline label when
   *  `intercept_values` is empty. */
  curve_type?: string | null;
  curve_class?: string | null;
  confidence_interval_low?: number | null;
  confidence_interval_high?: number | null;
  /** `{concentration, response}` or `{x, y}` rows. */
  raw_data?: readonly unknown[] | null;
  /** Exclusion rows: `{idx, source, excluded, reason, concentration, response}`
   *  post-041, or legacy `{idx: null, …}` / coords-only shapes. */
  excluded_points?: readonly unknown[] | null;
  fit_quality_warnings?: readonly string[] | null;
  /** `InterceptValueLike` rows, typed or JSONB-loose. */
  intercept_values?: readonly unknown[] | null;
  /** `AdditionalCurve` rows, typed or JSONB-loose. */
  additional_curves?: readonly unknown[] | null;
  aggregate?: AggregateMarker | null;
}

/**
 * A curve as a frozen `curve_snapshot` carries it: the same curve, with the
 * point and overlay arrays typed, because whoever wrote the snapshot
 * normalised them to `{x, y}` first.
 *
 * This is what `DoseResponseFigure` takes, and it satisfies `CurveLike`, so a
 * snapshot goes to either renderer without an adapter.
 */
export interface CurveSnapshot extends CurveLike {
  raw_data?: CurvePoint[] | null;
  excluded_points?: CurvePoint[] | null;
  additional_curves?: AdditionalCurve[] | null;
  /**
   * When the surface colours by a NON-primary intercept (an IC90, say), the
   * value and label of that intercept. Drawn as a distinct solid reference
   * line so an expanded curve agrees with the column it was opened from;
   * `fitted_value` stays at the primary intercept.
   */
  selected_intercept?: { value: number; label: string } | null;
}
