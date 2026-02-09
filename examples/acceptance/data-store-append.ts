/// <reference types="@webgpu/types" />

// TypeScript-only acceptance checks for createDataStore append behavior.
// This file is excluded from the library build (tsconfig excludes `examples/`).
//
// Intent: validate that appendSeries correctly handles fast path (no reallocation)
// and slow path (reallocation), maintains pointCount and hash32 correctness.

import { createDataStore } from '../../src/data/createDataStore';
import type { DataPoint } from '../../src/config/types';

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

/**
 * WriteBuffer call record for tracking GPU uploads.
 */
type WriteBufferCall = {
  buffer: GPUBuffer;
  bufferOffset: number;
  dataOffset: number;
  size: number;
};

/**
 * Minimal fake GPUDevice for Node.js acceptance tests.
 * Implements only the subset of GPUDevice needed for createDataStore.
 */
function createFakeDevice(trackWrites = false): { device: GPUDevice; writes: WriteBufferCall[]; getBufferData: (buffer: GPUBuffer) => Float32Array | null } {
  const buffers = new Map<GPUBuffer, { size: number; data: ArrayBuffer }>();
  const writes: WriteBufferCall[] = [];

  // Expose WebGPU constants needed by createDataStore
  const GPUBufferUsage = {
    VERTEX: 0x20,
    STORAGE: 0x80,
    COPY_DST: 0x08,
  };

  const device: GPUDevice = {
    limits: {
      maxBufferSize: 1024 * 1024 * 1024, // 1GB
    },
    createBuffer: (descriptor: GPUBufferDescriptor): GPUBuffer => {
      const size = descriptor.size ?? 0;
      const data = new ArrayBuffer(size);
      const buffer = {
        destroy: () => {
          buffers.delete(buffer as GPUBuffer);
        },
      } as GPUBuffer;
      buffers.set(buffer as GPUBuffer, { size, data });
      return buffer;
    },
    queue: {
      writeBuffer: (buffer: GPUBuffer, bufferOffset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void => {
        const entry = buffers.get(buffer);
        if (!entry) throw new Error('Buffer not found');
        
        const source = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const target = new Uint8Array(entry.data);
        const actualSize = size ?? source.byteLength;
        const actualDataOffset = dataOffset ?? 0;
        
        if (trackWrites) {
          writes.push({ buffer, bufferOffset, dataOffset: actualDataOffset, size: actualSize });
        }
        
        if (bufferOffset + actualSize > entry.size) {
          throw new Error(`writeBuffer: offset ${bufferOffset} + size ${actualSize} exceeds buffer size ${entry.size}`);
        }
        
        for (let i = 0; i < actualSize; i++) {
          target[bufferOffset + i] = source[actualDataOffset + i]!;
        }
      },
    },
  } as GPUDevice;

  // Inject GPUBufferUsage into global scope for createDataStore to access
  (globalThis as unknown as { GPUBufferUsage: typeof GPUBufferUsage }).GPUBufferUsage = GPUBufferUsage;

  const getBufferData = (buffer: GPUBuffer): Float32Array | null => {
    const entry = buffers.get(buffer);
    if (!entry) return null;
    return new Float32Array(entry.data);
  };

  return { device, writes, getBufferData };
}

// Fast path: append without reallocation
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  const initialData: DataPoint[] = [
    [0, 1],
    [1, 2],
    [2, 3],
  ];
  
  store.setSeries(0, initialData);
  assert(store.getSeriesPointCount(0) === 3, 'Expected initial pointCount=3');
  
  const appendData: DataPoint[] = [
    [3, 4],
    [4, 5],
  ];
  
  store.appendSeries(0, appendData);
  assert(store.getSeriesPointCount(0) === 5, 'Expected pointCount=5 after append');
}

