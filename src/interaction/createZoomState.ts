export type ZoomRange = Readonly<{ start: number; end: number }>;

export type ZoomRangeChangeCallback = (range: ZoomRange) => void;

export interface ZoomState {
  /**
   * Returns the current zoom window in percent space, clamped to [0, 100].
   */
  getRange(): ZoomRange;
  /**
   * Sets the zoom window in percent space.
   */
  setRange(start: number, end: number): void;
  /**
   * Zooms in around `center` by shrinking the span by `factor`.
   *
   * `factor <= 1` is treated as a no-op.
   */
  zoomIn(center: number, factor: number): void;
  /**
   * Zooms out around `center` by growing the span by `factor`.
   *
   * `factor <= 1` is treated as a no-op.
   */
  zoomOut(center: number, factor: number): void;
  /**
   * Pans the zoom window by `delta` percent points (preserving span).
   */
  pan(delta: number): void;
  /**
   * Subscribes to changes. Returns an unsubscribe function.
   */
  onChange(callback: ZoomRangeChangeCallback): () => void;
}

const DEFAULT_MIN_SPAN = 0;
const DEFAULT_MAX_SPAN = 100;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);

const normalizeZero = (v: number): number => (Object.is(v, -0) ? 0 : v);

const copyRange = (r: ZoomRange): ZoomRange => ({ start: r.start, end: r.end });

export function createZoomState(initialStart: number, initialEnd: number): ZoomState {
  let start = 0;
  let end = 100;
  let lastEmitted: ZoomRange | null = null;

  const listeners = new Set<ZoomRangeChangeCallback>();

  const minSpan = (() => {
    const v = Number.isFinite(DEFAULT_MIN_SPAN) ? DEFAULT_MIN_SPAN : 0;
    return clamp(v, 0, 100);
  })();

  const maxSpan = (() => {
    const v = Number.isFinite(DEFAULT_MAX_SPAN) ? DEFAULT_MAX_SPAN : 100;
    return clamp(v, 0, 100);
  })();

  const normalizedMinSpan = Math.min(minSpan, maxSpan);
  const normalizedMaxSpan = Math.max(minSpan, maxSpan);

  const emit = (): void => {
    const next: ZoomRange = { start, end };
    if (
      lastEmitted !== null &&
      lastEmitted.start === next.start &&
      lastEmitted.end === next.end
    ) {
      return;
    }

    lastEmitted = copyRange(next);

    // Emit to a snapshot so additions/removals during emit don't affect this flush.
    const snapshot = Array.from(listeners);
    for (const cb of snapshot) cb({ start, end });
  };

  const applyNextRange = (
    nextStart: number,
    nextEnd: number,
    options?: { readonly emit?: boolean; readonly anchor?: { readonly center: number; readonly ratio: number } },
  ): void => {
    if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) return;

    let s = nextStart;
    let e = nextEnd;

    if (s > e) {
      const t = s;
      s = e;
      e = t;
    }

    // Enforce span constraints by resizing around the proposed midpoint.
    let span = e - s;
    if (!Number.isFinite(span) || span < 0) return;

    const targetSpan = clamp(span, normalizedMinSpan, normalizedMaxSpan);
    if (targetSpan !== span) {
      const anchorCenter =
        options?.anchor && Number.isFinite(options.anchor.center)
          ? clamp(options.anchor.center, 0, 100)
          : (s + e) * 0.5;
      const anchorRatio =
        options?.anchor && Number.isFinite(options.anchor.ratio)
          ? clamp01(options.anchor.ratio)
          : 0.5;

      // Resize around the anchor so zoom operations preserve the cursor location.
      s = anchorCenter - anchorRatio * targetSpan;
      e = s + targetSpan;
      span = targetSpan;
    }

    // If span exceeds bounds (shouldn't happen with normalizedMaxSpan <= 100), clamp to full extent.
    if (span > 100) {
      s = 0;
      e = 100;
      span = 100;
    }

    // Shift into bounds without changing span.
    if (s < 0) {
      const shift = -s;
      s += shift;
      e += shift;
    }
    if (e > 100) {
      const shift = e - 100;
      s -= shift;
      e -= shift;
    }

    // Final clamp for tiny floating point drift.
    s = clamp(s, 0, 100);
    e = clamp(e, 0, 100);

    s = normalizeZero(s);
    e = normalizeZero(e);

    if (s === start && e === end) return;
    start = s;
    end = e;

    if (options?.emit === false) return;
    emit();
  };

  // Initialize state (no emit by default).
  applyNextRange(initialStart, initialEnd, { emit: false });

  const getRange: ZoomState['getRange'] = () => ({ start, end });

  const setRange: ZoomState['setRange'] = (nextStart, nextEnd) => {
    applyNextRange(nextStart, nextEnd);
  };

  const zoomIn: ZoomState['zoomIn'] = (center, factor) => {
    if (!Number.isFinite(center) || !Number.isFinite(factor)) return;
    if (factor <= 1) return;

    const c = clamp(center, 0, 100);
    const span = end - start;
    const r = span === 0 ? 0.5 : clamp01((c - start) / span);
    const nextSpan = span / factor;
    const nextStart = c - r * nextSpan;
    const nextEnd = nextStart + nextSpan;
    applyNextRange(nextStart, nextEnd, { anchor: { center: c, ratio: r } });
  };

  const zoomOut: ZoomState['zoomOut'] = (center, factor) => {
    if (!Number.isFinite(center) || !Number.isFinite(factor)) return;
    if (factor <= 1) return;

    const c = clamp(center, 0, 100);
    const span = end - start;
    const r = span === 0 ? 0.5 : clamp01((c - start) / span);
    const nextSpan = span * factor;
    const nextStart = c - r * nextSpan;
    const nextEnd = nextStart + nextSpan;
    applyNextRange(nextStart, nextEnd, { anchor: { center: c, ratio: r } });
  };

  const pan: ZoomState['pan'] = (delta) => {
    if (!Number.isFinite(delta)) return;
    applyNextRange(start + delta, end + delta);
  };

  const onChange: ZoomState['onChange'] = (callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  };

  return { getRange, setRange, zoomIn, zoomOut, pan, onChange };
}

