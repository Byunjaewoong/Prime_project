// app/works/vortex/core/Renderer.ts
// Renders fluid dye fields via offscreen canvas + browser GPU upscaling

export class Renderer {
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private imageData!: ImageData;
  private pixels!: Uint8ClampedArray;
  private gw = 0;
  private gh = 0;

  constructor() {
    this.offCanvas = document.createElement("canvas");
    this.offCtx = this.offCanvas.getContext("2d")!;
  }

  render(
    ctx: CanvasRenderingContext2D,
    gridW: number,
    gridH: number,
    stride: number,
    dR: Float64Array,
    dG: Float64Array,
    dB: Float64Array,
    canvasW: number,
    canvasH: number
  ): void {
    if (this.gw !== gridW || this.gh !== gridH) {
      this.gw = gridW;
      this.gh = gridH;
      this.offCanvas.width = gridW;
      this.offCanvas.height = gridH;
      this.imageData = this.offCtx.createImageData(gridW, gridH);
      this.pixels = this.imageData.data;
    }

    const pixels = this.pixels;

    for (let j = 0; j < gridH; j++) {
      for (let i = 0; i < gridW; i++) {
        const gridIdx = (i + 1) + stride * (j + 1);
        const off = (j * gridW + i) * 4;

        const r = dR[gridIdx];
        const g = dG[gridIdx];
        const b = dB[gridIdx];

        pixels[off]     = r >= 1 ? 255 : r <= 0 ? 0 : (255 * Math.pow(r, 0.85)) | 0;
        pixels[off + 1] = g >= 1 ? 255 : g <= 0 ? 0 : (255 * Math.pow(g, 0.85)) | 0;
        pixels[off + 2] = b >= 1 ? 255 : b <= 0 ? 0 : (255 * Math.pow(b, 0.85)) | 0;
        pixels[off + 3] = 255;
      }
    }

    this.offCtx.putImageData(this.imageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.offCanvas, 0, 0, canvasW, canvasH);
  }
}
