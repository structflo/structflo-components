/**
 * The picture, as data: every trace, shape, annotation and layout value the
 * dose-response chart draws.
 *
 * Pure — same inputs, same output, no React and no DOM. Both the read-only
 * surfaces and an editing shell call this one builder, which is what keeps a
 * campaign's curve and its source run's curve pixel-identical. The optional
 * edit fields on `BuildPlotOptions` are display state (which point is drafted
 * out, which preview fit to overlay) — never a client, a session or a store.
 *
 * Plotly's trace / shape / annotation objects are untyped here for the same
 * reason each app leaves them untyped: `@types/plotly.js` rejects several
 * runtime-valid shapes these builders use.
 */

import { CHART_AXIS, CHART_COLORS, GROUP_PALETTE } from "./colors";
import { curveTypeLabel, interceptLabel } from "./labels";
import {
  type FitParams,
  PLOT_MARKER,
  X_AXIS_FALLBACK_MAX_RATIO,
  X_AXIS_FALLBACK_MIN_RATIO,
  X_AXIS_FLOOR,
  X_AXIS_MAX_RATIO,
  X_AXIS_MIN_RATIO,
  computeReplicateStats,
  generate4PLCurve,
  generate4PLPoints,
  isDegenerateFit,
} from "./math";
import {
  type CapturedPoint,
  buildCapturedPoints,
  pickNum,
  readAdditionalCurves,
  readIntercepts,
  readRecords,
} from "./read";
import type { CurveLike } from "./types";

export type PlotTrace = Record<string, unknown>;
export type PlotShape = Record<string, unknown>;
export type PlotAnnotation = Record<string, unknown>;

const TRACE_COLORS = GROUP_PALETTE.slice(0, 8);
const NO_EXCLUSIONS: ReadonlySet<number> = new Set();

export interface BuildPlotOptions {
  /** Shade the 95% CI band between the CI-low / CI-high sigmoids. */
  showCI: boolean;
  /** Draw the intercept cross-hair (and the extra intercept lines). */
  showMarker: boolean;
  /** Draw the top / bottom asymptote lines. */
  showPlateaus: boolean;
  /** Larger points with a light outline — the run page's hit area. */
  interactive?: boolean;
  /** Edit mode: click-to-exclude hover text, `clickmode: "event"`, no drag-zoom. */
  editMode?: boolean;
  /** Which curve the draft exclusions and preview fit belong to. */
  editCurveId?: string | null;
  /** Captured-set indices the chemist has toggled out this session but not
   *  yet saved. Rendered as manual exclusions so the toggle shows at once. */
  draftExcluded?: ReadonlySet<number>;
  /** Dashed "after" sigmoid from a refit preview, drawn over the committed fit. */
  previewFit?: FitParams | null;
}

/** Which curve (and which captured points) a clickable trace carries, by
 *  trace index — the map a click handler needs to get from a Plotly
 *  `pointIndex` back to the backend's `excluded_indices` domain. */
export interface TraceTarget {
  curveId: string;
  type: "included" | "excluded" | "suggestion";
  /** Captured-set indices in emitted order. Absent means non-clickable:
   *  legacy `idx: null` markers, or replicate-aggregated means where one
   *  marker has no single captured point behind it. */
  capturedIdxOrder?: number[];
}

export interface BuiltPlot {
  traces: PlotTrace[];
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
  traceIndexToCurve: TraceTarget[];
}