// Slow path: append triggers reallocation
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  // Set initial data that fills buffer exactly (or nearly)
  const initialData: DataPoint[] = Array.from({ length: 10 }, (_, i) => [i, i * 2] as DataPoint);
  store.setSeries(0, initialData);
  
  const initialCount = store.getSeriesPointCount(0);
  assert(initialCount === 10, `Expected initial pointCount=10, got ${initialCount}`);
  
  // Append enough data to trigger reallocation
  const largeAppend: DataPoint[] = Array.from({ length: 100 }, (_, i) => [i + 10, (i + 10) * 2] as DataPoint);
  store.appendSeries(0, largeAppend);
  
  const finalCount = store.getSeriesPointCount(0);
  assert(finalCount === 110, `Expected final pointCount=110, got ${finalCount}`);
}

// Multiple appends: coalesce into single buffer update (fast path)
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, [[0, 0]]);
  
  // Multiple small appends should all succeed
  store.appendSeries(0, [[1, 1]]);
  store.appendSeries(0, [[2, 2]]);
  store.appendSeries(0, [[3, 3]]);
  
  assert(store.getSeriesPointCount(0) === 4, 'Expected pointCount=4 after multiple appends');
}

// Error case: append before setSeries should throw
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  let threw = false;
  try {
    store.appendSeries(0, [[1, 1]]);
  } catch (e) {
    threw = true;
    assert(
      e instanceof Error && e.message.includes('has no data'),
      `Expected error about missing series, got: ${e}`
    );
  }
  assert(threw, 'Expected appendSeries to throw when series not set');
}

// Hash consistency: hash should update incrementally on fast path
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  const data1: DataPoint[] = [[0, 1], [1, 2]];
  store.setSeries(0, data1);
  const initialCount = store.getSeriesPointCount(0);
  
  const append1: DataPoint[] = [[2, 3]];
  store.appendSeries(0, append1);
  
  // Fast path should preserve pointCount incrementally
  assert(store.getSeriesPointCount(0) === initialCount + 1, 'Expected pointCount incremented');
}

// Empty append should be no-op
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, [[0, 0], [1, 1]]);
  const initialCount = store.getSeriesPointCount(0);
  
  store.appendSeries(0, []);
  
  assert(store.getSeriesPointCount(0) === initialCount, 'Expected pointCount unchanged after empty append');
}

// Dispose cleanup
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, [[0, 0]]);
  store.dispose();
  
  let threw = false;
  try {
    store.getSeriesPointCount(0);
  } catch (e) {
    threw = true;
    assert(
      e instanceof Error && e.message.includes('disposed'),
      `Expected error about disposed store, got: ${e}`
    );
  }
  assert(threw, 'Expected operations to throw after dispose');
}

// ============================================================================
// CartesianSeriesData: XYArraysData format tests
// ============================================================================

// XYArraysData set: pointCount should be min(x.length, y.length)
{
  const { device, getBufferData } = createFakeDevice();
  const store = createDataStore(device);
  
  // Mismatched lengths: x has 3, y has 2, size has 3
  store.setSeries(0, { x: [0, 1, 2], y: [10, 11], size: [5, 6, 7] });
  
  assert(store.getSeriesPointCount(0) === 2, 'Expected pointCount=2 (min of x.length, y.length)');
  
  const buffer = store.getSeriesBuffer(0);
  const gpuData = getBufferData(buffer);
  assert(gpuData !== null, 'Expected buffer data');
  
  // Verify packed data: [x0, y0, x1, y1]
  assert(gpuData[0] === 0, 'Expected x0=0');
  assert(gpuData[1] === 10, 'Expected y0=10');
  assert(gpuData[2] === 1, 'Expected x1=1');
  assert(gpuData[3] === 11, 'Expected y1=11');
}

// XYArraysData append: pointCount increases by min lengths
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, { x: [0, 1], y: [10, 11] });
  assert(store.getSeriesPointCount(0) === 2, 'Expected initial pointCount=2');
  
  // Append with mismatched lengths
  store.appendSeries(0, { x: [2, 3, 4], y: [12, 13] });
  assert(store.getSeriesPointCount(0) === 4, 'Expected pointCount=4 after append (2 + min(3,2))');
}

// ============================================================================
// CartesianSeriesData: InterleavedXYData (typed array) format tests
// ============================================================================

