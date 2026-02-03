/**
 * Hit testing for chart annotations
 *
 * Detects which annotation (if any) the user clicked or hovered over.
 * Uses canvas-space coordinates and configurable hit tolerances.
 */

import type { AnnotationConfig } from '../config/types.js';
import type { ChartGPUInstance } from '../ChartGPU.js';

export interface AnnotationHitTestResult {
  readonly annotationIndex: number;
  readonly annotation: AnnotationConfig;
  readonly hitType: 'line' | 'text' | 'point' | 'label';
  readonly distanceCssPx: number;
}

export interface AnnotationHitTesterOptions {
  readonly lineTolerance?: number;      // Default: 8px
  readonly textTolerance?: number;      // Default: 4px
  readonly pointTolerance?: number;     // Default: 12px
  readonly labelTolerance?: number;     // Default: 2px
  readonly spatialGridThreshold?: number; // Default: 20 annotations
}

export interface AnnotationHitTester {
  hitTest(canvasX: number, canvasY: number): AnnotationHitTestResult | null;
  updateTextBounds(textBounds: Map<number, DOMRect>): void;
  invalidateCache(): void;
  dispose(): void;
}

interface CachedAnnotationBounds {
  canvasX?: number;
  canvasY?: number;
  width?: number;
  height?: number;
}

/**
 * Creates an annotation hit tester for detecting pointer interactions
 */
