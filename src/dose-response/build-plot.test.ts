import { describe, expect, it } from "vitest";
import { buildDoseResponsePlot } from "./build-plot";
import type { CurveLike } from "./types";

/** A well-behaved 5-point curve with a fitted IC50 of 1 µM. */
const CURVE: CurveLike = {
  id: "c1",
  registration_number: "CC-057964",
  curve_type: "ic50",
  fitted_value: 1,
  fitted_unit: "uM",
  top: 100,
  bottom: 0,
  hill_slope: 1,
  r_squared: 0.99,
  raw_data: [
    { concentration: 0.01, response: 2 },
    { concentration: 0.1, response: 10 },
    { concentration: 1, response: 50 },
    { concentration: 10, response: 90 },
    { concentration: 100, response: 98 },
  ],
};

const OPTS = { showCI: true, showMarker: true, showPlateaus: false };

const markerTraces = (traces: Record<string, unknown>[]) =>
  traces.filter((t) => t.mode === "markers");
const lineTraces = (traces: Record<string, unknown>[]) => traces.filter((t) => t.mode === "lines");

describe("buildDoseResponsePlot", () => {
  it("draws points, a fit line and the intercept cross-hair", () => {
    const { traces, layout } = buildDoseResponsePlot([CURVE], OPTS);

    const points = markerTraces(traces).find((t) => t.name === "CC-057964 (IC50)");
    expect(points).toBeDefined();
    expect(points?.x).toEqual([0.01, 0.1, 1, 10, 100]);

    expect(lineTraces(traces).some((t) => t.name === "CC-057964 (IC50) fit")).toBe(true);

    // Cross-hair: a horizontal line at the midpoint, a vertical at the
    // intercept, plus the amber marker trace and its label.
    const shapes = layout.shapes as Record<string, unknown>[];
    expect(shapes).toHaveLength(2);
    expect(shapes.some((s) => s.y0 === 50 && s.xref === "paper")).toBe(true);
    expect(shapes.some((s) => s.x0 === 1 && s.yref === "paper")).toBe(true);
    expect((layout.annotations as unknown[]).length).toBe(1);
  });

  it("reads {x, y} snapshot points identically to {concentration, response}", () => {
    // This is what lets a campaign's frozen curve_snapshot go straight into
    // the chart — no placeholder-filled adapter in between.
    const snapshotShaped: CurveLike = {
      ...CURVE,
      raw_data: [
        { x: 0.01, y: 2 },
        { x: 0.1, y: 10 },
        { x: 1, y: 50 },
        { x: 10, y: 90 },
        { x: 100, y: 98 },
      ],
    };
    expect(buildDoseResponsePlot([snapshotShaped], OPTS)).toEqual(
      buildDoseResponsePlot([CURVE], OPTS),
    );
  });

  it("shades the CI band only when both bounds are present", () => {
    expect(lineTraces(buildDoseResponsePlot([CURVE], OPTS).traces).some((t) => t.fill === "tonexty"))
      .toBe(false);

    const withCI = { ...CURVE, confidence_interval_low: 0.5, confidence_interval_high: 2 };
    expect(
      lineTraces(buildDoseResponsePlot([withCI], OPTS).traces).some((t) => t.fill === "tonexty"),
    ).toBe(true);
    // ...and not when the toggle is off.
    expect(
      lineTraces(buildDoseResponsePlot([withCI], { ...OPTS, showCI: false }).traces).some(
        (t) => t.fill === "tonexty",
      ),
    ).toBe(false);
  });

  it("draws a second intercept from loose JSONB intercept_values", () => {
    const withIC90: CurveLike = {
      ...CURVE,
      intercept_values: [
        { spec: { kind: "ic", level: 50, basis: "relative_percent" }, value: 1 },
        { spec: { kind: "ic", level: 90, basis: "relative_percent" }, value: 9 },
      ] as unknown[],
    };
    const { traces, layout } = buildDoseResponsePlot([withIC90], OPTS);

    // IC90's marker sits at 90% of the way from bottom to top, not at 90.
    const diamond = markerTraces(traces).find(
      (t) => (t.marker as { symbol?: string }).symbol === "diamond",
    );
    expect(diamond?.y).toEqual([90]);
    expect((layout.shapes as Record<string, unknown>[]).some((s) => s.dash === "longdash")).toBe(
      false,
    );
    expect(
      (layout.shapes as Array<{ line?: { dash?: string } }>).some(
        (s) => s.line?.dash === "longdash",
      ),
    ).toBe(true);
    expect((layout.annotations as Array<{ text?: string }>).some((a) => a.text === "<b>IC90</b>")).toBe(
      true,
    );
  });

  it("moves a draft-excluded point out of the fit set and marks it with an x", () => {
    const { traces, traceIndexToCurve } = buildDoseResponsePlot([CURVE], {
      ...OPTS,
      editMode: true,
      editCurveId: "c1",
      draftExcluded: new Set([2]), // the 1 µM point, third by concentration
    });

    const included = markerTraces(traces).find((t) => t.name === "CC-057964 (IC50)");
    expect(included?.x).toEqual([0.01, 0.1, 10, 100]);

    const excluded = markerTraces(traces).find((t) => t.name === "CC-057964 (IC50) (excluded)");
    expect(excluded?.x).toEqual([1]);
    expect((excluded?.marker as { symbol?: string }).symbol).toBe("x");

    // The clickable traces carry captured-set indices, which is the domain
    // the backend reads point exclusions against.
    const targets = traceIndexToCurve.filter(Boolean);
    expect(targets.find((t) => t.type === "included")?.capturedIdxOrder).toEqual([0, 1, 3, 4]);
    expect(targets.find((t) => t.type === "excluded")?.capturedIdxOrder).toEqual([2]);
  });

  it("replaces the per-curve cross-hair with one aggregate marker", () => {
    const aggregate: CurveLike = {
      ...CURVE,
      aggregate: { marker_x: 3, marker_label: "gmean", unit: "uM" },
      additional_curves: [
        { fitted_value: 2, top: 100, bottom: 0, hill_slope: 1, run_date: "2026-06-05" },
        // An inactive contributor has no sigmoid worth drawing.
        {
          fitted_value: 5,
          top: 100,
          bottom: 0,
          hill_slope: 1,
          run_date: "2026-06-06",
          curve_class: "inactive",
        },
      ] as unknown[],
    };
    const { traces, layout } = buildDoseResponsePlot([aggregate], OPTS);

    expect(lineTraces(traces).filter((t) => String(t.name).startsWith("Run "))).toHaveLength(1);

    const shapes = layout.shapes as Array<{ x0?: unknown; line?: { width?: number } }>;
    expect(shapes).toHaveLength(1);
    expect(shapes[0].x0).toBe(3);
    expect(
      (layout.annotations as Array<{ text?: string }>)[0].text?.startsWith("<b>gmean = 3"),
    ).toBe(true);
  });

  it("skips the fit line for an inactive curve but keeps its points", () => {
    const inactive = { ...CURVE, curve_class: "inactive" };
    const { traces, layout } = buildDoseResponsePlot([inactive], OPTS);

    expect(lineTraces(traces)).toHaveLength(0);
    expect(markerTraces(traces)).toHaveLength(1);
    expect(layout.shapes).toEqual([]);
  });

  it("only enables click handling in edit mode", () => {
    expect(buildDoseResponsePlot([CURVE], OPTS).layout.dragmode).toBe("zoom");
    expect(buildDoseResponsePlot([CURVE], OPTS).layout.clickmode).toBeUndefined();

    const editing = buildDoseResponsePlot([CURVE], { ...OPTS, editMode: true, editCurveId: "c1" });
    expect(editing.layout.clickmode).toBe("event");
    expect(editing.layout.dragmode).toBe(false);
  });
});
