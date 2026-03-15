// app/works/FluidSim_cpu/core/Renderer.ts
// Renders fluid dye fields via offscreen canvas + browser GPU upscaling

export class Renderer {
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private imageData!: ImageData;
  private pixels!: Uint8ClampedArray;
  private gw = 0;
  private gh = 0;
  saturation = 0.9;
  brightness = 0.6;

  constructor() {
    this.offCanvas = document.createElement("canvas");
    this.offCtx = this.offCanvas.getContext("2d")!;
  }

  render(
    ctx: CanvasRenderingContext2D,
    gridW: number, gridH: number, stride: number,
    dR: Float64Array, dG: Float64Array, dB: Float64Array,
    canvasW: number, canvasH: number
  ): void {
    if (this.gw !== gridW || this.gh !== gridH) {
      this.gw = gridW; this.gh = gridH;
      this.offCanvas.width = gridW;
      this.offCanvas.height = gridH;
      this.imageData = this.offCtx.createImageData(gridW, gridH);
      this.pixels = this.imageData.data;
    }

    const pixels = this.pixels;
    for (let j = 0; j < gridH; j++)
      for (let i = 0; i < gridW; i++) {
        const gridIdx = (i + 1) + stride * (j + 1);
        const off = (j * gridW + i) * 4;
        let r = dR[gridIdx], g = dG[gridIdx], b = dB[gridIdx];
        // boost saturation: shift away from gray
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = this.saturation;
        r = gray + (r - gray) * sat;
        g = gray + (g - gray) * sat;
        b = gray + (b - gray) * sat;
        // brightness boost + tone curve
        const br = this.brightness;
        r *= br; g *= br; b *= br;
        pixels[off]     = r >= 1 ? 255 : r <= 0 ? 0 : (255 * Math.pow(r, 0.75)) | 0;
        pixels[off + 1] = g >= 1 ? 255 : g <= 0 ? 0 : (255 * Math.pow(g, 0.75)) | 0;
        pixels[off + 2] = b >= 1 ? 255 : b <= 0 ? 0 : (255 * Math.pow(b, 0.75)) | 0;
        pixels[off + 3] = 255;
      }

    this.offCtx.putImageData(this.imageData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.offCanvas, 0, 0, canvasW, canvasH);
  }

  renderVectors(
    ctx: CanvasRenderingContext2D,
    gridW: number, gridH: number, stride: number,
    u: Float64Array, v: Float64Array,
    canvasW: number, canvasH: number
  ): void {
    const step = Math.max(3, Math.floor(Math.max(gridW, gridH) / 40));
    const cellW = canvasW / gridW;
    const cellH = canvasH / gridH;
    const maxLen = Math.min(cellW, cellH) * step * 0.8;

    // find max magnitude for normalization
    let maxMag = 0;
    for (let j = 1; j <= gridH; j += step)
      for (let i = 1; i <= gridW; i += step) {
        const idx = i + stride * j;
        const mag = Math.sqrt(u[idx] * u[idx] + v[idx] * v[idx]);
        if (mag > maxMag) maxMag = mag;
      }
    if (maxMag < 1e-8) return;

    ctx.save();
    ctx.lineWidth = 1;
    const headSize = 3;

    for (let j = 1; j <= gridH; j += step)
      for (let i = 1; i <= gridW; i += step) {
        const idx = i + stride * j;
        const ux = u[idx], vy = v[idx];
        const mag = Math.sqrt(ux * ux + vy * vy);
        if (mag < 1e-8) continue;

        const cx = (i - 0.5) * cellW;
        const cy = (j - 0.5) * cellH;
        const norm = mag / maxMag;
        const len = norm * maxLen;
        const nx = ux / mag, ny = vy / mag;
        const ex = cx + nx * len, ey = cy + ny * len;

        // color by magnitude: blue(slow) → cyan → green → yellow → red(fast)
        const t = Math.min(1, norm * 2);
        let r: number, g: number, b: number;
        if (t < 0.25) { r = 0; g = t * 4; b = 1; }
        else if (t < 0.5) { r = 0; g = 1; b = 1 - (t - 0.25) * 4; }
        else if (t < 0.75) { r = (t - 0.5) * 4; g = 1; b = 0; }
        else { r = 1; g = 1 - (t - 0.75) * 4; b = 0; }

        ctx.strokeStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},0.7)`;

        // line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // arrowhead
        const ax = -ny * headSize, ay = nx * headSize;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - nx * headSize + ax, ey - ny * headSize + ay);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - nx * headSize - ax, ey - ny * headSize - ay);
        ctx.stroke();
      }

    ctx.restore();
  }
}