export function createAnnotationHitTester(
  chart: ChartGPUInstance,
  canvas: HTMLCanvasElement,
  options: AnnotationHitTesterOptions = {}
): AnnotationHitTester {
  const lineTolerance = options.lineTolerance ?? 8;
  const textTolerance = options.textTolerance ?? 4;
  const pointTolerance = options.pointTolerance ?? 12;
  // labelTolerance reserved for future use
  const spatialGridThreshold = options.spatialGridThreshold ?? 20;

  // Cache for annotation bounds in canvas-space
  let boundsCache = new Map<number, CachedAnnotationBounds>();
  let textBoundsCache = new Map<number, DOMRect>();
  let cacheValid = false;

  /**
   * Convert data-space coordinates to canvas-space CSS pixels
   */
  function dataToCanvas(x: number | undefined, y: number | undefined): { x: number; y: number } {
    const chartOptions = chart.options;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const grid = chartOptions.grid ?? { left: 60, right: 20, top: 40, bottom: 40 };
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    const plotLeft = grid.left;
    const plotRight = canvasWidth - grid.right;
    const plotTop = grid.top;
    const plotBottom = canvasHeight - grid.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    // Get scales from chart
    const xAxis = chartOptions.xAxis;
    const yAxis = chartOptions.yAxis;

    let canvasX = 0;
    let canvasY = 0;

    // Convert X coordinate
    if (x !== undefined && xAxis) {
      if (xAxis.type === 'category' && Array.isArray(xAxis.data)) {
        // Category scale: find index and map to plot space
        const index = xAxis.data.indexOf(String(x));
        if (index >= 0) {
          const fraction = index / (xAxis.data.length - 1 || 1);
          canvasX = plotLeft + fraction * plotWidth;
        }
      } else {
        // Linear scale
        const min = xAxis.min ?? 0;
        const max = xAxis.max ?? 100;
        const fraction = (x - min) / (max - min || 1);
        canvasX = plotLeft + fraction * plotWidth;
      }
    }

    // Convert Y coordinate (inverted: canvas top = max Y value)
    if (y !== undefined && yAxis) {
      const min = yAxis.min ?? 0;
      const max = yAxis.max ?? 100;
      const fraction = (y - min) / (max - min || 1);
      canvasY = plotBottom - fraction * plotHeight; // Inverted Y
    }

    return { x: canvasX, y: canvasY };
  }

  /**
   * Convert plot-space coordinates (0-1 fractions) to canvas-space CSS pixels
   */
  function plotToCanvas(x: number, y: number): { x: number; y: number } {
    const chartOptions = chart.options;
    const rect = canvas.getBoundingClientRect();

    const grid = chartOptions.grid ?? { left: 60, right: 20, top: 40, bottom: 40 };
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    const plotLeft = grid.left ?? 60;
    const plotRight = canvasWidth - (grid.right ?? 20);
    const plotTop = grid.top ?? 40;
    const plotBottom = canvasHeight - (grid.bottom ?? 40);
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    return {
      x: plotLeft + x * plotWidth,
      y: plotTop + y * plotHeight,
    };
  }

  /**
   * Update cached bounds for all annotations
   */
  function updateCache(annotations: readonly AnnotationConfig[]): void {
    boundsCache.clear();

    annotations.forEach((annotation, index) => {
      const bounds: CachedAnnotationBounds = {};

      if (annotation.type === 'lineX' && annotation.x !== undefined) {
        const { x } = dataToCanvas(annotation.x, undefined);
        bounds.canvasX = x;
      } else if (annotation.type === 'lineY' && annotation.y !== undefined) {
        const { y } = dataToCanvas(undefined, annotation.y);
        bounds.canvasY = y;
      } else if (annotation.type === 'point' && annotation.x !== undefined && annotation.y !== undefined) {
        const { x, y } = dataToCanvas(annotation.x, annotation.y);
        bounds.canvasX = x;
        bounds.canvasY = y;
      } else if (annotation.type === 'text') {
        const pos = annotation.position;
        if (pos.space === 'plot') {
          const { x, y } = plotToCanvas(pos.x, pos.y);
          bounds.canvasX = x;
          bounds.canvasY = y;
        } else if (pos.space === 'data') {
          const { x, y } = dataToCanvas(pos.x, pos.y);
          bounds.canvasX = x;
          bounds.canvasY = y;
        }
      }

      boundsCache.set(index, bounds);
    });

    cacheValid = true;
  }

  /**
   * Calculate distance from pointer to a line (vertical or horizontal)
   */
  function distanceToLine(
    pointerX: number,
    pointerY: number,
    lineX?: number,
    lineY?: number
  ): number {
    if (lineX !== undefined) {
      // Vertical line: distance is horizontal difference
      return Math.abs(pointerX - lineX);
    } else if (lineY !== undefined) {
      // Horizontal line: distance is vertical difference
      return Math.abs(pointerY - lineY);
    }
    return Infinity;
  }

  /**
   * Calculate distance from pointer to a point
   */
  function distanceToPoint(
    pointerX: number,
    pointerY: number,
    pointX: number,
    pointY: number
  ): number {
    const dx = pointerX - pointX;
    const dy = pointerY - pointY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Check if pointer is inside a rectangle (with tolerance padding)
   */
  function isInsideRect(
    pointerX: number,
    pointerY: number,
    rect: DOMRect,
    tolerance: number
  ): boolean {
    return (
      pointerX >= rect.left - tolerance &&
      pointerX <= rect.right + tolerance &&
      pointerY >= rect.top - tolerance &&
      pointerY <= rect.bottom + tolerance
    );
  }

  /**
   * Perform hit test at the given canvas position
   */
  function hitTest(canvasX: number, canvasY: number): AnnotationHitTestResult | null {
    const annotations = chart.options.annotations ?? [];

    if (annotations.length === 0) {
      return null;
    }

    // Update cache if invalid
    if (!cacheValid) {
      updateCache(annotations);
    }

    let closestHit: AnnotationHitTestResult | null = null;
    let closestDistance = Infinity;

    // Priority order: Labels > Points > Text > Lines
    // Test in reverse priority order (lines first) so higher priority overwrites

    // 1. Test lines (lowest priority)
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      const bounds = boundsCache.get(i);

      if (!bounds) continue;

      if (annotation.type === 'lineX' && bounds.canvasX !== undefined) {
        const distance = distanceToLine(canvasX, canvasY, bounds.canvasX, undefined);
        if (distance <= lineTolerance && distance < closestDistance) {
          closestDistance = distance;
          closestHit = {
            annotationIndex: i,
            annotation,
            hitType: 'line',
            distanceCssPx: distance,
          };
        }
      } else if (annotation.type === 'lineY' && bounds.canvasY !== undefined) {
        const distance = distanceToLine(canvasX, canvasY, undefined, bounds.canvasY);
        if (distance <= lineTolerance && distance < closestDistance) {
          closestDistance = distance;
          closestHit = {
            annotationIndex: i,
            annotation,
            hitType: 'line',
            distanceCssPx: distance,
          };
        }
      }
    }

    // 2. Test text (medium priority)
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      const textRect = textBoundsCache.get(i);

      if (annotation.type === 'text' && textRect) {
        if (isInsideRect(canvasX, canvasY, textRect, textTolerance)) {
          const centerX = textRect.left + textRect.width / 2;
          const centerY = textRect.top + textRect.height / 2;
          const distance = distanceToPoint(canvasX, canvasY, centerX, centerY);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestHit = {
              annotationIndex: i,
              annotation,
              hitType: 'text',
              distanceCssPx: distance,
            };
          }
        }
      }
    }

    // 3. Test points (high priority)
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      const bounds = boundsCache.get(i);

      if (bounds && annotation.type === 'point' && bounds.canvasX !== undefined && bounds.canvasY !== undefined) {
        const distance = distanceToPoint(canvasX, canvasY, bounds.canvasX, bounds.canvasY);
        if (distance <= pointTolerance && distance < closestDistance) {
          closestDistance = distance;
          closestHit = {
            annotationIndex: i,
            annotation,
            hitType: 'point',
            distanceCssPx: distance,
          };
        }
      }
    }

    // 4. Test labels (highest priority) - TODO: implement once label bounds are available

    return closestHit;
  }

  /**
   * Update text bounds from DOM measurements
   */
  function updateTextBounds(textBounds: Map<number, DOMRect>): void {
    textBoundsCache = new Map(textBounds);
  }

  /**
   * Invalidate cache (call on zoom, pan, or resize)
   */
  function invalidateCache(): void {
    cacheValid = false;
  }

  /**
   * Dispose of resources
   */
  function dispose(): void {
    boundsCache.clear();
    textBoundsCache.clear();
  }

  return {
    hitTest,
    updateTextBounds,
    invalidateCache,
    dispose,
  };
}
