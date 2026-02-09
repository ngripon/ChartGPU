/**
 * Cartesian Data Formats Example
 * 
 * Demonstrates three input formats for CartesianSeriesData:
 * 1. XYArraysData: { x: ArrayLike<number>; y: ArrayLike<number>; size?: ArrayLike<number> }
 *    - Uses Float64Array for x and Float32Array for y to showcase ArrayLike support
 * 2. InterleavedXYData: Float32Array laid out as [x0, y0, x1, y1, ...]
 *    - Uses subarray() to demonstrate byteOffset safety
 * 3. Traditional: ReadonlyArray<DataPoint> (array of objects)
 * 
 * Features:
 * - Two static series on the same chart (100k points each)
 * - Interactive format toggle for series 1 (XYArraysData, InterleavedXYData, Array)
 * - Series 2 always uses InterleavedXYData with subarray view for comparison
 * - Two streaming series demonstrating appendData with typed arrays:
 *   - Series 3: Line series with InterleavedXYData (Float32Array [x,y,...])
 *   - Series 4: Scatter series with XYArraysData including size (Float32Array)
 * - Start/Stop streaming control with appended points counter
 * - Distinct colors and legend to identify each series
 * - Deterministic data generation for consistent rendering
 */

import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions, CartesianSeriesData, DataPoint, XYArraysData, InterleavedXYData } from '../../src/config/types';

const POINT_COUNT = 100_000;
const X_DOMAIN_MAX = Math.PI * 2 * 3;
const STREAMING_BATCH_SIZE = 512; // Points per append
const STREAMING_INTERVAL_MS = 33; // ~30 Hz

/**
 * Generate sine wave data in XYArraysData format.
 * Uses Float64Array for x and Float32Array for y to demonstrate ArrayLike support.
 */
const generateXYArraysData = (
  count: number,
  opts: Readonly<{ phase?: number; amplitude?: number; frequency?: number }> = {}
): XYArraysData => {
  const phase = opts.phase ?? 0;
  const amplitude = opts.amplitude ?? 1;
  const frequency = opts.frequency ?? 1;

  const x = new Float64Array(count);
  const y = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // Keep x-domain consistent across series; frequency controls cycles within the domain.
    x[i] = t * X_DOMAIN_MAX;
    y[i] = Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude;
  }

  return { x, y };
};

/**
 * Generate sine wave data in InterleavedXYData format.
 * Returns a Float32Array with [x0, y0, x1, y1, ...] layout.
 * If withSubarray is true, returns a subarray view to demonstrate byteOffset safety.
 */
const generateInterleavedXYData = (
  count: number,
  opts: Readonly<{ phase?: number; amplitude?: number; frequency?: number; withSubarray?: boolean }> = {}
): InterleavedXYData => {
  const phase = opts.phase ?? 0;
  const amplitude = opts.amplitude ?? 1;
  const frequency = opts.frequency ?? 1;
  const withSubarray = opts.withSubarray ?? false;

  // If withSubarray is true, create a larger buffer and return a subarray view
  // This demonstrates byteOffset safety for CPU-side paths
  const extraElements = withSubarray ? 4 : 0; // Add 4 extra elements (2 points) at the start
  const totalElements = count * 2 + extraElements;
  const buffer = new Float32Array(totalElements);

  // Write data starting at the offset
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // Keep x-domain consistent across series; frequency controls cycles within the domain.
    const x = t * X_DOMAIN_MAX;
    const y = Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude;
    
    const idx = extraElements + i * 2;
    buffer[idx] = x;
    buffer[idx + 1] = y;
  }

  // Return subarray view if requested, otherwise return the full array
  return withSubarray ? buffer.subarray(extraElements, extraElements + count * 2) : buffer;
};

/**
 * Generate sine wave data in traditional array-of-objects format.
 */
const generateArrayOfObjects = (
  count: number,
  opts: Readonly<{ phase?: number; amplitude?: number; frequency?: number }> = {}
): ReadonlyArray<DataPoint> => {
  const phase = opts.phase ?? 0;
  const amplitude = opts.amplitude ?? 1;
  const frequency = opts.frequency ?? 1;

  const data: DataPoint[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // Keep x-domain consistent across series; frequency controls cycles within the domain.
    const x = t * X_DOMAIN_MAX;
    const y = Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude;
    data[i] = { x, y };
  }

  return data;
};

// Pre-generate all data formats for series 1 (sine wave)
const series1XYArrays = generateXYArraysData(POINT_COUNT, { phase: 0, amplitude: 1, frequency: 3 });
const series1Interleaved = generateInterleavedXYData(POINT_COUNT, { phase: 0, amplitude: 1, frequency: 3 });
const series1Array = generateArrayOfObjects(POINT_COUNT, { phase: 0, amplitude: 1, frequency: 3 });

