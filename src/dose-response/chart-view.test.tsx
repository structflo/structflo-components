import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoseResponseChartView } from "./chart-view";
import type { CurveLike, PlotProps } from "./types";

// Capture what the chart hands Plotly instead of rendering it — the traces
// themselves are covered in build-plot.test.ts; this file is about the
// composition around them.
const plotCalls: PlotProps[] = [];
const Plot = (props: PlotProps) => {
  plotCalls.push(props);
  return <div data-testid="plot" />;
};

const CURVE: CurveLike = {
  id: "c1",
  registration_number: "CC-057964",
  curve_type: "ic50",
  curve_class: "full",
  fitted_value: 1,
  fitted_unit: "uM",
  top: 100,
  bottom: 0,
  hill_slope: 1,
  r_squared: 0.987,
  raw_data: [
    { concentration: 0.1, response: 10 },
    { concentration: 1, response: 50 },
    { concentration: 10, response: 90 },
  ],
  excluded_points: [{ idx: 0, concentration: 0.1, response: 10, source: "manual", excluded: true }],
};

describe("<DoseResponseChartView />", () => {
  it("renders the toggles, the export actions, the plot and a summary card", () => {
    render(<DoseResponseChartView curves={[CURVE]} plot={Plot} />);

    // The marker toggle is named after the curve's intercept, not "Fitted".
    expect(screen.getByText("IC50 marker")).toBeInTheDocument();
    expect(screen.getByText("95% CI band")).toBeInTheDocument();
    expect(screen.getByText("Top/Bottom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PNG/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SVG/ })).toBeInTheDocument();
    expect(screen.getByTestId("plot")).toBeInTheDocument();

    // Summary card: headline intercept, fit parameters, and the point count —
    // which has to include the server-persisted exclusion, not just drafts.
    expect(screen.getByText("CC-057964")).toBeInTheDocument();
    expect(screen.getByText(/IC50 = 1 uM/)).toBeInTheDocument();
    expect(screen.getByText("R² = 0.987")).toBeInTheDocument();
    expect(screen.getByText(/3 of 4 points in fit/)).toBeInTheDocument();
    expect(screen.getByText(/1 excluded/)).toBeInTheDocument();
  });

  it("defaults the marker and CI toggles on, plateaus off", () => {
    render(<DoseResponseChartView curves={[CURVE]} plot={Plot} />);
    const checked = screen
      .getAllByRole("checkbox")
      .map((el) => el.getAttribute("aria-checked"));
    expect(checked).toEqual(["true", "true", "false"]);
  });

  it("leaves the class badge static until onClassify is supplied", () => {
    const { unmount } = render(<DoseResponseChartView curves={[CURVE]} plot={Plot} />);
    expect(screen.getByText("Full").tagName).toBe("SPAN");
    expect(screen.getByText("Full").className).not.toContain("cursor-pointer");
    unmount();

    render(<DoseResponseChartView curves={[CURVE]} plot={Plot} onClassify={vi.fn()} />);
    expect(screen.getByText(/Full/).className).toContain("cursor-pointer");
  });

  it("says so plainly when there are no curves", () => {
    render(<DoseResponseChartView curves={[]} plot={Plot} />);
    expect(screen.getByText("No dose-response curves available.")).toBeInTheDocument();
    expect(screen.queryByTestId("plot")).not.toBeInTheDocument();
  });

  describe("driven by an editing host", () => {
    const edit = {
      curveId: "c1",
      draftExcluded: new Set([1]),
      draftExcludedCount: 2,
    };

    it("swaps the toggles bar for the host's banner and wraps the plot", () => {
      render(
        <DoseResponseChartView
          curves={[CURVE]}
          plot={Plot}
          interactive
          edit={edit}
          barSlot={<div>Editing — 2 unsaved changes</div>}
          plotWrapper={(plot) => <div data-testid="side-by-side">{plot}</div>}
          footerSlot={<div>Fit constraints</div>}
        />,
      );

      expect(screen.getByText("Editing — 2 unsaved changes")).toBeInTheDocument();
      expect(screen.queryByText("95% CI band")).not.toBeInTheDocument();
      expect(screen.getByTestId("side-by-side")).toContainElement(screen.getByTestId("plot"));
      expect(screen.getByText("Fit constraints")).toBeInTheDocument();

      // While a draft is open it — not the sum of server and draft — is the
      // truth for the edited curve's count.
      expect(screen.getByText(/2 of 4 points in fit/)).toBeInTheDocument();
    });

    it("keeps the host's own controls inside the toggles bar when not editing", () => {
      render(
        <DoseResponseChartView
          curves={[CURVE]}
          plot={Plot}
          interactive
          controlsSlot={<button type="button">Edit Points</button>}
        />,
      );
      expect(screen.getByRole("button", { name: "Edit Points" })).toBeInTheDocument();
      expect(screen.getByText("95% CI band")).toBeInTheDocument();
    });

    it("only hands Plotly a click handler when the host wants point clicks", () => {
      plotCalls.length = 0;
      const { unmount } = render(
        <DoseResponseChartView curves={[CURVE]} plot={Plot} edit={edit} />,
      );
      expect(plotCalls.at(-1)?.onClick).toBeUndefined();
      unmount();

      const onPointClick = vi.fn();
      render(
        <DoseResponseChartView curves={[CURVE]} plot={Plot} edit={{ ...edit, onPointClick }} />,
      );
      const onClick = plotCalls.at(-1)?.onClick;
      expect(onClick).toBeDefined();

      // A click resolves through the clicked trace's captured-index order to
      // the index the backend reads exclusions against, not the position in
      // the trace. Here trace 0 holds the one in-fit point (10 uM, captured
      // index 2) because 0.1 is excluded on the server and 1 is in the draft.
      onClick?.({ points: [{ curveNumber: 0, pointIndex: 0 }] });
      expect(onPointClick).toHaveBeenCalledWith("c1", 2);

      // Trace 1 holds both excluded points; its second marker is the drafted
      // 1 uM point, captured index 1. Clicking it is how a chemist puts a
      // point back.
      onClick?.({ points: [{ curveNumber: 1, pointIndex: 1 }] });
      expect(onPointClick).toHaveBeenLastCalledWith("c1", 1);

      // A marker with no captured point behind it resolves to nothing.
      onPointClick.mockClear();
      onClick?.({ points: [{ curveNumber: 0, pointIndex: 7 }] });
      expect(onPointClick).not.toHaveBeenCalled();
    });
  });
});
