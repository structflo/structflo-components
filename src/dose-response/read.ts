/**
 * Narrowing readers — the one place that knows a curve can arrive in more
 * than one wire shape.
 *
 * Consumers hand us a backend DTO or a JSONB `curve_snapshot`; both carry the
 * same numbers under different keys (`concentration`/`response` vs `x`/`y`)
 * and with different strictness. Narrowing here, defensively, is what lets
 * `CurveLike` stay loose and lets every surface skip the adapter it used to
 * need.
 */

import type { AdditionalCurve, InterceptValueLike } from "./types";

/** Records only — a malformed row is dropped, never thrown on. */
export function readRecords(list: readonly unknown[] | null | undefined): Record<string, unknown>[] {
  if (!list) return [];
  const out: Record<string, unknown>[] = [];
  for (const item of list) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      out.push(item as Record<string, unknown>);
    }
  }
  return out;
}

/** A finite number from one of two field names; anything else → undefined. */
export function pickNum(obj: Record<string, unknown>, a: string, b?: string): number | undefined {
  const v = obj[a] ?? (b ? obj[b] : undefined);
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// ─── Captured-point domain ───────────────────────────────────────────────────
// The backend's `build_points_with_exclusions` merges `raw_data +
// excluded_points`, sorts by concentration, then reads the client's
// `excluded_indices` as positions IN THAT MERGED SORTED LIST. The fitter, in
// turn, writes `raw_data = active-only` (excluded points move out of raw_data
// and into excluded_points). So after any save with manual exclusions
// `raw_data` is SHORTER than the captured set, and "position in raw_data"
// silently stops matching the backend's domain — click handling would then
// mutate the wrong point. `capturedIdx` is that shared domain.

/** A point in the merged + concentration-sorted captured set. */
export interface CapturedPoint {
  concentration: number;
  response: number;
  /** Position in the merged + sorted captured set — the value the backend
   *  consumes as part of `excluded_indices`. */
  capturedIdx: number;
  /** True while the point still lives in `raw_data` (in the active fit set
   *  as of the last save); false when it lives only in `excluded_points`. */
  isInRawData: boolean;
  /** The originating `excluded_points` entry, when there is one, so the
   *  trace builder can classify it (manual / auto_3sigma / suggestion). */
  exclusionEntry: Record<string, unknown> | null;
}

/**
 * Build the merged + concentration-sorted captured set — the client's mirror
 * of the backend's `build_points_with_exclusions`.
 *
 * Legacy `excluded_points` entries (`idx: null` + coords only) are NOT
 * included: they have no toggleable idx, so they render through a separate
 * read-only bucket. Pre-041 entries with an `idx` but no coords resolve their
 * coords from `raw_data[idx]`.
 */
export function buildCapturedPoints(
  rawData: readonly unknown[] | null | undefined,
  excludedPoints: readonly unknown[] | null | undefined,
): CapturedPoint[] {
  type Pending = {
    concentration: number;
    response: number;
    isInRawData: boolean;
    exclusionEntry: Record<string, unknown> | null;
    /** Position in the input raw_data array — only used to resolve
     *  numeric-idx excluded entries that lack coords (pre-041 wire). */
    rawIdx: number | null;
  };
  const pending: Pending[] = [];

  // 1. Every raw_data point goes in.
  const rd = readRecords(rawData);
  for (let i = 0; i < rd.length; i++) {
    const pt = rd[i];
    const conc = pickNum(pt, "concentration", "x");
    const resp = pickNum(pt, "response", "y");
    if (conc === undefined || resp === undefined) continue;
    pending.push({
      concentration: conc,
      response: resp,
      isInRawData: true,
      exclusionEntry: null,
      rawIdx: i,
    });
  }

  // 2. excluded_points entries — three shapes:
  //    a. {idx, concentration, response} — post-041, coords on the entry. If
  //       a raw_data point at that idx already represents it (pre-save edit
  //       state), attach rather than duplicate.
  //    b. {idx, concentration: null, response: null} — pre-041; resolve coords
  //       via rawData[idx] and attach to that row.
  //    c. {idx: null, concentration, response} — legacy backfill. Skipped:
  //       not part of the captured idx domain, rendered read-only elsewhere.
  for (const entry of readRecords(excludedPoints)) {
    const idx = entry.idx as number | null | undefined;
    const conc = pickNum(entry, "concentration", "x");
    const resp = pickNum(entry, "response", "y");

    if (typeof idx !== "number") continue;

    if (conc !== undefined && resp !== undefined) {
      const overlap = pending.find(
        (p) => p.isInRawData && p.rawIdx === idx && Math.abs(p.concentration - conc) < 1e-12,
      );
      if (overlap) {
        overlap.exclusionEntry = entry;
        continue;
      }
      pending.push({
        concentration: conc,
        response: resp,
        isInRawData: false,
        exclusionEntry: entry,
        rawIdx: null,
      });
      continue;
    }

    const match = pending.find((p) => p.isInRawData && p.rawIdx === idx);
    if (match) match.exclusionEntry = entry;
    // An out-of-bounds idx with no coords is unrecoverable — drop it quietly.
  }

  // 3. Concentration ascending — the backend's ordering, exactly.
  pending.sort((a, b) => a.concentration - b.concentration);

  return pending.map((p, capturedIdx) => ({
    concentration: p.concentration,
    response: p.response,
    capturedIdx,
    isInRawData: p.isInRawData,
    exclusionEntry: p.exclusionEntry,
  }));
}

// ─── Intercepts ──────────────────────────────────────────────────────────────

/**
 * Narrow `intercept_values` from either wire shape. A row without a numeric
 * `spec.level` / `value` is dropped — a chip reading "undefined" is worse
 * than a missing chip.
 */
export function readIntercepts(
  list: readonly unknown[] | null | undefined,
): InterceptValueLike[] {
  const out: InterceptValueLike[] = [];
  for (const row of readRecords(list)) {
    const spec = row.spec;
    if (spec === null || typeof spec !== "object") continue;
    const s = spec as Record<string, unknown>;
    const level = pickNum(s, "level");
    const value = row.value;
    if (typeof s.kind !== "string" || level === undefined) continue;
    if (typeof value !== "number") continue;
    out.push({
      spec: {
        kind: s.kind,
        level,
        basis: typeof s.basis === "string" ? s.basis : null,
        label: typeof s.label === "string" ? s.label : null,
      },
      value,
      confidence_interval_low: pickNum(row, "confidence_interval_low") ?? null,
      confidence_interval_high: pickNum(row, "confidence_interval_high") ?? null,
      at_bound: row.at_bound === true,
    });
  }
  return out;
}

// ─── Additional curves ───────────────────────────────────────────────────────

/** Narrow `additional_curves` rows. Fit fields stay optional: the axis-range
 *  pass wants every X it can find (inactive contributors included), while the
 *  overlay pass requires a complete, non-degenerate fit. */
export function readAdditionalCurves(
  list: readonly unknown[] | null | undefined,
): Array<Partial<AdditionalCurve> & { raw_data?: readonly unknown[] | null }> {
  return readRecords(list) as Array<
    Partial<AdditionalCurve> & { raw_data?: readonly unknown[] | null }
  >;
}
