/**
 * RenderScheduler - 60fps render loop management
 * 
 * Manages a requestAnimationFrame-based render loop that runs at 60fps,
 * providing delta time tracking and frame scheduling control.
 * 
 * This module provides both functional and class-based APIs for maximum flexibility.
 * The functional API is preferred for better type safety and immutability.
 */

/**
 * Callback function type for render frames.
 * Receives delta time in milliseconds since the last frame.
 */
export type RenderCallback = (deltaTime: number) => void;

/**
 * Represents the state of a render scheduler.
 * All properties are readonly to ensure immutability.
 */
export interface RenderSchedulerState {
  readonly id: symbol;
  readonly running: boolean;
}

/**
 * Internal mutable state for the render scheduler.
 * Stored separately from the public state interface.
 */
interface RenderSchedulerInternalState {
  rafId: number | null;
  callback: RenderCallback | null;
  lastFrameTime: number;
  dirty: boolean;
}

/**
 * Map to store internal mutable state for each scheduler state instance.
 * Keyed by the state's unique ID symbol.
 */
const internalStateMap = new Map<symbol, RenderSchedulerInternalState>();

/**
 * Creates a new RenderScheduler state with initial values.
 * 
 * @returns A new RenderSchedulerState instance
 */
export function createRenderScheduler(): RenderSchedulerState {
  const id = Symbol('RenderScheduler');
  const state: RenderSchedulerState = {
    id,
    running: false,
  };

  // Initialize internal mutable state
  internalStateMap.set(id, {
    rafId: null,
    callback: null,
    lastFrameTime: 0,
    dirty: false,
  });

  return state;
}

/**
 * Starts the render loop.
 * 
 * Begins a requestAnimationFrame loop that calls the provided callback
 * every frame with the delta time in milliseconds since the last frame.
 * Returns a new state object with running set to true.
 * 
 * @param state - The scheduler state to start
 * @param callback - Function to call each frame with delta time
 * @returns A new RenderSchedulerState with running set to true
 * @throws {Error} If callback is not provided
 * @throws {Error} If scheduler is already running
 * @throws {Error} If state is invalid
 */
export function startRenderScheduler(
  state: RenderSchedulerState,
  callback: RenderCallback
): RenderSchedulerState {
  if (!callback) {
    throw new Error('Render callback is required');
  }

  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    throw new Error('Invalid scheduler state. Use createRenderScheduler() to create a new state.');
  }

  if (state.running) {
    throw new Error('RenderScheduler is already running. Call stopRenderScheduler() before starting again.');
  }

  // Update internal state
  internalState.callback = callback;
  internalState.lastFrameTime = performance.now();
  internalState.dirty = true;

  const schedulerId = state.id;
  const frameHandler = (currentTime: number) => {
    // Look up internal state - may be null if scheduler was destroyed
    const currentInternalState = internalStateMap.get(schedulerId);
    if (!currentInternalState || !currentInternalState.callback) {
      // Scheduler was stopped or destroyed, exit gracefully
      return;
    }

    const deltaTime = currentTime - currentInternalState.lastFrameTime;
    currentInternalState.lastFrameTime = currentTime;

    // Future optimization: skip render if not dirty
    // Currently always renders, but dirty flag is tracked for future use
    if (currentInternalState.dirty) {
      // Reset dirty flag after checking (for future frame-skipping optimization)
      currentInternalState.dirty = false;
    }

    // Call the render callback with delta time
    currentInternalState.callback(deltaTime);

    // Continue the loop if still running
    // Re-check internal state in case it was destroyed during callback execution
    const nextInternalState = internalStateMap.get(schedulerId);
    if (nextInternalState && nextInternalState.callback) {
      nextInternalState.rafId = requestAnimationFrame(frameHandler);
    }
  };

  // Start the first frame
  internalState.rafId = requestAnimationFrame(frameHandler);

  // Return new state with running set to true
  return {
    id: state.id,
    running: true,
  };
}

/**
 * Stops the render loop.
 * 
 * Cancels any pending requestAnimationFrame calls and stops the loop.
 * Returns a new state object with running set to false.
 * The scheduler can be restarted by calling startRenderScheduler() again.
 * 
 * @param state - The scheduler state to stop
 * @returns A new RenderSchedulerState with running set to false
 * @throws {Error} If state is invalid
 */
