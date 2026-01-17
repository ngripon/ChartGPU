export interface LinearScale {
  /**
   * Sets the scale domain (data range). Returns self for chaining.
   */
  domain(min: number, max: number): LinearScale;

  /**
   * Sets the scale range (pixel range). Returns self for chaining.
   */
  range(min: number, max: number): LinearScale;

  /**
   * Maps a domain value to a range value.
   *
   * Notes:
   * - No clamping (will extrapolate outside the domain).
   * - If the domain span is 0 (min === max), returns the midpoint of the range.
   */
  scale(value: number): number;

  /**
   * Maps a range value (pixel) back to a domain value.
   *
   * Notes:
   * - No clamping (will extrapolate outside the range).
   * - If the domain span is 0 (min === max), returns domain min for any input.
   */
  invert(pixel: number): number;
}

const assertFinite = (label: string, value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number. Received: ${String(value)}`);
  }
};

/**
 * Creates a linear scale for mapping a numeric domain to a numeric range.
 *
 * Defaults to an identity mapping:
 * domain [0, 1] -> range [0, 1]
 */
export function createLinearScale(): LinearScale {
  let domainMin = 0;
  let domainMax = 1;
  let rangeMin = 0;
  let rangeMax = 1;

  const self: LinearScale = {
    domain(min: number, max: number) {
      assertFinite('domain min', min);
      assertFinite('domain max', max);
      domainMin = min;
      domainMax = max;
      return self;
    },

    range(min: number, max: number) {
      assertFinite('range min', min);
      assertFinite('range max', max);
      rangeMin = min;
      rangeMax = max;
      return self;
    },

    scale(value: number) {
      if (!Number.isFinite(value)) return Number.NaN;

      if (domainMin === domainMax) {
        return (rangeMin + rangeMax) / 2;
      }

      const t = (value - domainMin) / (domainMax - domainMin);
      return rangeMin + t * (rangeMax - rangeMin);
    },

    invert(pixel: number) {
      if (!Number.isFinite(pixel)) return Number.NaN;

      if (domainMin === domainMax) {
        return domainMin;
      }

      if (rangeMin === rangeMax) {
        return (domainMin + domainMax) / 2;
      }

      const t = (pixel - rangeMin) / (rangeMax - rangeMin);
      return domainMin + t * (domainMax - domainMin);
    },
  };

  return self;
}
