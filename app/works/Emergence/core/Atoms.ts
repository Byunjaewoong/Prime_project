import { Simulation } from "./types";
import { AtomsCPU } from "./AtomsCPU";
import { AtomsGPU } from "./AtomsGPU";

export class Atoms implements Simulation {
  private gpu: AtomsGPU;
  private cpu: AtomsCPU | null = null;
  private useGpu = false;
  private destroyed = false;

  constructor(w: number, h: number, gpuCanvas: HTMLCanvasElement) {
    this.gpu = new AtomsGPU(gpuCanvas, w, h);
    gpuCanvas.style.display = "block";
    void this.gpu.init().then(supported => {
      if (this.destroyed) return;
      if (supported) {
        this.useGpu = true;
      } else {
        gpuCanvas.style.display = "none";
        this.cpu = new AtomsCPU(w, h);
        this.cpu.setParam("colors", this.gpu.getParams().colors);
        this.cpu.setColors(this.gpu.getColors());
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
    this.cpu?.destroy();
    this.gpu.destroy();
  }
}