// InterleavedXYData set with odd length: pointCount should be floor(len/2)
{
  const { device, getBufferData } = createFakeDevice();
  const store = createDataStore(device);
  
  // 5 elements => floor(5/2) = 2 points
  const interleaved = new Float32Array([0, 1, 2, 3, 4]);
  store.setSeries(0, interleaved);
  
  assert(store.getSeriesPointCount(0) === 2, 'Expected pointCount=2 (floor(5/2))');
  
  const buffer = store.getSeriesBuffer(0);
  const gpuData = getBufferData(buffer);
  assert(gpuData !== null, 'Expected buffer data');
  
  // Verify packed data: [x0, y0, x1, y1]
  assert(gpuData[0] === 0, 'Expected x0=0');
  assert(gpuData[1] === 1, 'Expected y0=1');
  assert(gpuData[2] === 2, 'Expected x1=2');
  assert(gpuData[3] === 3, 'Expected y1=3');
}

// InterleavedXYData set with even length
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  const interleaved = new Float32Array([0, 10, 1, 11, 2, 12]);
  store.setSeries(0, interleaved);
  
  assert(store.getSeriesPointCount(0) === 3, 'Expected pointCount=3');
}

// InterleavedXYData append
{
  const { device } = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, new Float32Array([0, 10, 1, 11]));
  assert(store.getSeriesPointCount(0) === 2, 'Expected initial pointCount=2');
  
  store.appendSeries(0, new Float32Array([2, 12, 3, 13, 4, 14]));
  assert(store.getSeriesPointCount(0) === 5, 'Expected pointCount=5 after append');
}

// ============================================================================
// Typed array view (subarray) correctness tests
// ============================================================================

// Subarray view in setSeries: should read from view slice, not underlying buffer start
{
  const { device, getBufferData } = createFakeDevice();
  const store = createDataStore(device);
  
  // Base buffer: [ignored, ignored, 0, 10, 1, 11]
  const base = new Float32Array([999, 888, 0, 10, 1, 11]);
  const view = base.subarray(2, 6); // [0, 10, 1, 11]
  
  store.setSeries(0, view);
  assert(store.getSeriesPointCount(0) === 2, 'Expected pointCount=2 from view');
  
  const buffer = store.getSeriesBuffer(0);
  const gpuData = getBufferData(buffer);
  assert(gpuData !== null, 'Expected buffer data');
  
  // Should pack from view (starting at index 2 of base), not base[0]
  assert(gpuData[0] === 0, 'Expected x0=0 (not 999)');
  assert(gpuData[1] === 10, 'Expected y0=10 (not 888)');
  assert(gpuData[2] === 1, 'Expected x1=1');
  assert(gpuData[3] === 11, 'Expected y1=11');
}

// Subarray view in appendSeries: should read from view slice
{
  const { device, getBufferData } = createFakeDevice();
  const store = createDataStore(device);
  
  store.setSeries(0, new Float32Array([0, 10]));
  assert(store.getSeriesPointCount(0) === 1, 'Expected initial pointCount=1');
  
  // Base buffer: [ignored, 1, 11, 2, 12]
  const base = new Float32Array([999, 1, 11, 2, 12]);
  const view = base.subarray(1, 5); // [1, 11, 2, 12]
  
  store.appendSeries(0, view);
  assert(store.getSeriesPointCount(0) === 3, 'Expected pointCount=3 after append');
  
  const buffer = store.getSeriesBuffer(0);
  const gpuData = getBufferData(buffer);
  assert(gpuData !== null, 'Expected buffer data');
  
  // First point from setSeries
  assert(gpuData[0] === 0, 'Expected x0=0');
  assert(gpuData[1] === 10, 'Expected y0=10');
  // Appended points from view
  assert(gpuData[2] === 1, 'Expected x1=1 (not 999)');
  assert(gpuData[3] === 11, 'Expected y1=11');
  assert(gpuData[4] === 2, 'Expected x2=2');
  assert(gpuData[5] === 12, 'Expected y2=12');
}

// ============================================================================
// writeBuffer call signature tracking tests
// ============================================================================

