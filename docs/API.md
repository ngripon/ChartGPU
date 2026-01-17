# API Reference

## GPUContext

The `GPUContext` class provides a clean interface for initializing and managing WebGPU resources. It handles adapter selection, device creation, and resource cleanup following WebGPU best practices.

See [GPUContext.ts](../src/core/GPUContext.ts) for the complete implementation.

### Constructor

Creates a new GPUContext instance. The context is not initialized until `initialize()` is called.

### Static Methods

#### `GPUContext.create()`

Factory method that creates a new `GPUContext` instance and initializes it. This is the recommended way to create a GPUContext.

**Returns:** Promise that resolves to a fully initialized `GPUContext` instance

**Throws:** `Error` if initialization fails (see `initialize()` for error details)

### Properties

#### `adapter`

Returns the WebGPU adapter instance, or `null` if the context has not been initialized.

The adapter represents a physical GPU or software implementation and is used to request devices.

#### `device`

Returns the WebGPU device instance, or `null` if the context has not been initialized.

The device is the primary interface for creating GPU resources like buffers, textures, and pipelines.

#### `initialized`

Returns `true` if the context has been successfully initialized, `false` otherwise.

### Instance Methods

#### `initialize()`

Initializes the WebGPU context by:
1. Checking for WebGPU availability (`navigator.gpu`)
2. Requesting an adapter with `powerPreference: 'high-performance'`
3. Requesting a device from the adapter
4. Setting up error handlers

**Returns:** Promise that resolves when initialization completes

**Throws:**
- `Error` - If WebGPU is not available in the browser. The error message includes guidance on supported browsers and enabling WebGPU.
- `Error` - If adapter request fails (no compatible adapter found)
- `Error` - If device request fails
- `Error` - If the context is already initialized (call `destroy()` first)

**Error Messages:**

- **WebGPU not available:** "WebGPU is not available in this browser. Please use a browser that supports WebGPU (Chrome 113+, Edge 113+, or Safari 18+). Ensure WebGPU is enabled in browser flags if needed."

- **Adapter request failed:** "Failed to request WebGPU adapter. No compatible adapter found. This may occur if no GPU is available or WebGPU is disabled."

- **Device request failed:** "Failed to request WebGPU device from adapter."

- **Already initialized:** "GPUContext is already initialized. Call destroy() before reinitializing."

**Note:** The method automatically sets up an `uncapturederror` event listener on the device to log WebGPU errors to the console.

#### `destroy()`

Destroys the WebGPU device and cleans up all resources. After calling `destroy()`, the context must be reinitialized with `initialize()` before it can be used again.

This method:
- Calls `device.destroy()` if a device exists
- Sets `adapter` and `device` to `null`
- Resets the `initialized` flag to `false`

**Note:** Errors during device destruction are caught and logged as warnings but do not throw.

## Error Handling

### WebGPU Availability Check

Before initializing, check if WebGPU is available by verifying `navigator.gpu` exists. The `initialize()` method performs this check automatically and throws a descriptive error if WebGPU is unavailable.

### Initialization Errors

Wrap initialization in try-catch to handle errors gracefully. The error messages are descriptive and indicate the specific failure reason (WebGPU unavailable, adapter failure, device failure, or already initialized).

### Device Lost Recovery

The GPUContext automatically sets up error handlers for uncaptured errors. For additional recovery logic, you can listen to the device's `uncapturederror` event directly.

## Best Practices

### Resource Management

Always call `destroy()` when done with a GPUContext to free GPU resources. Use try-finally blocks to ensure cleanup even if errors occur.

### Singleton Pattern

For applications that need a single GPU context throughout their lifetime, implement a singleton pattern that creates one context and reuses it.

### Adapter Selection

The GPUContext requests adapters with `powerPreference: 'high-performance'` by default. For power-sensitive applications, you may want to modify the implementation to use `'low-power'` or allow configuration.

## Type Definitions

All WebGPU types are provided by `@webgpu/types`. The GPUContext uses:

- `GPUAdapter` - WebGPU adapter interface
- `GPUDevice` - WebGPU device interface
- `GPUUncapturedErrorEvent` - Error event type

See the [source file](../src/core/GPUContext.ts) for type usage.

## Related Resources

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)
- [MDN WebGPU Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