export function stopRenderScheduler(state: RenderSchedulerState): RenderSchedulerState {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    throw new Error('Invalid scheduler state. Use createRenderScheduler() to create a new state.');
  }

  internalState.callback = null;

  if (internalState.rafId !== null) {
    cancelAnimationFrame(internalState.rafId);
    internalState.rafId = null;
  }

  // Return new state with running set to false
  return {
    id: state.id,
    running: false,
  };
}

/**
 * Marks the current frame as dirty, indicating it needs to be rendered.
 * 
 * This function is prepared for future optimization where frames can be
 * skipped if nothing has changed. Currently, all frames render regardless
 * of the dirty flag.
 * 
 * @param state - The scheduler state
 * @throws {Error} If state is invalid
 */
export function requestRender(state: RenderSchedulerState): void {
  const internalState = internalStateMap.get(state.id);
  if (!internalState) {
    throw new Error('Invalid scheduler state. Use createRenderScheduler() to create a new state.');
  }

  // Mark as dirty even if not running (for future use when scheduler starts)
  internalState.dirty = true;
}

/**
 * Destroys the render scheduler and cleans up resources.
 * Stops the loop if running and removes internal state from the map.
 * Returns a new state object with reset values.
 * After calling this, the scheduler must be recreated before use.
 * 
 * **Important:** Always call this function when done with a scheduler to prevent memory leaks.
 * The internal state map will retain entries until explicitly destroyed.
 * 
 * @param state - The scheduler state to destroy
 * @returns A new RenderSchedulerState with reset values
 */
export function destroyRenderScheduler(state: RenderSchedulerState): RenderSchedulerState {
  const internalState = internalStateMap.get(state.id);
  
  if (internalState) {
    // Stop the loop if running
    if (internalState.rafId !== null) {
      cancelAnimationFrame(internalState.rafId);
      internalState.rafId = null;
    }
    
    // Clear callback to prevent further execution
    internalState.callback = null;
    
    // Clean up internal state from map to prevent memory leak
    internalStateMap.delete(state.id);
  }

  // Return new state with reset values
  return createRenderScheduler();
}

/**
 * Convenience function that creates a scheduler and starts it in one step.
 * 
 * @param callback - Function to call each frame with delta time
 * @returns A RenderSchedulerState with the loop running
 * @throws {Error} If callback is not provided
 * 
 * @example
 * ```typescript
 * const scheduler = createRenderSchedulerAsync((deltaTime) => {
 *   renderFrame(deltaTime);
 * });
 * ```
 */
export function createRenderSchedulerAsync(callback: RenderCallback): RenderSchedulerState {
  const state = createRenderScheduler();
  return startRenderScheduler(state, callback);
}

/**
 * RenderScheduler class wrapper for backward compatibility.
 * 
 * This class provides a class-based API that internally uses the functional implementation.
 * Use the functional API directly for better type safety and immutability.
 */
export class RenderScheduler {
  private _state: RenderSchedulerState;

  /**
   * Checks if the scheduler is currently running.
   */
  get running(): boolean {
    return this._state.running;
  }

  /**
   * Creates a new RenderScheduler instance.
   */
  constructor() {
    this._state = createRenderScheduler();
  }

  /**
   * Starts the render loop.
   * 
   * @param callback - Function to call each frame with delta time
   * @throws {Error} If callback is not provided or scheduler already running
   */
  start(callback: RenderCallback): void {
    this._state = startRenderScheduler(this._state, callback);
  }

  /**
   * Stops the render loop.
   */
  stop(): void {
    this._state = stopRenderScheduler(this._state);
  }

  /**
   * Marks the current frame as dirty, indicating it needs to be rendered.
   */
  requestRender(): void {
    requestRender(this._state);
  }

  /**
   * Destroys the render scheduler and cleans up resources.
   * After calling destroy(), the scheduler must be recreated before use.
   */
  destroy(): void {
    this._state = destroyRenderScheduler(this._state);
  }
}
