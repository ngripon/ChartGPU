/**
 * Visible Slice Computation Utilities
 *
 * Provides efficient data slicing for zoom operations using binary search
 * when data is monotonic, with fallback to linear filtering.
 *
 * Key features:
 * - Binary search slicing for O(log n) performance on sorted data
 * - WeakMap caching of monotonicity checks to avoid O(n) scans
 * - Separate implementations for cartesian (x-based) and OHLC (timestamp-based) data
 * - Support for both tuple and object data formats
 */

import type {
  DataPoint,
  DataPointTuple,
  OHLCDataPoint,
  OHLCDataPointTuple
} from '../../../config/types';
import { getPointXY } from '../utils/dataPointUtils';
import { clampInt } from '../utils/canvasUtils';

// Type definitions
type TuplePoint = DataPointTuple;
type ObjectPoint = Readonly<{ x: number; y: number; size?: number }>;
type OHLCObjectPoint = Readonly<{ timestamp: number; open: number; close: number; low: number; high: number }>;

// Type guards
export function isTuplePoint(p: DataPoint): p is TuplePoint {
  return Array.isArray(p);
}

export function isTupleDataArray(data: ReadonlyArray<DataPoint>): data is ReadonlyArray<TuplePoint> {
  return data.length > 0 && isTuplePoint(data[0]!);
}

export function isTupleOHLCDataPoint(p: OHLCDataPoint): p is OHLCDataPointTuple {
  return Array.isArray(p);
}

// Cache monotonicity checks to avoid O(n) scans on every zoom operation
const monotonicXCache = new WeakMap<ReadonlyArray<DataPoint>, boolean>();
const monotonicTimestampCache = new WeakMap<ReadonlyArray<OHLCDataPoint>, boolean>();

/**
 * Checks if cartesian data is monotonic non-decreasing by X coordinate with all finite values.
 * Results are cached in a WeakMap to avoid repeated O(n) scans.
 */
export function isMonotonicNonDecreasingFiniteX(data: ReadonlyArray<DataPoint>, isTuple: boolean): boolean {
  const cached = monotonicXCache.get(data);
  if (cached !== undefined) return cached;

  let prevX = Number.NEGATIVE_INFINITY;

  if (isTuple) {
    const tupleData = data as ReadonlyArray<TuplePoint>;
    for (let i = 0; i < tupleData.length; i++) {
      const x = tupleData[i][0];
      if (!Number.isFinite(x)) {
        monotonicXCache.set(data, false);
        return false;
      }
      if (x < prevX) {
        monotonicXCache.set(data, false);
        return false;
      }
      prevX = x;
    }
    monotonicXCache.set(data, true);
    return true;
  }

  const objectData = data as ReadonlyArray<ObjectPoint>;
  for (let i = 0; i < objectData.length; i++) {
    const x = objectData[i].x;
    if (!Number.isFinite(x)) {
      monotonicXCache.set(data, false);
      return false;
    }
    if (x < prevX) {
      monotonicXCache.set(data, false);
      return false;
    }
    prevX = x;
  }
  monotonicXCache.set(data, true);
  return true;
}

/**
 * Checks if OHLC data is monotonic non-decreasing by timestamp with all finite values.
 * Results are cached in a WeakMap to avoid repeated O(n) scans.
 */
export function isMonotonicNonDecreasingFiniteTimestamp(data: ReadonlyArray<OHLCDataPoint>): boolean {
  const cached = monotonicTimestampCache.get(data);
  if (cached !== undefined) return cached;

  let prevTimestamp = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < data.length; i++) {
    const p = data[i]!;
    const timestamp = isTupleOHLCDataPoint(p) ? p[0] : p.timestamp;
    if (!Number.isFinite(timestamp)) {
      monotonicTimestampCache.set(data, false);
      return false;
    }
    if (timestamp < prevTimestamp) {
      monotonicTimestampCache.set(data, false);
      return false;
    }
    prevTimestamp = timestamp;
  }
  monotonicTimestampCache.set(data, true);
  return true;
}

