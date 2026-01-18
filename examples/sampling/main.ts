import { ChartGPU, resolveOptions } from '../../src/index';
import type { ChartGPUInstance, ChartGPUOptions, DataPoint, ScatterPointTuple, SeriesSampling } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

const mulberry32 = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const formatInt = (n: number): string => new Intl.NumberFormat(undefined).format(Math.max(0, Math.floor(n)));

const setText = (id: string, text: string): void => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
};

const createLineData = (count: number): ReadonlyArray<DataPoint> => {
  const n = Math.max(2, Math.floor(count));
  const out: DataPoint[] = new Array(n);

  // Sorted increasing x by construction.
  for (let i = 0; i < n; i++) {
    const x = i;
    const t = i * 0.004;
    const y =
      Math.sin(t) +
      0.35 * Math.sin(t * 0.13) +
      0.12 * Math.sin(t * 2.1);
    out[i] = [x, y] as const;
  }

  // Add a single large outlier to demonstrate: axis bounds use raw data.
  const outlierIndex = Math.min(n - 1, Math.max(0, Math.floor(n * 0.62)));
  out[outlierIndex] = [outlierIndex, 8.5] as const;

  return out;
};

const createScatterData = (count: number, seed: number): ReadonlyArray<ScatterPointTuple> => {
  const n = Math.max(0, Math.floor(count));
  const rng = mulberry32(seed);
  const out: ScatterPointTuple[] = new Array(n);

  // Two soft clusters so the density reduction is obvious when sampling kicks in.
  for (let i = 0; i < n; i++) {
    const cluster = rng() < 0.6 ? 0 : 1;
    const cx = cluster === 0 ? 28 : 72;
    const cy = cluster === 0 ? 62 : 34;

    const x = cx + (rng() - 0.5) * 26 + (rng() - 0.5) * 8;
    const y = cy + (rng() - 0.5) * 26 + (rng() - 0.5) * 8;

    // Size is meaningful for scatter rendering (radius in CSS px).
    // This example is specifically interested in `sampling: 'average'` preserving the size channel.
    const size = 1.25 + rng() * 7.75;
    out[i] = [x, y, size] as const;
  }

  // Interaction utilities assume increasing-x order for efficient lookups.
  out.sort((a, b) => a[0] - b[0]);
  return out;
};

const attachCoalescedResizeObserver = (
  containers: ReadonlyArray<HTMLElement>,
  charts: ReadonlyArray<ChartGPUInstance>
): ResizeObserver => {
  let rafId: number | null = null;
  const schedule = (): void => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      for (const chart of charts) chart.resize();
    });
  };

  const ro = new ResizeObserver(() => schedule());
  for (const el of containers) ro.observe(el);
  return ro;
};

const normalizeSamplingMode = (value: string | null): SeriesSampling => {
  switch (value) {
    case 'none':
    case 'lttb':
    case 'average':
    case 'max':
    case 'min':
      return value;
    default:
      return 'lttb';
  }
};

const normalizeThreshold = (value: string | null): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5000;
  return Math.max(2, Math.floor(n));
};

type SamplingControls = Readonly<{
  mode: SeriesSampling;
  threshold: number;
}>;

const createLineOptions = (
  data: ReadonlyArray<DataPoint>,
  controls: SamplingControls | null
): ChartGPUOptions => ({
  grid: { left: 70, right: 24, top: 24, bottom: 46 },
  xAxis: { type: 'value', name: 'Index' },
  yAxis: { type: 'value', name: 'Value' },
  palette: ['#4a9eff'],
  series: [
    {
      type: 'line',
      name: 'line (100k)',
      data,
      color: '#4a9eff',
      lineStyle: { width: 2, opacity: 1 },
      ...(controls
        ? { sampling: controls.mode, samplingThreshold: controls.threshold }
        : {
            // Intentionally omit sampling fields on first render so defaults apply.
          }),
    },
  ],
});

