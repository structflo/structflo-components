"use client";

/**
 * The dose-response chart, whole: display toggles, PNG/SVG export, the plot,
 * and one summary card per curve.
 *
 * This is the only renderer. A read-only surface passes `curves` and a `plot`
 * component and gets the picture; an editing host (cellar's run page) drives
 * the same component through the slots and `edit` below, so there is no second
 * implementation to drift — which is exactly how a campaign's curve and its
 * source run's curve came to look different before this existed.
 *
 * Nothing here fetches, authorises or mutates. The editing host owns its
 * session, its mutations and its own chrome; this component owns the picture.
 */

import { type ReactNode, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { type BuildPlotOptions, type TraceTarget, buildDoseResponsePlot } from "./build-plot";
import { curveTypeLabel } from "./labels";
import type { FitParams } from "./math";
import { DoseResponseSummaryCard } from "./summary-card";
import type { CurveLike, PlotComponent } from "./types";
import { CheckboxLabel, DownloadIcon, GhostButton, ImageIcon } from "./ui";

/** Display state for an in-progress point-exclusion edit. Values, not
 *  behaviour: the host's session decides what these are. */
export interface EditOverlay {
  /** The curve the draft applies to — others render as committed. */
  curveId: string;
  /** Captured-set indices toggled out but not yet saved. */
  draftExcluded: ReadonlySet<number>;
  /** Exclusions in the draft, for the edit curve's "N of M points in fit".
   *  The draft is seeded from the server's `excluded_points`, so it — not the
   *  sum of both — is the truth for that curve. */
  draftExcludedCount: number;
  /** The "after" fit from a refit preview, overlaid dashed. */
  previewFit?: FitParams | null;
  /** A click on a point that maps to a captured-set index. */
  onPointClick?: (curveId: string, capturedIdx: number) => void;
}

export interface DoseResponseChartViewProps {
  curves: readonly CurveLike[];
  /** The host app's client-only Plotly component. */
  plot: PlotComponent;
  className?: string;
  /** Larger points with a light outline, for a surface where points are
   *  clickable. Read-only surfaces leave this off. */
  interactive?: boolean;
  /** Rendered at the start of the toggles bar (an Edit button, a history
   *  popover). */
  controlsSlot?: ReactNode;
  /** Rendered *instead of* the toggles bar — an editing host swaps in its own
   *  banner while a draft is open. */
  barSlot?: ReactNode;
  /** Wraps the plot block, for a host that needs to put something beside it
   *  (a resizable point-inventory panel). */
  plotWrapper?: (plot: ReactNode) => ReactNode;
  /** Rendered after the plot, before the summary cards (fit constraints, a
   *  save dialog). */
  footerSlot?: ReactNode;
  /** Present while a point-exclusion draft is open. */
  edit?: EditOverlay;
  /** Supplying this makes each card's class badge a picker. */
  onClassify?: (curveId: string, curveClass: string) => void;
  isClassifying?: boolean;
}

/** The subset of the runtime Plotly namespace on `window` that the export
 *  buttons need. `react-plotly.js` publishes it when its bundle loads. */
interface PlotlyGlobal {
  downloadImage?: (
    el: HTMLElement,
    opts: {
      format: "png" | "svg" | "jpeg" | "webp";
      width: number;
      height: number;
      filename: string;
    },
  ) => void;
}

function plotlyGlobal(): PlotlyGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Plotly?: PlotlyGlobal }).Plotly;
}

