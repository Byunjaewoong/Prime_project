const CELLS_PER_PX = 0.133;
const MIN_GRID = 64;
const MAX_GRID = 512;
const REFERENCE_LONG_EDGE = 1920;
const MAX_OUTPUT_PIXELS = 3840 * 2160;

export function vortexResolution(width: number, height: number, dpr: number) {
  const inputScale = Math.min(1, REFERENCE_LONG_EDGE / Math.max(width, height));
  const outputScale = Math.min(Math.max(1, dpr), Math.sqrt(MAX_OUTPUT_PIXELS / (width * height)));
  return {
    gridW: Math.max(MIN_GRID, Math.min(MAX_GRID, Math.round(width * CELLS_PER_PX * inputScale))),
    gridH: Math.max(MIN_GRID, Math.min(MAX_GRID, Math.round(height * CELLS_PER_PX * inputScale))),
    inputScale,
    outputW: Math.max(1, Math.round(width * outputScale)),
    outputH: Math.max(1, Math.round(height * outputScale)),
  };
}
