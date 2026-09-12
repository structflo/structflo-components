"use client";

/**
 * The numbers beside the curve: headline intercept, secondary intercept chips,
 * fit parameters, points-in-fit, class, and fit-quality warnings.
 *
 * Read-only unless `onClassify` is supplied, which turns the class badge into
 * a picker. The count props are computed by the caller because only the caller
 * knows whether an unsaved draft is in play.
 */

import { useState } from "react";
import { cn } from "../lib/cn";
import { CURVE_CLASS_LABELS, curveTypeLabel, interceptLabel } from "./labels";
import { isDegenerateFit, rSquaredColor } from "./math";
import { readIntercepts } from "./read";
import type { CurveLike } from "./types";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "./ui";

const CURVE_CLASS_OPTIONS = ["full", "partial", "bell_shaped", "inactive"] as const;

/** Fit-quality warning codes → what a chemist should read. */
const FIT_WARNING_LABELS: Record<string, string> = {
  ec50_at_bound: "Hit dose-range bound — IC50 unreliable",
  ec50_outside_dose_range: "IC50 outside tested doses",
  low_r_squared: "Low R²",
};

export interface DoseResponseSummaryCardProps {
  curve: CurveLike;
  /** Points contributing to the fit right now (captured total, minus
   *  server-persisted exclusions, minus in-session draft exclusions). */
  inFitCount: number;
  /** Total points captured for this curve — the server's `raw_data` plus
   *  `excluded_points`. Stable across reloads and draft toggles. */
  capturedTotal: number;
  /** Persisted + draft exclusions combined; drives the "{N} excluded" note. */
  excludedCount: number;
  /** Supplying this makes the class badge a picker. Omit for read-only. */
  onClassify?: (curveId: string, curveClass: string) => void;
  isClassifying?: boolean;
}

export function DoseResponseSummaryCard({
  curve,
  inFitCount,
  capturedTotal,
  excludedCount,
  onClassify,
  isClassifying = false,
}: DoseResponseSummaryCardProps) {
  const [showClassify, setShowClassify] = useState(false);

  const warnings = curve.fit_quality_warnings ?? [];
  const isExtrapolated = warnings.includes("ec50_at_bound");
  const notFitted = isDegenerateFit(curve);
  const interceptValues = readIntercepts(curve.intercept_values);
  const unit = curve.fitted_unit ?? "";
  const title =
    curve.label ?? curve.registration_number ?? curve.molecule_name ?? curveTypeLabel(curve.curve_type);

  return (
    <Card className="py-4">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-mono">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 space-y-1">
        <p className="text-sm font-mono">
          {/* The protocol's own intercept label is the single source of truth;
              `curve_type` is descriptive only post-033 and ignores per-protocol
              relabels, so it is the fallback, not the headline. */}
          {interceptValues[0]?.spec
            ? interceptLabel(interceptValues[0].spec)
            : curveTypeLabel(curve.curve_type)}
          {" = "}
          {Number(curve.fitted_value.toPrecision(4))} {unit}
          {isExtrapolated && <span className="ml-1 text-amber-600 text-xs">(extrapolated)</span>}
        </p>
        {interceptValues.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground pt-0.5">
            {interceptValues.slice(1).map((iv, idx) => {
              const label = interceptLabel(iv.spec);
              if (iv.at_bound || !Number.isFinite(iv.value)) {
                return (
                  <span
                    key={idx}
                    className="rounded border px-1.5 py-0.5 text-amber-600"
                    title="Curve does not reach this response level"
                  >
                    {label} = at bound
                  </span>
                );
              }
              return (
                <span key={idx} className="rounded border px-1.5 py-0.5">
                  {label} = {Number(iv.value.toPrecision(4))} {unit}
                  {iv.confidence_interval_low != null && iv.confidence_interval_high != null && (
                    <span className="ml-1 opacity-70">
                      [{iv.confidence_interval_low.toPrecision(3)}–
                      {iv.confidence_interval_high.toPrecision(3)}]
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className={cn("font-medium", rSquaredColor(curve.r_squared ?? 0))}>
            R² = {(curve.r_squared ?? 0).toFixed(3)}
          </span>
          <span className="font-mono">Hill = {curve.hill_slope.toFixed(2)}</span>
          <span className="font-mono">Top = {curve.top.toFixed(1)}%</span>
          <span className="font-mono">Bottom = {curve.bottom.toFixed(1)}%</span>
          {curve.confidence_interval_low != null && curve.confidence_interval_high != null && (
            <span className="font-mono">
              CI: {curve.confidence_interval_low.toPrecision(3)}–
              {curve.confidence_interval_high.toPrecision(3)} {unit}
            </span>
          )}
          {capturedTotal > 0 && (
            <span className="text-muted-foreground">
              {inFitCount} of {capturedTotal} points in fit
              {excludedCount > 0 && (
                <span className="ml-1.5 opacity-70">· {excludedCount} excluded</span>
              )}
            </span>
          )}
          {curve.curve_class && !onClassify && (
            <Badge className="text-xs">
              {CURVE_CLASS_LABELS[curve.curve_class] ?? curve.curve_class}
            </Badge>
          )}
          {curve.curve_class && onClassify && (
            <div className="relative">
              <Badge
                className="text-xs cursor-pointer hover:bg-accent transition-colors"
                onClick={() => setShowClassify((v) => !v)}
              >
                {CURVE_CLASS_LABELS[curve.curve_class] ?? curve.curve_class}
                <span className="ml-1 opacity-60">▾</span>
              </Badge>
              {showClassify && (
                <div className="absolute left-0 top-full z-10 mt-1 w-36 rounded-md border bg-popover shadow-md">
                  {CURVE_CLASS_OPTIONS.map((cc) => (
                    <button
                      key={cc}
                      type="button"
                      disabled={isClassifying}
                      className={cn(
                        "flex w-full items-center px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                        curve.curve_class === cc && "font-medium text-primary",
                      )}
                      onClick={() => {
                        onClassify(curve.id ?? "", cc);
                        setShowClassify(false);
                      }}
                    >
                      {CURVE_CLASS_LABELS[cc]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {(warnings.length > 0 || notFitted) && (
          <div className="flex flex-wrap gap-1 pt-1">
            {notFitted && (
              <Badge
                className="text-xs border-muted-foreground/40 bg-muted text-muted-foreground"
                title="The fit produced degenerate parameters (inactive or unfit)."
              >
                Curve not fitted (inactive or degenerate)
              </Badge>
            )}
            {warnings.map((code) => (
              <Badge
                key={code}
                className="text-xs border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                title={code}
              >
                ⚠️ {FIT_WARNING_LABELS[code] ?? code}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
