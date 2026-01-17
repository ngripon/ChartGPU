import { GPUContext } from '../../src/index';

/**
 * Hello World example - Clear screen to dark purple
 * 
 * This example demonstrates the basic WebGPU pipeline by clearing
 * the canvas to a solid color (#1a1a2e).
 */

async function main() {
  // Get canvas element
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  let context: GPUContext | null = null;
  let animationFrameId: number | null = null;

  try {
    // Create and initialize GPU context
    context = await GPUContext.create(canvas);

    // Dark purple color (#1a1a2e) converted to normalized RGBA
    const r = 0x1a / 255;
    const g = 0x1a / 255;
    const b = 0x2e / 255;
    const a = 1.0;

    // Render loop
    function render() {
      if (!context) return;
      
      // Clear screen to dark purple
      context.clearScreen(r, g, b, a);
      
      // Continue rendering
      animationFrameId = requestAnimationFrame(render);
    }

    // Start render loop
    render();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (context) {
        context.destroy();
      }
    });
  } catch (error) {
    console.error('Failed to initialize WebGPU:', error);
    if (error instanceof Error) {
      alert(`WebGPU Error: ${error.message}`);
    } else {
      alert('Failed to initialize WebGPU. Please check browser compatibility.');
    }
    // Clean up on error
    if (context) {
      context.destroy();
    }
  }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
