import type { TimeInterval } from "./types";

/**
 * Whether two half-open intervals [startMs, endMs) intersect.
 *
 * This is the primitive availability computation depends on (see
 * docs/ARCHITECTURE.md §5): a room is busy for a candidate slot if ANY
 * existing booking's interval overlaps it, not just exact slot matches —
 * which is what makes a partial-hour extension correctly block an adjacent
 * public start time. The full availability algorithm itself is not part of
 * the foundation phase; this is the tested building block for it.
 *
 * Back-to-back intervals (one ends exactly when the other starts) do NOT
 * overlap, matching the "no cleaning/reset buffer" requirement.
 */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}