export function buildDoseResponsePlot(
  curves: readonly CurveLike[],
  opts: BuildPlotOptions,
): BuiltPlot {
  const { showCI, showMarker, showPlateaus } = opts;
  const interactive = opts.interactive ?? false;
  const editMode = opts.editMode ?? false;

  const traces: PlotTrace[] = [];
  const traceIndexToCurve: TraceTarget[] = [];

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    const curveId = curve.id ?? String(i);
    const color = TRACE_COLORS[i % TRACE_COLORS.length];
    const group = `curve-${curveId}`;
    const typeLabel = curveTypeLabel(curve.curve_type);
    // Analysts identify compounds by registration id, not free-text name —
    // prefer it for trace labels and fall back only when it is absent.
    const compoundLabel = curve.label ?? curve.registration_number ?? curve.molecule_name ?? null;
    const label = compoundLabel ? `${compoundLabel} (${typeLabel})` : typeLabel;

    const captured = buildCapturedPoints(curve.raw_data, curve.excluded_points);
    const localExcluded =
      editMode && curveId === opts.editCurveId ? (opts.draftExcluded ?? NO_EXCLUSIONS) : NO_EXCLUSIONS;

    // Classify each captured point. A draft toggle wins over whatever the
    // server-persisted entry says, so the chemist's pending change shows in
    // the trace immediately.
    type Bucket = "included" | "suggestion" | "manualExcluded" | "autoExcluded";
    const classify = (cp: CapturedPoint): Bucket => {
      if (localExcluded.has(cp.capturedIdx)) return "manualExcluded";
      const e = cp.exclusionEntry;
      if (!e) return "included";
      const source =
        (e.source as string | undefined) ?? (e.reason === "auto_3sigma" ? "auto_3sigma" : "manual");
      const excluded = typeof e.excluded === "boolean" ? (e.excluded as boolean) : true;
      if (source === "auto_3sigma" && !excluded) return "suggestion";
      if (source === "auto_3sigma" && excluded) return "autoExcluded";
      if (excluded) return "manualExcluded";
      return "included";
    };

    const includedX: number[] = [];
    const includedY: number[] = [];
    const includedCapturedIdxOrder: number[] = [];
    const suggestionX: number[] = [];
    const suggestionY: number[] = [];
    const suggestionCapturedIdxOrder: number[] = [];
    const manualExcludedX: number[] = [];
    const manualExcludedY: number[] = [];
    const manualExcludedCapturedIdxOrder: number[] = [];
    const autoExcludedX: number[] = [];
    const autoExcludedY: number[] = [];

    for (const cp of captured) {
      switch (classify(cp)) {
        case "included":
          includedX.push(cp.concentration);
          includedY.push(cp.response);
          includedCapturedIdxOrder.push(cp.capturedIdx);
          break;
        case "suggestion":
          suggestionX.push(cp.concentration);
          suggestionY.push(cp.response);
          suggestionCapturedIdxOrder.push(cp.capturedIdx);
          break;
        case "manualExcluded":
          manualExcludedX.push(cp.concentration);
          manualExcludedY.push(cp.response);
          manualExcludedCapturedIdxOrder.push(cp.capturedIdx);
          break;
        case "autoExcluded":
          autoExcludedX.push(cp.concentration);
          autoExcludedY.push(cp.response);
          break;
      }
    }

    // Legacy `idx: null` entries have no toggleable capturedIdx: they ride
    // along in the X / diamond markers but stay non-interactive.
    const legacyAutoExcludedXY: Array<{ x: number; y: number }> = [];
    const legacyManualExcludedXY: Array<{ x: number; y: number }> = [];
    for (const e of readRecords(curve.excluded_points)) {
      if (typeof e.idx === "number") continue; // numeric idx → already captured
      const source =
        (e.source as string | null | undefined) ??
        (e.reason === "auto_3sigma" ? "auto_3sigma" : "manual");
      const conc = pickNum(e, "concentration", "x");
      const resp = pickNum(e, "response", "y");
      if (conc === undefined || resp === undefined) continue;
      if (source === "auto_3sigma") {
        legacyAutoExcludedXY.push({ x: conc, y: resp });
      } else {
        legacyManualExcludedXY.push({ x: conc, y: resp });
      }
    }
    for (const lp of legacyManualExcludedXY) {
      manualExcludedX.push(lp.x);
      manualExcludedY.push(lp.y);
      // No capturedIdxOrder entry — the click handler short-circuits once
      // pointIndex runs past the order array.
    }
    for (const lp of legacyAutoExcludedXY) {
      autoExcludedX.push(lp.x);
      autoExcludedY.push(lp.y);
    }

    // ── X axis range ────────────────────────────────────────────────────────
    // Drop NaN / non-positive values: log10 explodes on them and a degenerate
    // fit's `fitted_value` can be NaN or 0. Aggregate contributors fold in so
    // the range isn't truncated when a sibling run's intercept sits outside
    // the representative's own range.
    const capturedX = captured.map((p) => p.concentration);
    const finiteFitted = Number.isFinite(curve.fitted_value) && curve.fitted_value > 0;
    const additionalCurves = readAdditionalCurves(curve.additional_curves);
    const additionalXs: number[] = [];
    for (const ac of additionalCurves) {
      const acFitted = ac.fitted_value;
      if (typeof acFitted === "number" && Number.isFinite(acFitted) && acFitted > 0) {
        additionalXs.push(acFitted);
      }
      for (const pt of readRecords(ac.raw_data)) {
        const xv = pickNum(pt, "x", "concentration");
        if (xv !== undefined && xv > 0) additionalXs.push(xv);
      }
    }
    const allX = [
      ...capturedX,
      ...legacyAutoExcludedXY.map((p) => p.x),
      ...legacyManualExcludedXY.map((p) => p.x),
      ...(finiteFitted ? [curve.fitted_value] : []),
      ...additionalXs,
    ].filter((v) => Number.isFinite(v) && v > 0);
    let xMin: number;
    let xMax: number;
    if (allX.length > 0) {
      xMin = Math.max(Math.min(...allX) * X_AXIS_MIN_RATIO, X_AXIS_FLOOR);
      xMax = Math.max(...allX) * X_AXIS_MAX_RATIO;
    } else if (finiteFitted) {
      xMin = Math.max(curve.fitted_value * X_AXIS_FALLBACK_MIN_RATIO, X_AXIS_FLOOR);
      xMax = curve.fitted_value * X_AXIS_FALLBACK_MAX_RATIO;
    } else {
      // No usable scale — a generic µM-range default beats feeding NaN to a
      // log axis.
      xMin = 0.001;
      xMax = 1000;
    }

    const { meanX, meanY, sdY, replicateX, replicateY } = computeReplicateStats(
      includedX,
      includedY,
    );
    const hasReplicates = replicateX.length > 0;

    // Individual replicates, semi-transparent behind the means.
    if (hasReplicates) {
      traces.push({
        type: "scatter",
        mode: "markers",
        name: `${label} replicates`,
        legendgroup: group,
        x: replicateX,
        y: replicateY,
        marker: {
          color,
          size: PLOT_MARKER.REPLICATE_SIZE,
          symbol: "circle",
          opacity: PLOT_MARKER.REPLICATE_OPACITY,
        },
        showlegend: false,
        hoverinfo: "skip",
      });
    }

    // Included points — means with error bars when replicates exist.
    const displayX = hasReplicates ? meanX : includedX;
    const displayY = hasReplicates ? meanY : includedY;

    if (displayX.length > 0) {
      traceIndexToCurve[traces.length] = {
        curveId,
        type: "included",
        // Replicate means have no 1:1 captured point behind them, so they
        // stay non-clickable.
        capturedIdxOrder: hasReplicates ? undefined : includedCapturedIdxOrder,
      };
      traces.push({
        type: "scatter",
        mode: "markers",
        name: label,
        legendgroup: group,
        x: displayX,
        y: displayY,
        marker: {
          color,
          size: interactive ? PLOT_MARKER.POINT_SIZE_INTERACTIVE : PLOT_MARKER.POINT_SIZE_STATIC,
          symbol: "circle",
          line: interactive ? { color: "rgba(255,255,255,0.3)", width: 1 } : undefined,
        },
        ...(hasReplicates && {
          error_y: {
            type: "data",
            array: sdY,
            visible: true,
            color,
            thickness: 1.5,
            width: 4,
          },
        }),
        showlegend: true,
        hovertemplate: editMode
          ? "x: %{x:.4g}<br>y: %{y:.4g}<br><i>click to exclude</i><extra></extra>"
          : "x: %{x:.4g}<br>y: %{y:.4g}<extra></extra>",
      });
    }

    // Auto-3σ suggestions: points the fitter flagged but did NOT remove.
    // They stay in the fit until a chemist accepts them; the amber halo says
    // "the system suggests excluding this" without changing the sigmoid.
    if (suggestionX.length > 0) {
      traceIndexToCurve[traces.length] = {
        curveId,
        // Reuses the included click path so a toggle flips `excluded` on the
        // existing entry and preserves `source: auto_3sigma`.
        type: "suggestion",
        capturedIdxOrder: suggestionCapturedIdxOrder,
      };
      traces.push({
        type: "scatter",
        mode: "markers",
        name: `${label} (suggested 3σ)`,
        legendgroup: group,
        x: suggestionX,
        y: suggestionY,
        marker: {
          color: CHART_COLORS.warning,
          size: 14,
          symbol: "circle-open",
          line: { color: CHART_COLORS.warning, width: 2.5 },
        },
        showlegend: false,
        hovertemplate: editMode
          ? "x: %{x:.4g}<br>y: %{y:.4g}<br><i>Suggested 3σ outlier — click to exclude</i><extra></extra>"
          : "x: %{x:.4g}<br>y: %{y:.4g}<br><i>Suggested 3σ outlier</i><extra></extra>",
      });
    }

    // Manually excluded points (x marker).
    if (manualExcludedX.length > 0) {
      traceIndexToCurve[traces.length] = {
        curveId,
        type: "excluded",
        capturedIdxOrder: manualExcludedCapturedIdxOrder,
      };
      traces.push({
        type: "scatter",
        mode: "markers",
        name: `${label} (excluded)`,
        legendgroup: group,
        x: manualExcludedX,
        y: manualExcludedY,
        marker: {
          color,
          size: PLOT_MARKER.EXCLUDED_SIZE,
          symbol: "x",
          opacity: PLOT_MARKER.MANUAL_EXCLUDED_OPACITY,
        },
        showlegend: false,
        hovertemplate: editMode
          ? "x: %{x:.4g}<br>y: %{y:.4g}<br><i>click to include</i><extra></extra>"
          : "x: %{x:.4g}<br>y: %{y:.4g}<extra></extra>",
      });
    }

    // Auto-excluded points (diamond marker, 3σ outliers).
    if (autoExcludedX.length > 0) {
      traces.push({
        type: "scatter",
        mode: "markers",
        name: `${label} (auto-excluded)`,
        legendgroup: group,
        x: autoExcludedX,
        y: autoExcludedY,
        marker: {
          color,
          size: PLOT_MARKER.EXCLUDED_SIZE,
          symbol: "diamond",
          opacity: PLOT_MARKER.AUTO_EXCLUDED_OPACITY,
        },
        showlegend: false,
        hovertemplate:
          "x: %{x:.4g}<br>y: %{y:.4g}<br><i>Auto-excluded (3σ outlier)</i><extra></extra>",
      });
    }

    // Fitted 4PL sigmoid (non-clickable). Skipped for inactive / failed fits —
    // there is no meaningful sigmoid, only data points.
    const skipFitLine = isDegenerateFit(curve);
    if (!skipFitLine) {
      const { x: lineX, y: lineY } = generate4PLCurve(curve, xMin, xMax);
      traces.push({
        type: "scatter",
        mode: "lines",
        name: `${label} fit`,
        legendgroup: group,
        x: lineX,
        y: lineY,
        line: { color, width: 2 },
        showlegend: includedX.length === 0,
        hoverinfo: "skip",
      });
    }

    // 95% CI band — shaded between the CI-low and CI-high sigmoids.
    if (
      !skipFitLine &&
      showCI &&
      curve.confidence_interval_low != null &&
      curve.confidence_interval_high != null
    ) {
      const ciLowCurve = { ...curve, fitted_value: curve.confidence_interval_low };
      const ciHighCurve = { ...curve, fitted_value: curve.confidence_interval_high };
      const { x: ciX, y: ciLowY } = generate4PLCurve(ciLowCurve, xMin, xMax);
      const { y: ciHighY } = generate4PLCurve(ciHighCurve, xMin, xMax);

      traces.push({
        type: "scatter",
        mode: "lines",
        x: ciX,
        y: ciHighY,
        line: { width: 0 },
        legendgroup: group,
        showlegend: false,
        hoverinfo: "skip",
      });
      traces.push({
        type: "scatter",
        mode: "lines",
        x: ciX,
        y: ciLowY,
        line: { width: 0 },
        fill: "tonexty",
        fillcolor: `${color}15`,
        legendgroup: group,
        showlegend: false,
        hoverinfo: "skip",
      });
    }

    // Aggregate-mode overlay: one muted dashed sigmoid per contributing run so
    // the chemist can see whether the runs agree. Same color as the primary so
    // the family reads as one cluster. Inactive siblings are skipped — a
    // sigmoid for a curve with no real response misleads.
    for (const ac of additionalCurves) {
      if (ac.curve_class === "inactive") continue;
      if (
        typeof ac.fitted_value !== "number" ||
        typeof ac.top !== "number" ||
        typeof ac.bottom !== "number" ||
        typeof ac.hill_slope !== "number" ||
        !Number.isFinite(ac.fitted_value) ||
        ac.fitted_value <= 0
      ) {
        continue;
      }
      const { x: ovX, y: ovY } = generate4PLPoints(
        {
          top: ac.top,
          bottom: ac.bottom,
          fitted_value: ac.fitted_value,
          hill_slope: ac.hill_slope,
        },
        xMin,
        xMax,
      );
      const runLabel = ac.run_date ? `Run ${ac.run_date}` : "Contributing run";
      traces.push({
        type: "scatter",
        mode: "lines",
        name: runLabel,
        legendgroup: group,
        x: ovX,
        y: ovY,
        line: { color, width: 1.5, dash: "dot" },
        opacity: 0.35,
        showlegend: false,
        hovertemplate: `${runLabel}<br>fitted_value=${ac.fitted_value.toPrecision(3)}<extra></extra>`,
      });
    }

    // Preview-fit overlay (edit mode): the "after" sigmoid for the pending
    // exclusions, dashed, over the committed fit so the shift is visible
    // before anything is saved.
    if (
      opts.previewFit &&
      curveId === opts.editCurveId &&
      Number.isFinite(opts.previewFit.fitted_value) &&
      opts.previewFit.fitted_value > 0
    ) {
      const { x: pvX, y: pvY } = generate4PLPoints(opts.previewFit, xMin, xMax);
      traces.push({
        type: "scatter",
        mode: "lines",
        name: "Preview fit",
        legendgroup: group,
        x: pvX,
        y: pvY,
        line: { color: CHART_COLORS.success, width: 2, dash: "dash" },
        opacity: 0.85,
        showlegend: true,
        hovertemplate: `Preview fit<br>fitted_value=${opts.previewFit.fitted_value.toPrecision(3)}<extra></extra>`,
      });
    }
  }

  // ── Overlay shapes + annotations ──────────────────────────────────────────
  // A second pass, after every curve's traces, so the marker traces it adds
  // land at the end and can't shift the clickable trace indices above.
  const shapes: PlotShape[] = [];
  const annotations: PlotAnnotation[] = [];
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    const color = TRACE_COLORS[i % TRACE_COLORS.length];
    const midY = (curve.top + curve.bottom) / 2;
    const ec50 = curve.fitted_value;
    const unitLabel = curve.fitted_unit ? ` ${curve.fitted_unit}` : "";
    const degenerate = isDegenerateFit(curve);
    const intercepts = readIntercepts(curve.intercept_values);

    // Aggregate cells carry their own marker at the cell's gmean / mean. The
    // representative's `fitted_value` points at the latest run's intercept,
    // not the aggregate, so every per-curve annotation is suppressed here and
    // the single amber marker below stands in.
    const isAggregateMode = curve.aggregate != null && Number.isFinite(curve.aggregate.marker_x);

    // Cross-hair: dotted lines + marker + label at (intercept, midpoint).
    // Suppressed for degenerate fits — the intercept isn't meaningful.
    if (showMarker && !degenerate && !isAggregateMode) {
      shapes.push({
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: midY,
        y1: midY,
        line: { color, width: 1, dash: "dot" },
        opacity: 0.4,
      });
      shapes.push({
        type: "line",
        xref: "x",
        x0: ec50,
        x1: ec50,
        yref: "paper",
        y0: 0,
        y1: 1,
        line: { color, width: 1, dash: "dot" },
        opacity: 0.4,
      });
      traces.push({
        type: "scatter",
        mode: "markers",
        x: [ec50],
        y: [midY],
        marker: {
          color: CHART_COLORS.warning,
          size: 10,
          line: { color: CHART_COLORS.error, width: 2 },
          symbol: "circle",
        },
        showlegend: false,
        hovertemplate: `${curveTypeLabel(curve.curve_type)} = ${ec50.toPrecision(3)}${unitLabel}<extra></extra>`,
      });
      annotations.push({
        x: Math.log10(ec50),
        y: midY,
        xref: "x",
        yref: "y",
        text: `<b>${ec50.toPrecision(3)}${unitLabel}</b>`,
        showarrow: true,
        arrowhead: 2,
        arrowsize: 0.8,
        arrowcolor: CHART_COLORS.error,
        ax: 0,
        ay: -35,
        font: { color: CHART_COLORS.error, size: 11 },
      });
    }

    // Extra intercepts (an IC90 beside the primary IC50). The first entry is
    // the primary, already drawn as the cross-hair. At-bound / non-finite
    // entries are skipped: the curve never reaches that response level, so a
    // line there would be a lie. A longer dash keeps the primary distinct.
    if (showMarker && !degenerate && !isAggregateMode && intercepts.length > 1) {
      for (const iv of intercepts.slice(1)) {
        if (iv.at_bound || !Number.isFinite(iv.value)) continue;
        // `spec.level` is a percentage (50 for IC50, 90 for IC90), so it needs
        // /100 to interpolate between bottom and top. Without the divide an
        // IC90 marker lands ~90× the curve range above bottom and Plotly's
        // autoscale stretches Y to 10k, flattening the sigmoid.
        const yLevel =
          iv.spec.basis === "relative_percent"
            ? curve.bottom + (iv.spec.level / 100) * (curve.top - curve.bottom)
            : iv.spec.level;
        const label = interceptLabel(iv.spec);
        shapes.push({
          type: "line",
          xref: "x",
          x0: iv.value,
          x1: iv.value,
          yref: "paper",
          y0: 0,
          y1: 1,
          line: { color, width: 1, dash: "longdash" },
          opacity: 0.45,
        });
        traces.push({
          type: "scatter",
          mode: "markers",
          x: [iv.value],
          y: [yLevel],
          marker: {
            color,
            size: 8,
            line: { color: CHART_AXIS.tick, width: 1 },
            symbol: "diamond",
          },
          showlegend: false,
          hovertemplate: `${label} = ${iv.value.toPrecision(3)}${unitLabel}<extra></extra>`,
        });
        annotations.push({
          x: Math.log10(iv.value),
          y: yLevel,
          xref: "x",
          yref: "y",
          text: `<b>${label}</b>`,
          showarrow: false,
          font: { color, size: 10 },
          xanchor: "left",
          yanchor: "bottom",
          xshift: 4,
          yshift: 2,
        });
      }
    }

    // Aggregate marker: one solid amber line at the cell's aggregated value,
    // replacing the per-curve cross-hair.
    if (isAggregateMode && showMarker && curve.aggregate) {
      const aggMx = curve.aggregate.marker_x;
      const aggLabel = curve.aggregate.marker_label;
      shapes.push({
        type: "line",
        xref: "x",
        x0: aggMx,
        x1: aggMx,
        yref: "paper",
        y0: 0,
        y1: 1,
        line: { color: CHART_COLORS.warning, width: 1.5 },
        opacity: 0.95,
      });
      annotations.push({
        x: Math.log10(aggMx),
        y: midY,
        xref: "x",
        yref: "y",
        text: `<b>${aggLabel} = ${aggMx.toPrecision(3)}${unitLabel}</b>`,
        showarrow: true,
        arrowhead: 2,
        arrowsize: 0.8,
        arrowcolor: CHART_COLORS.warning,
        ax: 0,
        ay: -35,
        font: { color: CHART_COLORS.warning, size: 11 },
      });
    }

    // Plateau lines: horizontal dashed at the top and bottom asymptotes.
    if (showPlateaus && !degenerate) {
      shapes.push({
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: curve.top,
        y1: curve.top,
        line: { color, width: 1, dash: "dash" },
        opacity: 0.3,
      });
      shapes.push({
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        yref: "y",
        y0: curve.bottom,
        y1: curve.bottom,
        line: { color, width: 1, dash: "dash" },
        opacity: 0.3,
      });
      annotations.push({
        x: 1,
        y: curve.top,
        xref: "paper",
        yref: "y",
        text: `Top: ${curve.top.toFixed(1)}%`,
        showarrow: false,
        font: { color, size: 9 },
        xanchor: "right",
      });
      annotations.push({
        x: 1,
        y: curve.bottom,
        xref: "paper",
        yref: "y",
        text: `Bottom: ${curve.bottom.toFixed(1)}%`,
        showarrow: false,
        font: { color, size: 9 },
        xanchor: "right",
      });
    }
  }

  const layout = {
    height: 350,
    autosize: true,
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: CHART_AXIS.tick },
    xaxis: {
      title: {
        text: curves[0]?.fitted_unit ? `Concentration (${curves[0].fitted_unit})` : "Concentration",
      },
      type: "log" as const,
      gridcolor: "rgba(113,113,122,0.2)",
      zerolinecolor: "rgba(113,113,122,0.3)",
    },
    yaxis: {
      title: { text: "Response (%)" },
      gridcolor: "rgba(113,113,122,0.2)",
      zerolinecolor: "rgba(113,113,122,0.3)",
    },
    legend: {
      orientation: "h" as const,
      y: -0.2,
      font: { color: CHART_AXIS.tick },
    },
    shapes,
    annotations,
    // Right margin gives the last X tick label ("100") room before the panel
    // edge — narrow side panels were clipping it.
    margin: { t: 20, b: 60, l: 60, r: 32 },
    clickmode: editMode ? "event" : undefined,
    dragmode: editMode ? false : "zoom",
  };

  const config = {
    displayModeBar: false,
    responsive: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d"] as string[],
  };

  return { traces, layout, config, traceIndexToCurve };
}
