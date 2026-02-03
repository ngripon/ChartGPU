/**
 * Drag handler for repositioning annotations
 *
 * Handles dragging annotations to reposition them:
 * - lineX: constrained to horizontal movement
 * - lineY: constrained to vertical movement
 * - text: free 2D movement (data or plot space)
 * - point: free 2D movement (data space)
 *
 * Uses optimistic updates during drag for 60 FPS performance.
 */

import type { AnnotationConfig } from '../config/types.js';
import type { ChartGPUInstance } from '../ChartGPU.js';

export interface AnnotationDragCallbacks {
  onDragMove: (index: number, updates: Partial<AnnotationConfig>) => void;
  onDragEnd: (index: number, updates: Partial<AnnotationConfig>) => void;
  onDragCancel: () => void;
}

export interface AnnotationDragHandler {
  startDrag(
    annotationIndex: number,
    annotation: AnnotationConfig,
    startPointerX: number,
    startPointerY: number
  ): void;
  isDragging(): boolean;
  dispose(): void;
}

interface DragState {
  annotationIndex: number;
  annotation: AnnotationConfig;
  startPointerX: number;
  startPointerY: number;
  pointerId: number | null;
}

/**
 * Creates a drag handler for repositioning annotations
 */
export function createAnnotationDragHandler(
  chart: ChartGPUInstance,
  canvas: HTMLCanvasElement,
  callbacks: AnnotationDragCallbacks
): AnnotationDragHandler {
  let dragState: DragState | null = null;

  /**
   * Convert canvas-space CSS pixels to data-space coordinates
   */
  function canvasToData(canvasX: number, canvasY: number): { x: number; y: number } {
    const chartOptions = chart.options;
    const dpr = window.devicePixelRatio || 1;

    const grid = chartOptions.grid ?? { left: 60, right: 20, top: 40, bottom: 40 };
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;

    const plotLeft = grid.left;
    const plotRight = canvasWidth - grid.right;
    const plotTop = grid.top;
    const plotBottom = canvasHeight - grid.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const xAxis = chartOptions.xAxis;
    const yAxis = chartOptions.yAxis;

    let dataX = 0;
    let dataY = 0;

    // Convert X coordinate
    if (xAxis) {
      const xFraction = (canvasX - plotLeft) / plotWidth;
      if (xAxis.type === 'category' && Array.isArray(xAxis.data)) {
        // Category scale: map fraction to category index
        const index = Math.round(xFraction * (xAxis.data.length - 1 || 1));
        dataX = xAxis.data[Math.max(0, Math.min(index, xAxis.data.length - 1))] as number;
      } else {
        // Linear scale
        const min = xAxis.min ?? 0;
        const max = xAxis.max ?? 100;
        dataX = min + xFraction * (max - min);
      }
    }

    // Convert Y coordinate (inverted: canvas top = max Y value)
    if (yAxis) {
      const yFraction = (plotBottom - canvasY) / plotHeight;
      const min = yAxis.min ?? 0;
      const max = yAxis.max ?? 100;
      dataY = min + yFraction * (max - min);
    }

    return { x: dataX, y: dataY };
  }

  /**
   * Convert canvas-space CSS pixels to plot-space coordinates (0-1 fractions)
   */
  function canvasToPlot(canvasX: number, canvasY: number): { x: number; y: number } {
    const chartOptions = chart.options;
    const dpr = window.devicePixelRatio || 1;

    const grid = chartOptions.grid ?? { left: 60, right: 20, top: 40, bottom: 40 };
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;

    const plotLeft = grid.left;
    const plotRight = canvasWidth - grid.right;
    const plotTop = grid.top;
    const plotBottom = canvasHeight - grid.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const x = (canvasX - plotLeft) / plotWidth;
    const y = (canvasY - plotTop) / plotHeight;

    // Clamp to [0, 1]
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  /**
   * Handle pointer move during drag
   */
  function onPointerMove(e: PointerEvent): void {
    if (!dragState) return;

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const annotation = dragState.annotation;
    const updates: any = {}; // Use 'any' to bypass TypeScript union narrowing issues

    if (annotation.type === 'lineX') {
      // Constrain to horizontal movement only
      const { x } = canvasToData(canvasX, 0);
      updates.x = x;
    } else if (annotation.type === 'lineY') {
      // Constrain to vertical movement only
      const { y } = canvasToData(0, canvasY);
      updates.y = y;
    } else if (annotation.type === 'text') {
      // Free 2D movement (respect original space)
      const space = annotation.position.space;
      if (space === 'plot') {
        const { x, y } = canvasToPlot(canvasX, canvasY);
        updates.position = { space, x, y };
      } else {
        // data space
        const { x, y } = canvasToData(canvasX, canvasY);
        updates.position = { space, x, y };
      }
    } else if (annotation.type === 'point') {
      // Free 2D movement in data space
      const { x, y } = canvasToData(canvasX, canvasY);
      updates.x = x;
      updates.y = y;
    }

    // Optimistic update (no history push)
    callbacks.onDragMove(dragState.annotationIndex, updates);
  }

  /**
   * Handle pointer up (drag end)
   */
  function onPointerUp(e: PointerEvent): void {
    if (!dragState) return;

    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const annotation = dragState.annotation;
    const updates: any = {}; // Use 'any' to bypass TypeScript union narrowing issues

    if (annotation.type === 'lineX') {
      const { x } = canvasToData(canvasX, 0);
      updates.x = x;
    } else if (annotation.type === 'lineY') {
      const { y } = canvasToData(0, canvasY);
      updates.y = y;
    } else if (annotation.type === 'text') {
      const space = annotation.position.space;
      if (space === 'plot') {
        const { x, y } = canvasToPlot(canvasX, canvasY);
        updates.position = { space, x, y };
      } else {
        const { x, y } = canvasToData(canvasX, canvasY);
        updates.position = { space, x, y };
      }
    } else if (annotation.type === 'point') {
      const { x, y } = canvasToData(canvasX, canvasY);
      updates.x = x;
      updates.y = y;
    }

    // Push single history entry with final position
    callbacks.onDragEnd(dragState.annotationIndex, updates);

    cleanup();
  }

  /**
   * Handle pointer cancel (drag cancelled)
   */
  function onPointerCancel(): void {
    if (!dragState) return;

    // Revert to original position
    callbacks.onDragCancel();

    cleanup();
  }

  /**
   * Handle keyboard events during drag
   */
  function onKeyDown(e: KeyboardEvent): void {
    if (!dragState) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onPointerCancel();
    }
  }

  /**
   * Cleanup drag state and event listeners
   */
  function cleanup(): void {
    if (!dragState) return;

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('keydown', onKeyDown);

    if (dragState.pointerId !== null) {
      try {
        canvas.releasePointerCapture(dragState.pointerId);
      } catch (err) {
        // Ignore errors (pointer may already be released)
      }
    }

    document.body.style.cursor = '';
    dragState = null;
  }

  /**
   * Start dragging an annotation
   */
  function startDrag(
    annotationIndex: number,
    annotation: AnnotationConfig,
    startPointerX: number,
    startPointerY: number
  ): void {
    // Cancel any existing drag
    if (dragState) {
      cleanup();
    }

    dragState = {
      annotationIndex,
      annotation,
      startPointerX,
      startPointerY,
      pointerId: null,
    };

    // Set cursor based on annotation type
    if (annotation.type === 'lineX') {
      document.body.style.cursor = 'ew-resize';
    } else if (annotation.type === 'lineY') {
      document.body.style.cursor = 'ns-resize';
    } else {
      document.body.style.cursor = 'grabbing';
    }

    // Attach window-level listeners for smooth dragging outside canvas
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    document.addEventListener('keydown', onKeyDown, { passive: false });

    // Visual feedback: reduce opacity
    callbacks.onDragMove(annotationIndex, {
      style: { ...annotation.style, opacity: 0.7 },
    });
  }

  /**
   * Check if currently dragging
   */
  function isDragging(): boolean {
    return dragState !== null;
  }

  /**
   * Dispose of resources
   */
  function dispose(): void {
    cleanup();
  }

  return {
    startDrag,
    isDragging,
    dispose,
  };
}