// Binary search: lower bound (first element >= target)
function lowerBoundXTuple(data: ReadonlyArray<TuplePoint>, xTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const x = data[mid][0];
    if (x < xTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Binary search: upper bound (first element > target)
function upperBoundXTuple(data: ReadonlyArray<TuplePoint>, xTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const x = data[mid][0];
    if (x <= xTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBoundXObject(data: ReadonlyArray<ObjectPoint>, xTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const x = data[mid].x;
    if (x < xTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundXObject(data: ReadonlyArray<ObjectPoint>, xTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const x = data[mid].x;
    if (x <= xTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBoundTimestampTuple(data: ReadonlyArray<OHLCDataPointTuple>, timestampTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const timestamp = data[mid][0];
    if (timestamp < timestampTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundTimestampTuple(data: ReadonlyArray<OHLCDataPointTuple>, timestampTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const timestamp = data[mid][0];
    if (timestamp <= timestampTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBoundTimestampObject(data: ReadonlyArray<OHLCObjectPoint>, timestampTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const timestamp = data[mid].timestamp;
    if (timestamp < timestampTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundTimestampObject(data: ReadonlyArray<OHLCObjectPoint>, timestampTarget: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const timestamp = data[mid].timestamp;
    if (timestamp <= timestampTarget) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Slices cartesian data to the visible X range [xMin, xMax].
 *
 * Uses binary search (O(log n)) when data is monotonic by X;
 * otherwise falls back to linear filtering (O(n)).
 *
 * @param data - Cartesian data points (tuple or object format)
 * @param xMin - Minimum X value (inclusive)
 * @param xMax - Maximum X value (inclusive)
 * @returns Sliced data array containing only points within [xMin, xMax]
 */
export function sliceVisibleRangeByX(
  data: ReadonlyArray<DataPoint>,
  xMin: number,
  xMax: number
): ReadonlyArray<DataPoint> {
  const n = data.length;
  if (n === 0) return data;
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) return data;

  const isTuple = isTupleDataArray(data);
  const canBinarySearch = isMonotonicNonDecreasingFiniteX(data, isTuple);

  if (canBinarySearch) {
    const lo = isTuple
      ? lowerBoundXTuple(data as ReadonlyArray<TuplePoint>, xMin)
      : lowerBoundXObject(data as ReadonlyArray<ObjectPoint>, xMin);
    const hi = isTuple
      ? upperBoundXTuple(data as ReadonlyArray<TuplePoint>, xMax)
      : upperBoundXObject(data as ReadonlyArray<ObjectPoint>, xMax);

    if (lo <= 0 && hi >= n) return data;
    if (hi <= lo) return [];
    return data.slice(lo, hi);
  }

  // Safe fallback: linear filter (preserves order, ignores non-finite x)
  const out: DataPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = data[i]!;
    const { x } = getPointXY(p);
    if (!Number.isFinite(x)) continue;
    if (x >= xMin && x <= xMax) out.push(p);
  }
  return out;
}

/**
 * Finds the index range of visible points in cartesian data.
 *
 * Returns { start, end } indices suitable for slicing or iteration.
 * Only works correctly when data is monotonic; returns full range otherwise.
 *
 * @param data - Cartesian data points (tuple or object format)
 * @param xMin - Minimum X value (inclusive)
 * @param xMax - Maximum X value (inclusive)
 * @returns Index range { start, end } for visible data
 */
export function findVisibleRangeIndicesByX(
  data: ReadonlyArray<DataPoint>,
  xMin: number,
  xMax: number
): { readonly start: number; readonly end: number } {
  const n = data.length;
  if (n === 0) return { start: 0, end: 0 };
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) return { start: 0, end: n };

  const isTuple = isTupleDataArray(data);
  const canBinarySearch = isMonotonicNonDecreasingFiniteX(data, isTuple);
  if (!canBinarySearch) {
    // Data is not monotonic by x; we can't represent the visible set as a contiguous index range
    // Fall back to processing the full series for correctness
    return { start: 0, end: n };
  }

  const start = isTuple
    ? lowerBoundXTuple(data as ReadonlyArray<TuplePoint>, xMin)
    : lowerBoundXObject(data as ReadonlyArray<ObjectPoint>, xMin);
  const end = isTuple
    ? upperBoundXTuple(data as ReadonlyArray<TuplePoint>, xMax)
    : upperBoundXObject(data as ReadonlyArray<ObjectPoint>, xMax);

  const s = clampInt(start, 0, n);
  const e = clampInt(end, 0, n);
  return e <= s ? { start: s, end: s } : { start: s, end: e };
}

/**
 * Slices OHLC/candlestick data to the visible timestamp range [xMin, xMax].
 *
 * Uses binary search (O(log n)) when timestamps are monotonic;
 * otherwise falls back to linear filtering (O(n)).
 *
 * @param data - OHLC data points (tuple or object format)
 * @param xMin - Minimum timestamp (inclusive)
 * @param xMax - Maximum timestamp (inclusive)
 * @returns Sliced data array containing only points within [xMin, xMax]
 */
export function sliceVisibleRangeByOHLC(
  data: ReadonlyArray<OHLCDataPoint>,
  xMin: number,
  xMax: number
): ReadonlyArray<OHLCDataPoint> {
  const n = data.length;
  if (n === 0) return data;
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) return data;

  const canBinarySearch = isMonotonicNonDecreasingFiniteTimestamp(data);
  const isTuple = n > 0 && isTupleOHLCDataPoint(data[0]!);

  if (canBinarySearch) {
    const lo = isTuple
      ? lowerBoundTimestampTuple(data as ReadonlyArray<OHLCDataPointTuple>, xMin)
      : lowerBoundTimestampObject(data as ReadonlyArray<OHLCObjectPoint>, xMin);
    const hi = isTuple
      ? upperBoundTimestampTuple(data as ReadonlyArray<OHLCDataPointTuple>, xMax)
      : upperBoundTimestampObject(data as ReadonlyArray<OHLCObjectPoint>, xMax);

    if (lo <= 0 && hi >= n) return data;
    if (hi <= lo) return [];
    return data.slice(lo, hi);
  }

  // Safe fallback: linear filter (preserves order, ignores non-finite timestamp)
  const out: OHLCDataPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = data[i]!;
    const timestamp = isTupleOHLCDataPoint(p) ? p[0] : p.timestamp;
    if (!Number.isFinite(timestamp)) continue;
    if (timestamp >= xMin && timestamp <= xMax) out.push(p);
  }
  return out;
}