// Fast-path append: writeBuffer should use correct buffer offset and explicit dataOffset+size
{
  const { device, writes } = createFakeDevice(true);
  const store = createDataStore(device);
  
  // Set initial 10 points => 10 points * 8 bytes/point = 80 bytes
  // Geometric growth will allocate nextPow2(80) = 128 bytes capacity (16 points)
  const initial = new Float32Array(20); // 10 points
  for (let i = 0; i < 10; i++) {
    initial[i * 2] = i;
    initial[i * 2 + 1] = i * 10;
  }
  store.setSeries(0, initial);
  writes.length = 0; // Clear writes from setSeries
  
  // Append 2 points => total 12 points * 8 bytes = 96 bytes < 128 bytes capacity
  // This should hit the fast path
  store.appendSeries(0, new Float32Array([10, 100, 11, 110]));
  
  // Fast path should have written exactly once
  assert(writes.length === 1, `Expected 1 writeBuffer call, got ${writes.length}`);
  
  const write = writes[0]!;
  
  // bufferOffset should be prevPointCount * 2 floats * 4 bytes/float = 10 * 2 * 4 = 80 bytes
  assert(write.bufferOffset === 80, `Expected bufferOffset=80, got ${write.bufferOffset}`);
  
  // size should be 2 points * 2 floats * 4 bytes/float = 16 bytes
  assert(write.size === 16, `Expected size=16, got ${write.size}`);
  
  // dataOffset should be explicitly provided (subarray.byteOffset from staging buffer)
  assert(write.dataOffset !== undefined, 'Expected explicit dataOffset in writeBuffer call');
}

// Slow-path append (reallocation): writeBuffer should write full buffer
{
  const { device, writes } = createFakeDevice(true);
  const store = createDataStore(device);
  
  // Set initial 2 points
  store.setSeries(0, new Float32Array([0, 10, 1, 11]));
  writes.length = 0;
  
  // Append enough to trigger reallocation (100 points)
  const largeAppend = new Float32Array(200); // 100 points
  for (let i = 0; i < 100; i++) {
    largeAppend[i * 2] = i + 2;
    largeAppend[i * 2 + 1] = (i + 2) * 10;
  }
  store.appendSeries(0, largeAppend);
  
  // Slow path should have written once (full buffer after reallocation)
  assert(writes.length === 1, `Expected 1 writeBuffer call, got ${writes.length}`);
  
  const write = writes[0]!;
  
  // bufferOffset should be 0 (writing full buffer)
  assert(write.bufferOffset === 0, `Expected bufferOffset=0 (full rewrite), got ${write.bufferOffset}`);
  
  // size should be (2 + 100) points * 8 bytes/point = 816 bytes
  assert(write.size === 816, `Expected size=816, got ${write.size}`);
}

// XYArraysData with subarray-like typed arrays
{
  const { device, getBufferData } = createFakeDevice();
  const store = createDataStore(device);
  
  // Use Uint16Array view as x/y arrays
  const base = new Uint16Array([999, 0, 1, 2, 888, 10, 11, 12]);
  const xView = base.subarray(1, 4); // [0, 1, 2]
  const yView = base.subarray(5, 8); // [10, 11, 12]
  
  store.setSeries(0, { x: xView, y: yView });
  assert(store.getSeriesPointCount(0) === 3, 'Expected pointCount=3');
  
  const buffer = store.getSeriesBuffer(0);
  const gpuData = getBufferData(buffer);
  assert(gpuData !== null, 'Expected buffer data');
  
  // Should read from view slices, not base[0]
  assert(gpuData[0] === 0, 'Expected x0=0 (not 999)');
  assert(gpuData[1] === 10, 'Expected y0=10');
  assert(gpuData[2] === 1, 'Expected x1=1');
  assert(gpuData[3] === 11, 'Expected y1=11');
  assert(gpuData[4] === 2, 'Expected x2=2');
  assert(gpuData[5] === 12, 'Expected y2=12');
}

console.log('[acceptance:data-store-append] OK');