const createScatterOptions = (
  data: ReadonlyArray<ScatterPointTuple>,
  controls: SamplingControls | null
): ChartGPUOptions => ({
  grid: { left: 70, right: 24, top: 24, bottom: 46 },
  xAxis: { type: 'value', min: 0, max: 100, name: 'X' },
  yAxis: { type: 'value', min: 0, max: 100, name: 'Y' },
  palette: ['#ff4ab0'],
  series: [
    {
      type: 'scatter',
      name: 'scatter (size in [x,y,size])',
      data,
      color: '#ff4ab0',
      // Fallback only; per-point size takes precedence.
      symbolSize: 2,
      ...(controls
        ? { sampling: controls.mode, samplingThreshold: controls.threshold }
        : {
            // Intentionally set sampling to a non-default per-series value on first render.
            sampling: 'average',
            // Omit threshold so defaultThreshold applies (5000).
          }),
    },
  ],
});

const updateReadouts = (
  lineUser: ChartGPUOptions,
  scatterUser: ChartGPUOptions,
  lineRawCount: number,
  scatterRawCount: number
): void => {
  const lineResolved = resolveOptions(lineUser);
  const scatterResolved = resolveOptions(scatterUser);

  const lineSeries = lineResolved.series[0];
  const scatterSeries = scatterResolved.series[0];

  setText('lineRaw', formatInt(lineRawCount));
  setText('lineRendered', formatInt(lineSeries?.data?.length ?? 0));
  setText('lineMode', lineSeries && 'sampling' in lineSeries ? String(lineSeries.sampling) : '—');
  setText('lineThreshold', lineSeries && 'samplingThreshold' in lineSeries ? formatInt(lineSeries.samplingThreshold) : '—');

  setText('scatterRaw', formatInt(scatterRawCount));
  setText('scatterRendered', formatInt(scatterSeries?.data?.length ?? 0));
  setText('scatterMode', scatterSeries && 'sampling' in scatterSeries ? String(scatterSeries.sampling) : '—');
  setText(
    'scatterThreshold',
    scatterSeries && 'samplingThreshold' in scatterSeries ? formatInt(scatterSeries.samplingThreshold) : '—'
  );
};

async function main(): Promise<void> {
  const lineContainer = document.getElementById('chart-line');
  const scatterContainer = document.getElementById('chart-scatter');
  if (!(lineContainer instanceof HTMLElement) || !(scatterContainer instanceof HTMLElement)) {
    throw new Error('Chart containers not found');
  }

  const modeEl = document.getElementById('samplingMode');
  const thresholdEl = document.getElementById('samplingThreshold');
  const applyEl = document.getElementById('apply');

  if (!(modeEl instanceof HTMLSelectElement)) throw new Error('Sampling mode control not found');
  if (!(thresholdEl instanceof HTMLInputElement)) throw new Error('Sampling threshold control not found');
  if (!(applyEl instanceof HTMLButtonElement)) throw new Error('Apply button not found');

  // UI defaults: match documented defaults.
  modeEl.value = 'lttb';
  thresholdEl.value = '5000';

  const lineData = createLineData(100_000);
  const scatterData = createScatterData(60_000, 2);

  // First render:
  // - line series omits sampling fields -> defaults apply
  // - scatter series explicitly uses sampling: 'average' (per-series override), but omits threshold -> default applies
  let lineUserOptions: ChartGPUOptions = createLineOptions(lineData, null);
  let scatterUserOptions: ChartGPUOptions = createScatterOptions(scatterData, null);

  const lineChart = await ChartGPU.create(lineContainer, lineUserOptions);
  const scatterChart = await ChartGPU.create(scatterContainer, scatterUserOptions);

  const ro = attachCoalescedResizeObserver([lineContainer, scatterContainer], [lineChart, scatterChart]);

  // Initial sizing/render.
  lineChart.resize();
  scatterChart.resize();

  updateReadouts(lineUserOptions, scatterUserOptions, lineData.length, scatterData.length);

  const apply = (): void => {
    const controls: SamplingControls = {
      mode: normalizeSamplingMode(modeEl.value),
      threshold: normalizeThreshold(thresholdEl.value),
    };

    lineUserOptions = createLineOptions(lineData, controls);
    scatterUserOptions = createScatterOptions(scatterData, controls);

    lineChart.setOption(lineUserOptions);
    scatterChart.setOption(scatterUserOptions);

    updateReadouts(lineUserOptions, scatterUserOptions, lineData.length, scatterData.length);
  };

  applyEl.addEventListener('click', apply);
  thresholdEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply();
  });

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    ro.disconnect();
    lineChart.dispose();
    scatterChart.dispose();
  };

  window.addEventListener('beforeunload', cleanup);
  import.meta.hot?.dispose(cleanup);
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

