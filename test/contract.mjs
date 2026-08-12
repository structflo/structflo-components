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

// 2. The public surface actually re-exports the names consumers import.
const index = readFileSync(resolve(root, "src/target-biology/index.ts"), "utf8");
// Anything a consumer imports belongs here — this list is what stops a rename or a
// tidy-up from silently breaking an app that does not live in this repo.
const required = [
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
];
for (const name of required) {
  if (!index.includes(name)) errors.push(`src/target-biology/index.ts does not export ${name}`);
}

if (errors.length) {
  console.error("contract FAILED:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(
  `contract OK: ${Object.keys(pkg.exports).length} subpath(s), ${required.length} exports present`,
);
