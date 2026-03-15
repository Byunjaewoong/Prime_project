// app/works/vortex/core/App.ts
// Orchestrator: animation loop, pointer events, dye injection (GPU-based)

import { FluidGL } from "./FluidGL";

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

export class App {
  private canvas: HTMLCanvasElement;
  private fluid: FluidGL;
  private animationId: number | null = null;
  private lastTime = 0;

  // pointer tracking
  private prevX = -1;
  private prevY = -1;
  private hueAngle = 0;

  // params
  private forceMultiplier = 15;

  // event handlers
  private resizeHandler: () => void;
  private ptrMoveHandler: (e: PointerEvent) => void;
  private ptrLeaveHandler: () => void;
  private ctxMenuHandler: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    this.fluid = new FluidGL(canvas);

    this.resizeHandler = () => {
      this.fluid.resize();
    };
    window.addEventListener("resize", this.resizeHandler);

    this.ptrMoveHandler = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      if (this.prevX >= 0) {
        const dx = cx - this.prevX;
        const dy = cy - this.prevY;
        const speed = Math.sqrt(dx * dx + dy * dy);
        if (speed > 0.5) {
          this.injectAt(cx, cy, dx, dy);
        }
      }

      this.prevX = cx;
      this.prevY = cy;
    };

    this.ptrLeaveHandler = () => {
      this.prevX = -1;
      this.prevY = -1;
    };

    this.ctxMenuHandler = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointermove", this.ptrMoveHandler);
    canvas.addEventListener("pointerleave", this.ptrLeaveHandler);
    canvas.addEventListener("contextmenu", this.ctxMenuHandler);

    this.animationId = requestAnimationFrame(this.animate);
  }

  private injectAt(cx: number, cy: number, dx: number, dy: number): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    const mult = this.forceMultiplier;
    const vx = dx * mult;
    const vy = -dy * mult;
    const dyeAmt = 12.0;

    // emit 3 splats spread perpendicular to movement so colors stay separated
    const spread = 60;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;  // perpendicular unit vector
    const py = dx / len;

    const splats = [
      { ox: 0, oy: 0, hueShift: 0 },
      { ox: px * spread, oy: py * spread, hueShift: 90 },
      { ox: -px * spread, oy: -py * spread, hueShift: 210 },
    ];

    for (const { ox, oy, hueShift } of splats) {
      const nx = (cx + ox) / w;
      const ny = 1.0 - (cy + oy) / h;
      const hue = (this.hueAngle + hueShift) % 360;
      const [r, g, b] = hslToRgb(hue, 1.0, 0.5);
      this.fluid.splat(nx, ny, vx, vy, [r * dyeAmt, g * dyeAmt, b * dyeAmt]);
    }
  }

  private animate = (timestamp: number): void => {
    this.animationId = requestAnimationFrame(this.animate);

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.033);
    this.lastTime = timestamp;

    this.hueAngle += 1.5;

    this.fluid.step(dt);
    this.fluid.render();
  };

  // ── Public API ────────────────────────────────────────────────────────────

  reset(): void {
    this.fluid.reset();
  }

  getParams(): Record<string, number> {
    return {
      vorticity: this.fluid.curl,
      dyeDecay: this.fluid.densityDissipation,
      force: this.forceMultiplier,
    };
  }

  setParam(key: string, value: number): void {
    switch (key) {
      case "vorticity":
        this.fluid.curl = value;
        break;
      case "dyeDecay":
        this.fluid.densityDissipation = value;
        break;
      case "force":
        this.forceMultiplier = value;
        break;
    }
  }

  destroy(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.resizeHandler);
    this.canvas.removeEventListener("pointermove", this.ptrMoveHandler);
    this.canvas.removeEventListener("pointerleave", this.ptrLeaveHandler);
    this.canvas.removeEventListener("contextmenu", this.ctxMenuHandler);
    this.fluid.destroy();
  }
}