export function DoseResponseChartView({
  curves,
  plot: Plot,
  className,
  interactive = false,
  controlsSlot,
  barSlot,
  plotWrapper,
  footerSlot,
  edit,
  onClassify,
  isClassifying,
}: DoseResponseChartViewProps) {
  const [showCI, setShowCI] = useState(true);
  const [showMarker, setShowMarker] = useState(true);
  const [showPlateaus, setShowPlateaus] = useState(false);
  const plotContainerRef = useRef<HTMLDivElement>(null);

  const options: BuildPlotOptions = {
    showCI,
    showMarker,
    showPlateaus,
    interactive,
    editMode: edit != null,
    editCurveId: edit?.curveId ?? null,
    draftExcluded: edit?.draftExcluded,
    previewFit: edit?.previewFit ?? null,
  };

  const { traces, layout, config, traceIndexToCurve } = useMemo(
    () => buildDoseResponsePlot(curves, options),
    // biome-ignore lint/correctness/useExhaustiveDependencies: `options` is
    // rebuilt every render from exactly these values.
    [
      curves,
      showCI,
      showMarker,
      showPlateaus,
      interactive,
      edit?.curveId,
      edit?.draftExcluded,
      edit?.previewFit,
      edit == null,
    ],
  );

  if (curves.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12 text-sm text-muted-foreground">
        No dose-response curves available.
      </div>
    );
  }

  const exportImage = (format: "png" | "svg") => {
    const plotEl = plotContainerRef.current?.querySelector(".js-plotly-plot") as HTMLElement | null;
    if (!plotEl) return;
    plotlyGlobal()?.downloadImage?.(plotEl, {
      format,
      width: 1200,
      height: 600,
      filename: "dose-response",
    });
  };

  const plotBlock = (
    <div ref={plotContainerRef} className="min-w-0 overflow-hidden h-full">
      <Plot
        data={traces}
        layout={layout}
        config={config}
        style={{ width: "100%" }}
        useResizeHandler
        onClick={
          edit?.onPointClick
            ? (event) => handlePointClick(event, traceIndexToCurve, edit)
            : undefined
        }
      />
    </div>
  );

  return (
    <div className={cn("space-y-4", className)}>
      {barSlot ?? (
        <div className="flex items-center gap-4 flex-wrap">
          {controlsSlot}
          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
            <CheckboxLabel checked={showMarker} onCheckedChange={setShowMarker}>
              {curveTypeLabel(curves[0]?.curve_type)} marker
            </CheckboxLabel>
            <CheckboxLabel checked={showCI} onCheckedChange={setShowCI}>
              95% CI band
            </CheckboxLabel>
            <CheckboxLabel checked={showPlateaus} onCheckedChange={setShowPlateaus}>
              Top/Bottom
            </CheckboxLabel>
          </div>
          <div className="flex items-center gap-1.5 ml-4 border-l pl-4 border-border">
            <GhostButton className="h-7 px-2 text-xs" onClick={() => exportImage("png")}>
              <ImageIcon className="mr-1 h-3.5 w-3.5" />
              PNG
            </GhostButton>
            <GhostButton className="h-7 px-2 text-xs" onClick={() => exportImage("svg")}>
              <DownloadIcon className="mr-1 h-3.5 w-3.5" />
              SVG
            </GhostButton>
          </div>
        </div>
      )}

      {/* `min-w-0` lets the plot shrink inside a flex or grid parent (side
          panel, sheet) instead of forcing horizontal overflow. */}
      {plotWrapper ? plotWrapper(plotBlock) : plotBlock}

      {footerSlot}

      {/* One card per curve. A single curve spans the full width — stranding it
          in a third of a side panel wastes the space the search drawer has. */}
      <div
        className={cn(
          "grid grid-cols-1 gap-3",
          curves.length > 1 && "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {curves.map((curve, i) => {
          const curveId = curve.id ?? String(i);
          // The counter must reflect every exclusion source. On reload the
          // draft is empty but `excluded_points` still carries whatever the
          // server persisted — counting only the draft hid those behind
          // "10 of 10".
          const capturedTotal = (curve.raw_data?.length ?? 0) + (curve.excluded_points?.length ?? 0);
          const excludedCount =
            edit && curveId === edit.curveId
              ? edit.draftExcludedCount
              : (curve.excluded_points?.length ?? 0);
          return (
            <DoseResponseSummaryCard
              key={curveId}
              curve={curve}
              inFitCount={Math.max(0, capturedTotal - excludedCount)}
              capturedTotal={capturedTotal}
              excludedCount={excludedCount}
              onClassify={onClassify}
              isClassifying={isClassifying}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Map a Plotly click to a captured-set index and hand it to the host.
 *
 * Every clickable trace carries `capturedIdxOrder` built alongside its x/y
 * arrays, so a `pointIndex` resolves straight to the index the backend reads
 * as `excluded_indices`. Walking `raw_data` positions instead — as this once
 * did — diverges from the backend the moment a save shortens `raw_data`.
 */
function handlePointClick(
  // biome-ignore lint/suspicious/noExplicitAny: Plotly's click event is
  // untyped by the library; every field is read defensively below.
  event: any,
  traceIndexToCurve: TraceTarget[],
  edit: EditOverlay,
): void {
  const pt = event?.points?.[0];
  if (!pt) return;
  const target = traceIndexToCurve[pt.curveNumber as number];
  if (!target) return;
  // Only the curve under edit is mutable.
  if (target.curveId !== edit.curveId) return;
  // No order array → a legacy `idx: null` marker or a replicate mean; neither
  // maps to a single captured point.
  if (!target.capturedIdxOrder) return;
  const capturedIdx = target.capturedIdxOrder[pt.pointIndex as number];
  if (typeof capturedIdx !== "number") return;
  edit.onPointClick?.(target.curveId, capturedIdx);
}
