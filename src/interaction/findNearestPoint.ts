import type { DataPoint } from '../config/types';
import type { ResolvedSeriesConfig } from '../config/OptionResolver';
import type { LinearScale } from '../utils/scales';

const DEFAULT_MAX_DISTANCE_PX = 20;

export type NearestPointMatch = Readonly<{
  seriesIndex: number;
  dataIndex: number;
  point: DataPoint;
  /** Euclidean distance in range units. */
  distance: number;
}>;

type TuplePoint = readonly [x: number, y: number];
type ObjectPoint = Readonly<{ x: number; y: number }>;

const lowerBoundTuple = (
  data: ReadonlyArray<TuplePoint>,
  xTarget: number,
): number => {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const x = data[mid][0];
    if (x < xTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const lowerBoundObject = (
  data: ReadonlyArray<ObjectPoint>,
  xTarget: number,
): number => {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const x = data[mid].x;
    if (x < xTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * Finds the nearest data point to the given cursor position across all series.
 *
 * Coordinate system contract:
 * - `x`/`y` MUST be in the same units as `xScale`/`yScale` **range**.
 * - If you pass **grid-local CSS pixels** (e.g. `payload.gridX` / `payload.gridY` from `createEventManager`),
 *   then `xScale.range()` / `yScale.range()` must also be in **CSS pixels**.
 * - If your scales are in **clip space** (e.g. \([-1, 1]\)), pass cursor coordinates in clip space too.
 *
 * DPR/WebGPU note:
 * - Pointer events are naturally in CSS pixels; WebGPU rendering often uses device pixels or clip space.
 *   This helper stays agnostic and only computes Euclidean distance in the provided **range-space**.
 *
 * Performance notes:
 * - Assumes each series is sorted by increasing x in domain space.
 * - Uses per-series lower-bound binary search on x, then expands outward while x-distance alone can still win.
 * - Uses squared distance comparisons and computes `sqrt` only for the final match.
 * - Skips non-finite points and any points whose scaled coordinates are NaN.
 */
export function findNearestPoint(
  series: ReadonlyArray<ResolvedSeriesConfig>,
  x: number,
  y: number,
  xScale: LinearScale,
  yScale: LinearScale,
  maxDistance: number = DEFAULT_MAX_DISTANCE_PX,
): NearestPointMatch | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const md = Number.isFinite(maxDistance)
    ? Math.max(0, maxDistance)
    : DEFAULT_MAX_DISTANCE_PX;
  const maxDistSq = md * md;

  const xTarget = xScale.invert(x);
  if (!Number.isFinite(xTarget)) return null;

  let bestSeriesIndex = -1;
  let bestDataIndex = -1;
  let bestPoint: DataPoint | null = null;
  let bestDistSq = maxDistSq;

  for (let s = 0; s < series.length; s++) {
    const data = series[s]?.data;
    const n = data.length;
    if (n === 0) continue;

    const first = data[0];
    const isTuple = Array.isArray(first);

    if (isTuple) {
      const tupleData = data as ReadonlyArray<TuplePoint>;
      const insertionIndex = lowerBoundTuple(tupleData, xTarget);

      let left = insertionIndex - 1;
      let right = insertionIndex;

      // Expand outward while x-distance alone could still beat bestDistSq.
      while (left >= 0 || right < n) {
        let dxSqLeft = Number.POSITIVE_INFINITY;
        if (left >= 0) {
          const px = tupleData[left][0];
          if (Number.isFinite(px)) {
            const sx = xScale.scale(px);
            if (Number.isFinite(sx)) {
              const dx = sx - x;
              dxSqLeft = dx * dx;
            }
          }
        }

        let dxSqRight = Number.POSITIVE_INFINITY;
        if (right < n) {
          const px = tupleData[right][0];
          if (Number.isFinite(px)) {
            const sx = xScale.scale(px);
            if (Number.isFinite(sx)) {
              const dx = sx - x;
              dxSqRight = dx * dx;
            }
          }
        }

        if (dxSqLeft > bestDistSq && dxSqRight > bestDistSq) break;

        // If both sides are equally close in x, evaluate both for stable tie behavior.
        if (dxSqLeft <= dxSqRight && dxSqLeft <= bestDistSq && left >= 0) {
          const py = tupleData[left][1];
          if (Number.isFinite(py)) {
            const sy = yScale.scale(py);
            if (Number.isFinite(sy)) {
              const dy = sy - y;
              const distSq = dxSqLeft + dy * dy;
              const isBetter =
                distSq < bestDistSq ||
                (distSq === bestDistSq &&
                  (bestPoint === null || s < bestSeriesIndex || (s === bestSeriesIndex && left < bestDataIndex)));
              if (isBetter) {
                bestDistSq = distSq;
                bestSeriesIndex = s;
                bestDataIndex = left;
                bestPoint = data[left] as DataPoint;
              }
            }
          }
          left--;
        } else if (dxSqLeft <= dxSqRight) {
          left--;
        }

        if (dxSqRight <= dxSqLeft && dxSqRight <= bestDistSq && right < n) {
          const py = tupleData[right][1];
          if (Number.isFinite(py)) {
            const sy = yScale.scale(py);
            if (Number.isFinite(sy)) {
              const dy = sy - y;
              const distSq = dxSqRight + dy * dy;
              const isBetter =
                distSq < bestDistSq ||
                (distSq === bestDistSq &&
                  (bestPoint === null || s < bestSeriesIndex || (s === bestSeriesIndex && right < bestDataIndex)));
              if (isBetter) {
                bestDistSq = distSq;
                bestSeriesIndex = s;
                bestDataIndex = right;
                bestPoint = data[right] as DataPoint;
              }
            }
          }
          right++;
        } else if (dxSqRight < dxSqLeft) {
          right++;
        }
      }
    } else {
      const objectData = data as ReadonlyArray<ObjectPoint>;
      const insertionIndex = lowerBoundObject(objectData, xTarget);

      let left = insertionIndex - 1;
      let right = insertionIndex;

      while (left >= 0 || right < n) {
        let dxSqLeft = Number.POSITIVE_INFINITY;
        if (left >= 0) {
          const px = objectData[left].x;
          if (Number.isFinite(px)) {
            const sx = xScale.scale(px);
            if (Number.isFinite(sx)) {
              const dx = sx - x;
              dxSqLeft = dx * dx;
            }
          }
        }

        let dxSqRight = Number.POSITIVE_INFINITY;
        if (right < n) {
          const px = objectData[right].x;
          if (Number.isFinite(px)) {
            const sx = xScale.scale(px);
            if (Number.isFinite(sx)) {
              const dx = sx - x;
              dxSqRight = dx * dx;
            }
          }
        }

        if (dxSqLeft > bestDistSq && dxSqRight > bestDistSq) break;

        if (dxSqLeft <= dxSqRight && dxSqLeft <= bestDistSq && left >= 0) {
          const py = objectData[left].y;
          if (Number.isFinite(py)) {
            const sy = yScale.scale(py);
            if (Number.isFinite(sy)) {
              const dy = sy - y;
              const distSq = dxSqLeft + dy * dy;
              const isBetter =
                distSq < bestDistSq ||
                (distSq === bestDistSq &&
                  (bestPoint === null || s < bestSeriesIndex || (s === bestSeriesIndex && left < bestDataIndex)));
              if (isBetter) {
                bestDistSq = distSq;
                bestSeriesIndex = s;
                bestDataIndex = left;
                bestPoint = data[left] as DataPoint;
              }
            }
          }
          left--;
        } else if (dxSqLeft <= dxSqRight) {
          left--;
        }

        if (dxSqRight <= dxSqLeft && dxSqRight <= bestDistSq && right < n) {
          const py = objectData[right].y;
          if (Number.isFinite(py)) {
            const sy = yScale.scale(py);
            if (Number.isFinite(sy)) {
              const dy = sy - y;
              const distSq = dxSqRight + dy * dy;
              const isBetter =
                distSq < bestDistSq ||
                (distSq === bestDistSq &&
                  (bestPoint === null || s < bestSeriesIndex || (s === bestSeriesIndex && right < bestDataIndex)));
              if (isBetter) {
                bestDistSq = distSq;
                bestSeriesIndex = s;
                bestDataIndex = right;
                bestPoint = data[right] as DataPoint;
              }
            }
          }
          right++;
        } else if (dxSqRight < dxSqLeft) {
          right++;
        }
      }
    }
  }

  if (bestPoint === null) return null;

  return {
    seriesIndex: bestSeriesIndex,
    dataIndex: bestDataIndex,
    point: bestPoint,
    distance: Math.sqrt(bestDistSq),
  };
}

