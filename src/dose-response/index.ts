// Public surface of the dose-response visuals. Consumers import from
// "@structflo/components/dose-response" — never a deeper path.
//
// Two renderers, one picture each, both props-only: `DoseResponseFigure` for a
// fixed-size single curve (grid cell, thumbnail, sparkline) and
// `DoseResponseChartView` for the full chart with its toggles, export and
// summary cards. An app that edits curves wraps the view with its own chrome
// and drives it through `EditOverlay`; it does not re-implement the picture.
//
// Both take the host's Plotly component as `plot`, so this package depends on
// neither `next` nor `plotly.js`.

export { DoseResponseChartView } from "./chart-view";
export type { DoseResponseChartViewProps, EditOverlay } from "./chart-view";
export { DoseResponseSummaryCard } from "./summary-card";
export type { DoseResponseSummaryCardProps } from "./summary-card";
export { DoseResponseFigure } from "./figure";
export type { DoseResponseFigureProps, FigureSize } from "./figure";

// The picture as data — for a host that needs the traces themselves (an export
// pipeline, a snapshot test) rather than a rendered chart.
export { buildDoseResponsePlot } from "./build-plot";
export type {
  BuildPlotOptions,
  BuiltPlot,
  PlotAnnotation,
  PlotShape,
  PlotTrace,
  TraceTarget,
} from "./build-plot";

// Wire shapes. Map your payload into these; don't pass a generated DTO type.
export type {
  AdditionalCurve,
  AggregateMarker,
  CurveLike,
  CurvePoint,
  CurveSnapshot,
  InterceptSpecLike,
  InterceptValueLike,
  PlotComponent,
  PlotProps,
  ReadPoint,
} from "./types";

// Display vocabulary — shared so a column header and the chart headline beside
// it cannot disagree about what "EC90" is called.
export {
  CURVE_CLASS_LABELS,
  CURVE_TYPE_LABELS,
  curveTypeLabel,
  interceptKindLevelLabel,
  interceptLabel,
} from "./labels";

// The 4PL evaluator and the axis / marker constants behind the picture. Shared
// because anything that redraws a curve (a PNG export path, a canvas
// thumbnail) has to agree with the chart, and with the backend fitter.
export {
  CURVE_FIT_POINTS,
  PLOT_MARKER,
  X_AXIS_FALLBACK_MAX_RATIO,
  X_AXIS_FALLBACK_MIN_RATIO,
  X_AXIS_FLOOR,
  X_AXIS_MAX_RATIO,
  X_AXIS_MIN_RATIO,
  computeReplicateStats,
  evaluate4PL,
  generate4PLCurve,
  generate4PLPoints,
  isDegenerateFit,
  rSquaredColor,
} from "./math";
export type { FitParams } from "./math";

// The captured-point domain: the merged, concentration-sorted view of
// `raw_data + excluded_points` that the backend reads point indices against.
export { buildCapturedPoints, readIntercepts } from "./read";
export type { CapturedPoint } from "./read";
