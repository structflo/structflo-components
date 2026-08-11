"use client";

import type { ComponentType, ReactNode } from "react";

import { cn } from "../lib/cn";
import { ESSENTIALITY_STYLE, type EssentialityBucket, essentialityBucket } from "./essentiality";
import { type PositionedGene, type TrackGene, layoutNeighbors } from "./genome-track";
import { useMeasuredWidth } from "./use-measured-width";

const humanize = (b: string) => b.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Legend — the fitness-axis buckets shared with the essentiality call-scale, so
// the track and the summary read as one system.
// ---------------------------------------------------------------------------

const LEGEND_ENTRIES: { label: string; bucket: EssentialityBucket }[] = [
  { label: "Essential", bucket: "essential" },
  { label: "Growth-defect", bucket: "growth-defect" },
  { label: "Non-essential", bucket: "non-essential" },
  { label: "Growth-adv.", bucket: "growth-advantage" },
  { label: "Uncertain", bucket: "uncertain" },
];

function EssentialityLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] text-muted-foreground"
      aria-label="Essentiality legend"
    >
      {LEGEND_ENTRIES.map((e) => (
        <span key={e.label} className="inline-flex items-center gap-1">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-sm border",
              ESSENTIALITY_STYLE[e.bucket].bg,
              ESSENTIALITY_STYLE[e.bucket].border,
            )}
            aria-hidden
          />
          {e.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track geometry — fixed px (the SVG renders at the container's real width, 1:1).
// ---------------------------------------------------------------------------

const TRACK_H = 60;
const ARROW_Y = 18;
const ARROW_H = 22;
const BASELINE_Y = ARROW_Y + ARROW_H + 2;
const EDGE_PAD = 6;
const FONT_GENE = 11;

/** Strand-aware arrow (pentagon) points for a positioned gene. */
function arrowPoints(g: PositionedGene): string {
  const { x, w } = g;
  const ar = Math.min(8, w * 0.4);
  const y0 = ARROW_Y;
  const y1 = ARROW_Y + ARROW_H;
  const my = ARROW_Y + ARROW_H / 2;
  return g.strand === "-"
    ? `${x + w},${y0} ${x + ar},${y0} ${x},${my} ${x + ar},${y1} ${x + w},${y1}`
    : `${x},${y0} ${x + w - ar},${y0} ${x + w},${my} ${x + w - ar},${y1} ${x},${y1}`;
}

/** Framework seam: each app passes its own `next/link`; the lib defaults to a plain `<a>`. */
type LinkLike = ComponentType<{
  href: string;
  "aria-label"?: string;
  children: ReactNode;
}>;

function TrackArrow({
  g,
  hrefFor,
  LinkComponent,
}: {
  g: PositionedGene;
  hrefFor: (id: string) => string;
  LinkComponent: LinkLike;
}) {
  const bucket = essentialityBucket(g.essentiality);
  const style = ESSENTIALITY_STYLE[bucket];
  const points = arrowPoints(g);
  const showLabel = g.w >= 26 || g.isCurrent;

  const shape = (
    <>
      <polygon points={points} className={style.fill} fillOpacity={0.75} />
      {g.isCurrent && (
        <polygon points={points} className="fill-none stroke-primary" strokeWidth={2} />
      )}
      {showLabel && (
        <text
          x={g.x + g.w / 2}
          y={ARROW_Y - 5}
          textAnchor="middle"
          fontSize={FONT_GENE}
          className={g.isCurrent ? "fill-foreground font-semibold" : "fill-muted-foreground"}
        >
          {g.name}
        </text>
      )}
      <title>{`${g.name}${g.strand ? ` (${g.strand})` : ""} · ${humanize(bucket)}`}</title>
    </>
  );

  if (g.isCurrent) {
    // Not a link; the ring + bold label + <title> convey "this gene".
    return <g>{shape}</g>;
  }
  return (
    <LinkComponent href={hrefFor(g.id)} aria-label={g.name}>
      {shape}
    </LinkComponent>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/** Minimal shape this needs — decoupled from any app's generated DTO. */
export interface GenomicNeighborLike {
  id: string;
  display_label: string;
  start: number | null;
  end: number | null;
  strand: string | null;
  essentiality: string | null;
}

/**
 * Genome-neighborhood track: gene arrows laid out proportionally to real
 * genomic coordinates around `centerId`, with the essentiality legend below
 * so the track's colors can't drift from the call scale. No Card, no data
 * hook — the app fetches neighbors and passes them in. Renders nothing with
 * fewer than 2 coordinate-bearing neighbors.
 */
export function GenomicContext({
  centerId,
  neighbors,
  hrefFor = (id) => `/genes/${id}`,
  LinkComponent = "a" as unknown as LinkLike,
}: {
  centerId: string;
  neighbors: GenomicNeighborLike[];
  hrefFor?: (id: string) => string;
  LinkComponent?: LinkLike;
}) {
  const [ref, width] = useMeasuredWidth<HTMLElement>();

  const genes: TrackGene[] = neighbors
    .filter((n) => n.start != null && n.end != null)
    .map((n) => ({
      id: n.id,
      name: n.display_label,
      strand: n.strand ?? null,
      essentiality: n.essentiality ?? null,
      start: n.start as number,
      end: n.end as number,
      isCurrent: n.id === centerId,
    }))
    .sort((a, b) => a.start - b.start);

  if (genes.length < 2) return null;

  const positioned = layoutNeighbors(genes, Math.max(10, width - EDGE_PAD * 2)).map((g) => ({
    ...g,
    x: g.x + EDGE_PAD,
  }));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Genomic neighborhood
      </span>
      <figure ref={ref} className="m-0 w-full" aria-label="Genomic neighborhood track">
        {width > 0 && (
          <svg
            className="font-sans"
            viewBox={`0 0 ${width} ${TRACK_H}`}
            width="100%"
            height={TRACK_H}
          >
            <title>Genomic neighborhood track</title>
            <line
              x1={EDGE_PAD}
              y1={BASELINE_Y}
              x2={width - EDGE_PAD}
              y2={BASELINE_Y}
              className="stroke-border"
              strokeWidth={1}
            />
            {positioned.map((g) => (
              <TrackArrow key={g.id} g={g} hrefFor={hrefFor} LinkComponent={LinkComponent} />
            ))}
          </svg>
        )}
      </figure>
      <EssentialityLegend />
    </div>
  );
}
