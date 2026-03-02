// app/works/emergence/core/App.ts
import { Simulation, SimType } from "./types";
import { Lenia } from "./Lenia";
import { Boids } from "./Boids";
import { GrayScott } from "./GrayScott";
import { Physarum } from "./Physarum";

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sim: Simulation | null = null;
  private currentType: SimType | null = null;
  private animationId: number | null = null;
  private lastTime = 0;

  public onSimChange?: (type: SimType | null) => void;

  private resizeHandler: () => void;
  private resizeDebounce: ReturnType<typeof setTimeout> | null = null;

  private ptrDownHandler: (e: PointerEvent) => void;
  private ptrMoveHandler: (e: PointerEvent) => void;
  private ptrUpHandler:   (e: PointerEvent) => void;
  private ctxMenuHandler: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    this.resizeHandler = this.resize.bind(this);
    window.addEventListener("resize", this.resizeHandler);

    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // ── Pointer events — delegate to active sim ──────────────────────────────
    const rect = () => this.canvas.getBoundingClientRect();

    this.ptrDownHandler = (e: PointerEvent) => {
      e.preventDefault();
      const r = rect();
      this.sim?.onPointerDown?.(e.clientX - r.left, e.clientY - r.top, e.button);
    };
    this.ptrMoveHandler = (e: PointerEvent) => {
      const r = rect();
      this.sim?.onPointerMove?.(e.clientX - r.left, e.clientY - r.top, e.buttons);
    };
    this.ptrUpHandler = (e: PointerEvent) => {
      const r = rect();
      this.sim?.onPointerUp?.(e.clientX - r.left, e.clientY - r.top, e.button);
    };
    this.ctxMenuHandler = (e: Event) => e.preventDefault();

    this.canvas.addEventListener("pointerdown",  this.ptrDownHandler);
    this.canvas.addEventListener("pointermove",  this.ptrMoveHandler);
    this.canvas.addEventListener("pointerup",    this.ptrUpHandler);
    this.canvas.addEventListener("contextmenu",  this.ctxMenuHandler);

    this.animationId = requestAnimationFrame(this.animate.bind(this));
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w;
    this.canvas.height = h;

    // Debounce GPU sim resize to avoid rapid texture recreation during window drag
    if (this.resizeDebounce) clearTimeout(this.resizeDebounce);
    this.resizeDebounce = setTimeout(() => {
      this.sim?.resize(w, h);
      this.resizeDebounce = null;
    }, 200);
  }

  public setSim(type: SimType) {
    if (this.sim) {
      this.sim.destroy();
      this.sim = null;
    }
    this.currentType = type;
    const w = this.canvas.width;
    const h = this.canvas.height;

    switch (type) {
      case "lenia":     this.sim = new Lenia(w, h);      break;
      case "boids":     this.sim = new Boids(w, h);      break;
      case "grayscott": this.sim = new GrayScott(w, h);  break;
      case "physarum":  this.sim = new Physarum(w, h);   break;
    }

    this.onSimChange?.(type);
  }

  public resetSim(): void {
    if (this.currentType) this.setSim(this.currentType);
  }

  public toggleLeniaMode(): void {
    if (this.sim && "toggleMode" in this.sim)
      (this.sim as { toggleMode(): void }).toggleMode();
  }

  public randomiseParams(): void {
    if (this.sim && "randomiseParams" in this.sim)
      (this.sim as { randomiseParams(): void }).randomiseParams();
  }

  public toggleLeniaDelta(): void {
    if (this.sim && "toggleDelta" in this.sim)
      (this.sim as { toggleDelta(): void }).toggleDelta();
  }

  public stopSim() {
    if (this.sim) {
      this.sim.destroy();
      this.sim = null;
    }
    this.currentType = null;
    this.onSimChange?.(null);

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, w, h);
  }

  private animate(timestamp: number) {
    this.animationId = requestAnimationFrame(this.animate.bind(this));

    const delta = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    if (!this.sim) return;

    const w = this.canvas.width;
    const h = this.canvas.height;

    this.sim.update(delta);
    this.sim.render(this.ctx, w, h);
  }

  public getSimParams(): Record<string, number> | null {
    return this.sim?.getParams?.() ?? null;
  }

  public setSimParam(key: string, value: number): void {
    if (this.sim && "setParam" in this.sim)
      (this.sim as { setParam(k: string, v: number): void }).setParam(key, value);
  }

  public setDebugOverlay(show: boolean): void {
    if (this.sim && "showHGrid" in this.sim)
      (this.sim as { showHGrid: boolean }).showHGrid = show;
  }

  public destroy() {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    if (this.sim) this.sim.destroy();
    if (this.resizeDebounce) clearTimeout(this.resizeDebounce);
    window.removeEventListener("resize", this.resizeHandler);
    this.canvas.removeEventListener("pointerdown", this.ptrDownHandler);
    this.canvas.removeEventListener("pointermove", this.ptrMoveHandler);
    this.canvas.removeEventListener("pointerup",   this.ptrUpHandler);
    this.canvas.removeEventListener("contextmenu", this.ctxMenuHandler);
  }
}
