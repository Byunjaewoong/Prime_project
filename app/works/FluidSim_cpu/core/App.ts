// app/works/FluidSim_cpu/core/App.ts
// Orchestrator: animation loop, pointer events, dye injection (CPU-based)

import { FluidSolver } from "./FluidSolver";
import { Renderer } from "./Renderer";

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

const CELLS_PER_PX = 0.133; // 1920px → ~256 cells
const MIN_GRID = 64;
const MAX_GRID = 512;

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private solver!: FluidSolver;
  private renderer: Renderer;
  private animationId: number | null = null;

  private prevX = -1;
  private prevY = -1;
  private hueAngle = 0;

  private forceMultiplier = 0.1;
  private baseDyeRadius = 3;
  private baseVelRadius = 4;
  private static readonly REF_GRID = 144; // reference grid size (1080px)

  private resizeHandler: () => void;
  private ptrMoveHandler: (e: PointerEvent) => void;
  private ptrLeaveHandler: () => void;
  private ctxMenuHandler: (e: Event) => void;
  private resizeDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.renderer = new Renderer();

    this.fitCanvas();
    this.createSolver();

    this.resizeHandler = () => {
      this.fitCanvas();
      if (this.resizeDebounce) clearTimeout(this.resizeDebounce);
      this.resizeDebounce = setTimeout(() => {
        this.createSolver();
        this.resizeDebounce = null;
      }, 200);
    };
    window.addEventListener("resize", this.resizeHandler);

    this.ptrMoveHandler = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (this.prevX >= 0) {
        const dx = cx - this.prevX, dy = cy - this.prevY;
        if (Math.sqrt(dx * dx + dy * dy) > 0.5) this.injectAt(cx, cy, dx, dy);
      }
      this.prevX = cx;
      this.prevY = cy;
    };

    this.ptrLeaveHandler = () => { this.prevX = -1; this.prevY = -1; };
    this.ctxMenuHandler = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointermove", this.ptrMoveHandler);
    canvas.addEventListener("pointerleave", this.ptrLeaveHandler);
    canvas.addEventListener("contextmenu", this.ctxMenuHandler);

    this.animationId = requestAnimationFrame(this.animate);
  }

  private createSolver(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const gridW = Math.max(MIN_GRID, Math.min(MAX_GRID, Math.round(w * CELLS_PER_PX)));
    const gridH = Math.max(MIN_GRID, Math.min(MAX_GRID, Math.round(h * CELLS_PER_PX)));

    const old = this.solver;
    this.solver = new FluidSolver(gridW, gridH);
    if (old) {
      this.solver.vorticityEps = old.vorticityEps;
      this.solver.dyeDecay = old.dyeDecay;
      this.solver.diffusion = old.diffusion;
      this.solver.velocityDecay = old.velocityDecay;
    }
  }

  private injectAt(cx: number, cy: number, dx: number, dy: number): void {
    const W = this.solver.W, H = this.solver.H;
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const gx = Math.floor(1 + (cx / cssW) * W);
    const gy = Math.floor(1 + (cy / cssH) * H);
    if (gx < 1 || gx > W || gy < 1 || gy > H) return;

    const scale = Math.max(W, H) / App.REF_GRID;
    const velR = Math.max(1, Math.round(this.baseVelRadius * scale));
    const dyeR = Math.max(1, Math.round(this.baseDyeRadius * scale));
    const invScale2 = 1 / (scale * scale);
    this.solver.addVelocity(gx, gy, dx * this.forceMultiplier * invScale2, dy * this.forceMultiplier * invScale2, velR);
    const [r, g, b] = hslToRgb(this.hueAngle % 360, 1.0, 0.5);
    this.solver.addDye(gx, gy, r * 80 * invScale2, g * 80 * invScale2, b * 80 * invScale2, dyeR);
  }

  private animate = (_timestamp: number): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.hueAngle += 4.0;
    this.solver.step();
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.render(this.ctx, this.solver.W, this.solver.H, this.solver.W + 2,
      this.solver.dR, this.solver.dG, this.solver.dB, w, h);
  };

  private fitCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  reset(): void { this.solver.reset(); }

  getParams(): Record<string, number> {
    return { vorticity: this.solver.vorticityEps, dyeDecay: this.solver.dyeDecay, force: this.forceMultiplier, drag: this.solver.velocityDecay, viscosity: this.solver.diffusion, saturation: this.renderer.saturation, brightness: this.renderer.brightness };
  }

  setParam(key: string, value: number): void {
    switch (key) {
      case "vorticity": this.solver.vorticityEps = value; break;
      case "dyeDecay": this.solver.dyeDecay = value; break;
      case "force": this.forceMultiplier = value; break;
      case "drag": this.solver.velocityDecay = value; break;
      case "viscosity": this.solver.diffusion = value; break;
      case "saturation": this.renderer.saturation = value; break;
      case "brightness": this.renderer.brightness = value; break;
    }
  }

  destroy(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    if (this.resizeDebounce) clearTimeout(this.resizeDebounce);
    window.removeEventListener("resize", this.resizeHandler);
    this.canvas.removeEventListener("pointermove", this.ptrMoveHandler);
    this.canvas.removeEventListener("pointerleave", this.ptrLeaveHandler);
    this.canvas.removeEventListener("contextmenu", this.ctxMenuHandler);
  }
}
