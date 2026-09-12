/**
 * Display vocabulary for dose-response surfaces.
 *
 * Every label a chemist reads on a curve comes from here or from the
 * protocol's own intercept specs — no component carries the string literals
 * "EC50" / "IC90" itself. A column header and the chart headline beside it
 * have to agree, so both routes end at `interceptLabel`.
 */

import type { InterceptSpecLike } from "./types";

export const CURVE_TYPE_LABELS: Record<string, string> = {
  ic50: "IC50",
  ec50: "EC50",
  ki: "Ki",
  kd: "Kd",
  ld50: "LD50",
  td50: "TD50",
};

export const CURVE_CLASS_LABELS: Record<string, string> = {
  full: "Full",
  partial: "Partial",
  bell_shaped: "Bell-Shaped",
  inactive: "Inactive",
};

/** Canonical form for an intercept known only by (kind, level):
 *  `("ec", 50)` → `"EC50"`, `("ec", 12.5)` → `"EC12.5"`. */
export function interceptKindLevelLabel(kind: string, level: number): string {
  const lvl = level % 1 === 0 ? String(level) : level.toFixed(1);
  return `${kind.toUpperCase()}${lvl}`;
}

/** Display label for a protocol intercept spec: the protocol's own label
 *  when it set one, else `${KIND}${LEVEL}`. */
export function interceptLabel(spec: InterceptSpecLike): string {
  return spec.label ?? interceptKindLevelLabel(spec.kind, spec.level);
}

/** Headline curve-type label. Falls back to IC50 for a snapshot that never
 *  carried a curve_type — matches what the campaign adapter defaulted to. */
export function curveTypeLabel(curveType: string | null | undefined): string {
  if (!curveType) return CURVE_TYPE_LABELS.ic50;
  return CURVE_TYPE_LABELS[curveType] ?? curveType;
}
