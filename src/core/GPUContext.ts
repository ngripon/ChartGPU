/**
 * GPUContext - WebGPU device and adapter management
 * 
 * Handles WebGPU initialization, adapter selection, and device creation
 * following WebGPU best practices for resource management and error handling.
 */

/**
 * GPUContext manages WebGPU adapter and device initialization.
 * Provides a clean API for creating and managing GPU resources.
 */
export class GPUContext {
  private _adapter: GPUAdapter | null = null;
  private _device: GPUDevice | null = null;
  private _initialized: boolean = false;

  /**
   * Gets the WebGPU adapter, or null if not initialized.
   */
  get adapter(): GPUAdapter | null {
    return this._adapter;
  }

  /**
   * Gets the WebGPU device, or null if not initialized.
   */
  get device(): GPUDevice | null {
    return this._device;
  }

  /**
   * Checks if the context has been initialized.
   */
  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initializes the WebGPU context by requesting an adapter and device.
   * 
   * @throws {Error} If WebGPU is not available in the browser
   * @throws {Error} If adapter request fails
   * @throws {Error} If device request fails
   * @throws {Error} If already initialized
   */
  async initialize(): Promise<void> {
    if (this._initialized) {
      throw new Error('GPUContext is already initialized. Call destroy() before reinitializing.');
    }

    // Check for WebGPU support
    if (!navigator.gpu) {
      throw new Error(
        'WebGPU is not available in this browser. ' +
        'Please use a browser that supports WebGPU (Chrome 113+, Edge 113+, or Safari 18+). ' +
        'Ensure WebGPU is enabled in browser flags if needed.'
      );
    }

    try {
      // Request adapter with high-performance preference
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!adapter) {
        throw new Error(
          'Failed to request WebGPU adapter. ' +
          'No compatible adapter found. This may occur if no GPU is available or WebGPU is disabled.'
        );
      }

      this._adapter = adapter;

      // Request device from adapter
      const device = await adapter.requestDevice();

      if (!device) {
        this._adapter = null;
        throw new Error('Failed to request WebGPU device from adapter.');
      }

      this._device = device;

      // Set up device lost handler for error recovery
      device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => {
        console.error('WebGPU uncaptured error:', event.error);
      });

      this._initialized = true;
    } catch (error) {
      // Clean up on failure
      this._adapter = null;
      this._device = null;
      this._initialized = false;

      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to initialize GPUContext: ${String(error)}`);
    }
  }

  /**
   * Static factory method to create and initialize a GPUContext instance.
   * 
   * @returns A fully initialized GPUContext instance
   * @throws {Error} If initialization fails
   * 
   * @example
   * ```typescript
   * const context = await GPUContext.create();
   * const device = context.device;
   * ```
   */
  static async create(): Promise<GPUContext> {
    const context = new GPUContext();
    await context.initialize();
    return context;
  }

  /**
   * Destroys the WebGPU device and cleans up resources.
   * After calling destroy(), the context must be reinitialized before use.
   */
  destroy(): void {
    if (this._device) {
      try {
        this._device.destroy();
      } catch (error) {
        console.warn('Error destroying GPU device:', error);
      }
    }

    this._device = null;
    this._adapter = null;
    this._initialized = false;
  }
}
