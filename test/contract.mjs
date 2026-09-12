// Contract check for @structflo/components. Mirrors daikon-design-tokens'
// contract test: it must fail the build if the public surface breaks, so a
// broken subpath or a dropped export can never be published.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const errors = [];

// 1. Every path in the exports map resolves to a real file on disk.
for (const [sub, target] of Object.entries(pkg.exports)) {
  if (!existsSync(resolve(root, target))) errors.push(`exports "${sub}" -> missing ${target}`);
}

// 2. Each public surface actually re-exports the names consumers import.
// Anything a consumer imports belongs here — these lists are what stop a
// rename or a tidy-up from silently breaking an app that does not live in
// this repo.
const required = {
  "src/target-biology/index.ts": [
    // charts
    "EssentialityCallScale",
    "VulnerabilityPanel",
    "ResistanceLollipop",
    "GenomicContext",
    // record shapes
    "EssentialityLike",
    "VulnerabilityLike",
    "MutationLike",
    "GenomicNeighborLike",
    // fitness-axis vocabulary, shared so a legend cannot drift from a scale
    "essentialityBucket",
    "ESSENTIALITY_STYLE",
    // the summaries behind the two headline charts — daikon's gene Overview states these
    // above the charts themselves, so they have to stay reachable
    "essentialityConsensus",
    "vulnerabilitySummary",
    "buildForestRows",
    "EssentialityConsensus",
    "VulnerabilitySummary",
    "ForestRow",
  ],
  "src/dose-response/index.ts": [
    // renderers
    "DoseResponseChartView",
    "DoseResponseSummaryCard",
    "DoseResponseFigure",
    // the picture as data, for an export path or a snapshot test
    "buildDoseResponsePlot",
    "buildCapturedPoints",
    // record shapes
    "CurveLike",
    "CurveSnapshot",
    "CurvePoint",
    "AdditionalCurve",
    "AggregateMarker",
    "InterceptValueLike",
    // Plotly injection — the package depends on neither next nor plotly.js,
    // so every consumer passes its own client-only component in
    "PlotComponent",
    "PlotProps",
    // an editing host drives the read-only view through this
    "EditOverlay",
    // display vocabulary, shared so a column header and the chart headline
    // beside it cannot disagree
    "interceptLabel",
    "CURVE_TYPE_LABELS",
    "CURVE_CLASS_LABELS",
    // the 4PL evaluator + axis constants: anything that redraws a curve has
    // to agree with the chart, and with the backend fitter
    "generate4PLPoints",
    "evaluate4PL",
    "isDegenerateFit",
    "PLOT_MARKER",
  ],
};

let count = 0;
for (const [indexPath, names] of Object.entries(required)) {
  if (!existsSync(resolve(root, indexPath))) {
    errors.push(`missing ${indexPath}`);
    continue;
  }
  const index = readFileSync(resolve(root, indexPath), "utf8");
  for (const name of names) {
    if (!index.includes(name)) errors.push(`${indexPath} does not export ${name}`);
  }
  count += names.length;
}

if (errors.length) {
  console.error("contract FAILED:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`contract OK: ${Object.keys(pkg.exports).length} subpath(s), ${count} exports present`);
