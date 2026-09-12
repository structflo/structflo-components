/**
 * The dose-response palette — hex, not Tailwind classes, because Plotly takes
 * colors as values.
 *
 * Moved verbatim from cellar's `shared/lib/chart-colors.ts`. The picture is a
 * contract: identical inputs must produce identical pixels in every app, so
 * these values are owned here and are not re-tuned per host. `CHART_AXIS.tick`
 * is mid-slate deliberately — it reads on a light and a dark ground.
 */

export const CHART_COLORS = {
  primary: "#3b6fb6",
  primaryLight: "#6b94cc",
  success: "#18974c",
  warning: "#f49e17",
  error: "#d41645",
  purple: "#734595",
  neutral: "#707372",
} as const;

export const CHART_AXIS = {
  grid: "#1e293b",
  tick: "#64748b",
  label: "#94a3b8",
  border: "#334155",
} as const;

/** Fit-quality colors for the figure's single-curve renderer. */
export const CURVE_QUALITY_COLORS: Record<string, string> = {
  full: "#18974c",
  partial: "#f49e17",
  bell_shaped: "#3b6fb6",
};
export const CURVE_DEFAULT_COLOR = "#707372";

/** Rotation palette for multi-curve comparison. The chart takes the first 8. */
export const GROUP_PALETTE = [
  "#3b6fb6",
  "#18974c",
  "#f49e17",
  "#d41645",
  "#734595",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#0d9488",
  "#7c3aed",
  "#c026d3",
] as const;