console.log(series1XYArrays);
console.log(series1Interleaved);
console.log('SERIES 1 ARRAY', series1Array);
// Series 2 always uses InterleavedXYData with subarray view (cosine wave)
const series2Data = generateInterleavedXYData(POINT_COUNT, { 
  phase: Math.PI / 2, 
  amplitude: 0.8, 
  frequency: 2,
  withSubarray: true // Demonstrate byteOffset safety
});

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

async function main() {
  const container = document.getElementById('chart');
  if (!container) {
    throw new Error('Chart container not found');
  }

  // Current format for series 1
  let series1Format: 'xyarrays' | 'interleaved' | 'array' = 'xyarrays';

  const getSeries1Data = (): CartesianSeriesData => {
    switch (series1Format) {
      case 'xyarrays':
        return series1XYArrays;
      case 'interleaved':
        return series1Interleaved;
      case 'array':
        return series1Array;
    }
  };

  const getFormatLabel = (format: typeof series1Format): string => {
    switch (format) {
      case 'xyarrays':
        return 'XYArraysData (Float64Array x, Float32Array y)';
      case 'interleaved':
        return 'InterleavedXYData (Float32Array)';
      case 'array':
        return 'Array<{x, y}>';
    }
  };

   const options: ChartGPUOptions = {
    grid: { left: 70, right: 24, top: 24, bottom: 56 },
    xAxis: { type: 'value', min: 0, name: 'x' }, // No max - allow dynamic bounds
    yAxis: { type: 'value', min: -1.2, max: 1.2, name: 'y' },
    palette: ['#4a9eff', '#ff4ab0', '#6bff4a', '#ffa04a'],
    animation: { duration: 300, easing: 'cubicOut' },
    legend: { show: true, position: 'top' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'line',
        name: `Series 1: ${getFormatLabel(series1Format)}`,
        data: getSeries1Data(),
        color: '#4a9eff',
        lineStyle: { width: 2, opacity: 0.9 },
        sampling: 'lttb', // Enable sampling for smooth 60 FPS
        samplingThreshold: 5000,
      },
      {
        type: 'line',
        name: 'Series 2: InterleavedXYData (with subarray)',
        data: series2Data,
        color: '#ff4ab0',
        lineStyle: { width: 2, opacity: 0.9 },
        sampling: 'lttb',
        samplingThreshold: 5000,
      },
      {
        type: 'line',
        name: 'Series 3: Streaming (InterleavedXYData)',
        data: new Float32Array(0), // Start empty
        color: '#6bff4a',
        lineStyle: { width: 2, opacity: 0.9 },
        sampling: 'none', // No sampling for streaming
      },
      {
        type: 'scatter',
        name: 'Series 4: Streaming (XYArraysData with size)',
        data: { x: new Float32Array(0), y: new Float32Array(0), size: new Float32Array(0) }, // Start empty
        color: 'rgba(255, 160, 74, 0.7)',
        symbolSize: 4,
      },
    ],
  };

  const chart = await ChartGPU.create(container, options);

  // Streaming state
  let isStreaming = false;
  let streamingIntervalId: number | null = null;
  let currentX = X_DOMAIN_MAX; // Start after static data
  let totalAppendedPoints = 0;

  const streamToggleButton = document.getElementById('streamToggle') as HTMLButtonElement;
  const appendedCountSpan = document.getElementById('appendedCount') as HTMLSpanElement;

  // FPS tracking state
  let fpsAnimationFrameId: number | null = null;
  let frameCount = 0;
  let lastFPSUpdate = performance.now();
  const fpsCounterSpan = document.getElementById('fpsCounter') as HTMLSpanElement;

  const updateAppendedCount = () => {
    if (appendedCountSpan) {
      appendedCountSpan.textContent = totalAppendedPoints.toString();
    }
  };

  // FPS tracking loop using requestAnimationFrame
  const trackFPS = () => {
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFPSUpdate;

    // Update FPS display approximately once per second
    if (elapsed >= 1000) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      if (fpsCounterSpan) {
        fpsCounterSpan.textContent = fps.toString();
      }
      frameCount = 0;
      lastFPSUpdate = now;
    }

    fpsAnimationFrameId = requestAnimationFrame(trackFPS);
  };

  const startStreaming = () => {
    if (isStreaming) return;
    isStreaming = true;
    if (streamToggleButton) {
      streamToggleButton.textContent = 'Stop Streaming';
      streamToggleButton.classList.add('active');
    }

    streamingIntervalId = window.setInterval(() => {
      // Generate interleaved data for series 3 (line)
      const interleavedData = new Float32Array(STREAMING_BATCH_SIZE * 2);
      for (let i = 0; i < STREAMING_BATCH_SIZE; i++) {
        const x = currentX + (i / STREAMING_BATCH_SIZE) * 0.5; // Monotonically increasing
        const y = Math.sin(x * 2) * 0.6; // Different frequency than static series
        interleavedData[i * 2] = x;
        interleavedData[i * 2 + 1] = y;
      }

      // Generate XYArrays data with size for series 4 (scatter)
      const xData = new Float32Array(STREAMING_BATCH_SIZE);
      const yData = new Float32Array(STREAMING_BATCH_SIZE);
      const sizeData = new Float32Array(STREAMING_BATCH_SIZE);
      for (let i = 0; i < STREAMING_BATCH_SIZE; i++) {
        const x = currentX + (i / STREAMING_BATCH_SIZE) * 0.5; // Same x as line series
        const y = Math.cos(x * 1.5) * 0.7; // Cosine wave
        // Varying size based on position (larger at peaks)
        const sizeVariation = Math.abs(Math.sin(x * 3)) * 8 + 2; // Range: 2-10
        xData[i] = x;
        yData[i] = y;
        sizeData[i] = sizeVariation;
      }

      // Append to both streaming series
      chart.appendData(2, interleavedData); // Series 3: line with InterleavedXYData
      chart.appendData(3, { x: xData, y: yData, size: sizeData }); // Series 4: scatter with size

      currentX += 0.5; // Advance x for next batch
      totalAppendedPoints += STREAMING_BATCH_SIZE;
      updateAppendedCount();
    }, STREAMING_INTERVAL_MS);
  };

  const stopStreaming = () => {
    if (!isStreaming) return;
    isStreaming = false;
    if (streamingIntervalId !== null) {
      window.clearInterval(streamingIntervalId);
      streamingIntervalId = null;
    }
    if (streamToggleButton) {
      streamToggleButton.textContent = 'Start Streaming';
      streamToggleButton.classList.remove('active');
    }
  };

  if (streamToggleButton) {
    streamToggleButton.addEventListener('click', () => {
      if (isStreaming) {
        stopStreaming();
      } else {
        startStreaming();
      }
    });
  }

  // Setup format toggle listeners
  const radioButtons = document.querySelectorAll<HTMLInputElement>('input[name="series1-format"]');
  radioButtons.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      
      const newFormat = radio.value as typeof series1Format;
      if (newFormat === series1Format) return;
      
      // Prevent format switching during streaming (would lose accumulated data)
      if (isStreaming) {
        alert('Stop streaming before changing data formats.');
        // Revert radio selection
        const currentRadio = document.querySelector<HTMLInputElement>(`input[name="series1-format"][value="${series1Format}"]`);
        if (currentRadio) currentRadio.checked = true;
        return;
      }
      
      series1Format = newFormat;
      
      // Update chart with new data format
      // Safe to replace all series since streaming is stopped
      chart.setOption({
        series: [
          {
            type: 'line',
            name: `Series 1: ${getFormatLabel(series1Format)}`,
            data: getSeries1Data(),
            color: '#4a9eff',
            lineStyle: { width: 2, opacity: 0.9 },
            sampling: 'lttb',
            samplingThreshold: 5000,
          },
          {
            type: 'line',
            name: 'Series 2: InterleavedXYData (with subarray)',
            data: series2Data,
            color: '#ff4ab0',
            lineStyle: { width: 2, opacity: 0.9 },
            sampling: 'lttb',
            samplingThreshold: 5000,
          },
          {
            type: 'line',
            name: 'Series 3: Streaming (InterleavedXYData)',
            data: new Float32Array(0), // Reset streaming data
            color: '#6bff4a',
            lineStyle: { width: 2, opacity: 0.9 },
            sampling: 'none',
          },
          {
            type: 'scatter',
            name: 'Series 4: Streaming (XYArraysData with size)',
            data: { x: new Float32Array(0), y: new Float32Array(0), size: new Float32Array(0) }, // Reset streaming data
            color: 'rgba(255, 160, 74, 0.7)',
            symbolSize: 4,
          },
        ],
      });
      
      // Reset streaming state after format change
      currentX = X_DOMAIN_MAX;
      totalAppendedPoints = 0;
      updateAppendedCount();
    });
  });

  // Handle window resize
  let scheduled = false;
  const ro = new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      chart.resize();
    });
  });
  ro.observe(container);

  // Initial sizing
  chart.resize();

  // Start FPS tracking
  trackFPS();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopStreaming();
    if (fpsAnimationFrameId !== null) {
      cancelAnimationFrame(fpsAnimationFrameId);
      fpsAnimationFrameId = null;
    }
    ro.disconnect();
    chart.dispose();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    main().catch((err) => {
      console.error(err);
      showError(err instanceof Error ? err.message : String(err));
    });
  });
} else {
  main().catch((err) => {
    console.error(err);
    showError(err instanceof Error ? err.message : String(err));
  });
}
