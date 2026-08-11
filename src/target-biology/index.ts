// Public surface of the target-biology visuals. Consumers import from
// "@structflo/components/target-biology" — never a deeper path.
export { EssentialityCallScale } from "./essentiality-call-scale";
export { VulnerabilityPanel } from "./vulnerability-panel";
export { ResistanceLollipop } from "./resistance-lollipop";
export { GenomicContext } from "./genomic-context";

// Domain helpers shared beyond the charts (prot-cellar's genomic-context view
// reuses the fitness-axis bucketing so its legend can't drift from the scale).
export { ESSENTIALITY_STYLE, essentialityBucket } from "./essentiality";
export type { EssentialityBucket, EssentialityLike } from "./essentiality";
export type { VulnerabilityLike } from "./vulnerability";
export type { MutationLike } from "./resistance";
export type { GenomicNeighborLike } from "./genomic-context";

// The summaries behind the two headline charts. daikon's gene Overview states the
// consensus call and the headline vulnerability *above* those charts, so it has to
// reach the same numbers by the same route: a second implementation would drift
// from the picture printed directly beneath it on the first rule change.
export { essentialityConsensus } from "./essentiality";
export type { EssentialityConsensus } from "./essentiality";
export { buildForestRows, vulnerabilitySummary } from "./vulnerability";
export type { ForestRow, VulnerabilitySummary } from "./vulnerability";
