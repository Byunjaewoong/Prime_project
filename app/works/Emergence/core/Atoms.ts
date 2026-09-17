import { Simulation } from "./types";
import { AtomsCPU } from "./AtomsCPU";
import { AtomsGPU } from "./AtomsGPU";
import { DESKTOP_ATOM_DEFAULTS, MOBILE_ATOM_DEFAULTS } from "./AtomsDefaults";

export class Atoms implements Simulation {
  private gpu: AtomsGPU;
  private cpu: AtomsCPU | null = null;
  private useGpu = false;
  private destroyed = false;
  private depthMode = false;
  private focusLayer = 1;
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTap: { time: number; x: number; y: number } | null = null;

  constructor(w: number, h: number, gpuCanvas: HTMLCanvasElement) {
    const defaults = window.matchMedia("(pointer: coarse)").matches
      ? MOBILE_ATOM_DEFAULTS
      : DESKTOP_ATOM_DEFAULTS;
    this.gpu = new AtomsGPU(gpuCanvas, w, h, defaults);
    gpuCanvas.style.display = "block";
    void this.gpu.init().then(supported => {
      if (this.destroyed) return;
      if (supported) {
        this.useGpu = true;
      } else {
        gpuCanvas.style.display = "none";
        this.cpu = new AtomsCPU(w, h, defaults);
        this.cpu.setParam("colors", this.gpu.getParams().colors);
        this.cpu.setColors(this.gpu.getColors());
        this.cpu.setParam("depthMode", this.depthMode ? 1 : 0);
        this.cpu.setParam("focusLayer", this.focusLayer);
      }
    });
  }

  update(delta: number) {
    if (this.useGpu) this.gpu.frame(delta);
    else this.cpu?.update(delta);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.cpu) this.cpu.render(ctx, w, h);
    else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
    }
  }

  getParams(): Record<string, number> {
    return this.cpu?.getParams() ?? this.gpu.getParams();
  }

  setParam(key: string, value: number) {
    if (key === "depthMode") {
      this.depthMode = value >= 0.5;
      if (!this.depthMode) this.clearTapTimer();
    } else if (key === "focusLayer") {
      this.focusLayer = value >= 0.5 ? 1 : 0;
    }
    if (this.cpu) this.cpu.setParam(key, value);
    else this.gpu.setParam(key, value);
  }

  randomiseParams() {
    if (this.cpu) this.cpu.randomiseParams();
    else this.gpu.randomiseParams();
  }

  randomiseColors() {
    if (this.cpu) this.cpu.randomiseColors();
    else this.gpu.randomiseColors();
  }

  onPointerDown(x: number, y: number, button: number) {
    if (this.cpu) this.cpu.onPointerDown(x, y, button);
    else this.gpu.onPointerDown(x, y, button);
  }

  onPointerMove(x: number, y: number, buttons: number) {
    if (this.cpu) this.cpu.onPointerMove(x, y, buttons);
    else this.gpu.onPointerMove(x, y, buttons);
  }

  onPointerUp(x: number, y: number, button: number) {
    if (this.cpu) this.cpu.onPointerUp(x, y, button);
    else this.gpu.onPointerUp();
  }

  onTap(x: number, y: number) {
    if (!this.depthMode) {
      this.randomiseParams();
      return;
    }
    const now = performance.now();
    const previous = this.lastTap;
    if (previous && now - previous.time < 320 && Math.hypot(x - previous.x, y - previous.y) < 48) {
      this.clearTapTimer();
      this.setParam("focusLayer", 1 - this.focusLayer);
      return;
    }
    this.clearTapTimer();
    this.lastTap = { time: now, x, y };
    this.tapTimer = setTimeout(() => {
      this.tapTimer = null;
      this.lastTap = null;
      if (!this.destroyed) this.randomiseParams();
    }, 320);
  }

  private clearTapTimer() {
    if (this.tapTimer) clearTimeout(this.tapTimer);
    this.tapTimer = null;
    this.lastTap = null;
  }

  onWheel(x: number, y: number, deltaY: number): boolean {
    if (this.cpu) return this.cpu.onWheel(x, y, deltaY);
    return this.gpu.onWheel(x, y, deltaY);
  }

  onPinch(x: number, y: number, scale: number): boolean {
    if (this.cpu) return this.cpu.onPinch(x, y, scale);
    return this.gpu.onPinch(x, y, scale);
  }

  resize(w: number, h: number) {
    if (this.cpu) this.cpu.resize(w, h);
    else this.gpu.resize(w, h);
  }

  destroy() {
    this.destroyed = true;
    this.clearTapTimer();
    this.cpu?.destroy();
    this.gpu.destroy();
  }
}
