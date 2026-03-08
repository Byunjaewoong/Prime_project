// app/works/emergence/core/App.ts
import { Simulation, SimType } from "./types";
import { Lenia } from "./Lenia";
import { Boids } from "./Boids";
import { GrayScott } from "./GrayScott";
import { Physarum } from "./Physarum";

// ── Zoom config ───────────────────────────────────────────────────────────────
const ZOOM_MIN        = 0.33;  // zoom out 한계 (field 최대 3× 확장)
const ZOOM_MAX        = 3.0;   // zoom in  한계 (field 최소 1/3 축소)
const ZOOM_STEP       = 0.10;  // 스크롤 1step 당 10%
const ZOOM_LERP       = 8;     // lerp 속도
const ZOOM_SETTLE_MS  = 500;   // 스크롤 멈춘 후 field resize 대기시간

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sim: Simulation | null = null;
  private currentType: SimType | null = null;
  private animationId: number | null = null;
  private lastTime = 0;

  public onSimChange?: (type: SimType | null) => void;

  private resizeHandler:  () => void;
  private resizeDebounce: ReturnType<typeof setTimeout> | null = null;

  private ptrDownHandler: (e: PointerEvent) => void;
  private ptrMoveHandler: (e: PointerEvent) => void;
  private ptrUpHandler:   (e: PointerEvent) => void;
  private ctxMenuHandler: (e: Event) => void;
  private wheelHandler:   (e: WheelEvent) => void;

  // ── View transform state ───────────────────────────────────────────────────
  // Transform: screenX = fieldX * (zoom * sw/fieldW) + tx
  //
  //  zoom=1, tx=0, ty=0 → field가 화면을 정확히 채움 (기본 상태)
  //  zoom < 1 + tx/ty   → 마우스 커서 기준 zoom out (공간 확장 예고)
  //  settle 후: field resize → zoom/tx/ty 모두 기본값으로 복귀
  private zoom      = 1.0;
  private zoomTarget = 1.0;
  private fieldW    = 0;
  private fieldH    = 0;

  private zoomSettleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.fieldW = this.canvas.width;
    this.fieldH = this.canvas.height;

    // ── Window resize ────────────────────────────────────────────────────────
    this.resizeHandler = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.canvas.width  = w;
      this.canvas.height = h;

      if (this.resizeDebounce) clearTimeout(this.resizeDebounce);
      this.resizeDebounce = setTimeout(() => {
        this.fieldW = w;
        this.fieldH = h;
        this.zoom = 1.0; this.zoomTarget = 1.0;
        this.sim?.resize(w, h);
        this.resizeDebounce = null;
      }, 200);
    };
    window.addEventListener("resize", this.resizeHandler);

    // ── Pointer: screen coord → field coord ──────────────────────────────────
    const rect = () => this.canvas.getBoundingClientRect();
    const toField = (sx: number, sy: number) => {
      const sw = this.canvas.width, sh = this.canvas.height;
      const scaleX = this.zoom * (sw / this.fieldW);
      const scaleY = this.zoom * (sh / this.fieldH);
      // tx/ty는 항상 zoom에서 파생: center = zoom*sw/2 + tx = sw/2 (항상 고정)
      const tx = (sw / 2) * (1 - this.zoom);
      const ty = (sh / 2) * (1 - this.zoom);
      return {
        x: (sx - tx) / scaleX,
        y: (sy - ty) / scaleY,
      };
    };

    this.ptrDownHandler = (e: PointerEvent) => {
      e.preventDefault();
      const r = rect();
      const { x, y } = toField(e.clientX - r.left, e.clientY - r.top);
      this.sim?.onPointerDown?.(x, y, e.button);
    };
    this.ptrMoveHandler = (e: PointerEvent) => {
      const r = rect();
      const { x, y } = toField(e.clientX - r.left, e.clientY - r.top);
      this.sim?.onPointerMove?.(x, y, e.buttons);
    };
    this.ptrUpHandler = (e: PointerEvent) => {
      const r = rect();
      const { x, y } = toField(e.clientX - r.left, e.clientY - r.top);
      this.sim?.onPointerUp?.(x, y, e.button);
    };
    this.ctxMenuHandler = (e: Event) => e.preventDefault();

    // ── Wheel: 화면 중심 기준 zoom ──────────────────────────────────────────
    // tx = sw/2*(1-zoom) 으로 항상 파생 → center 고정, txTarget 불필요
    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const sw = this.canvas.width, sh = this.canvas.height;

      const factor = e.deltaY > 0 ? (1 - ZOOM_STEP) : (1 + ZOOM_STEP);
      this.zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoomTarget * factor));

      // 스크롤 멈추면 field 자체를 resize, 이후 zoom=1로 수렴
      if (this.zoomSettleTimer) clearTimeout(this.zoomSettleTimer);
      this.zoomSettleTimer = setTimeout(() => {
        const newW = Math.round(this.fieldW / this.zoomTarget);
        const newH = Math.round(this.fieldH / this.zoomTarget);
        const clampedW = Math.max(Math.round(sw * 0.33), Math.min(Math.round(sw * 3), newW));
        const clampedH = Math.max(Math.round(sh * 0.33), Math.min(Math.round(sh * 3), newH));

        // zoom을 정확한 target으로 snap 후 field resize
        // tx는 zoom에서 자동 파생되므로 center는 항상 sw/2 유지
        this.zoom = this.zoomTarget;
        this.fieldW = clampedW;
        this.fieldH = clampedH;
        this.sim?.resize(clampedW, clampedH);

        // zoom Z→1.0 으로 lerp → field가 중심에서 바깥으로 확장
        this.zoomTarget = 1.0;
        this.zoomSettleTimer = null;
      }, ZOOM_SETTLE_MS);
    };

    this.canvas.addEventListener("pointerdown",  this.ptrDownHandler);
    this.canvas.addEventListener("pointermove",  this.ptrMoveHandler);
    this.canvas.addEventListener("pointerup",    this.ptrUpHandler);
    this.canvas.addEventListener("contextmenu",  this.ctxMenuHandler);
    this.canvas.addEventListener("wheel",        this.wheelHandler, { passive: false });

    this.animationId = requestAnimationFrame(this.animate.bind(this));
  }

  public setSim(type: SimType) {
    if (this.sim) { this.sim.destroy(); this.sim = null; }
    this.currentType = type;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // sim 전환 시 모든 view 상태 초기화
    this.fieldW = w; this.fieldH = h;
    this.zoom = 1.0; this.zoomTarget = 1.0;
    if (this.zoomSettleTimer) { clearTimeout(this.zoomSettleTimer); this.zoomSettleTimer = null; }

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
    if (this.sim) { this.sim.destroy(); this.sim = null; }
    this.currentType = null;
    this.onSimChange?.(null);
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, w, h);
  }

  private animate(timestamp: number) {
    this.animationId = requestAnimationFrame(this.animate.bind(this));

    const delta = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;
    if (!this.sim) return;

    const sw = this.canvas.width;
    const sh = this.canvas.height;

    // ── Smooth lerp: zoom만 관리, tx/ty는 zoom에서 파생 (center 항상 sw/2 고정) ──
    const lerpT = Math.min(1, delta * ZOOM_LERP);
    const zoomDiff = this.zoomTarget - this.zoom;
    if (Math.abs(zoomDiff) > 0.0005) {
      this.zoom += zoomDiff * lerpT;
    } else {
      this.zoom = this.zoomTarget;
    }

    // tx = sw/2*(1-zoom): center = zoom*sw/2 + tx = sw/2 (항상 성립)
    const tx = (sw / 2) * (1 - this.zoom);
    const ty = (sh / 2) * (1 - this.zoom);

    this.sim.update(delta);

    // ── Clear + transform ───────────────────────────────────────────────────
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, sw, sh);

    this.ctx.save();
    const scaleX = this.zoom * (sw / this.fieldW);
    const scaleY = this.zoom * (sh / this.fieldH);
    this.ctx.setTransform(scaleX, 0, 0, scaleY, tx, ty);
    this.sim.render(this.ctx, this.fieldW, this.fieldH);
    this.ctx.restore();
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
    if (this.zoomSettleTimer) clearTimeout(this.zoomSettleTimer);
    window.removeEventListener("resize", this.resizeHandler);
    this.canvas.removeEventListener("pointerdown", this.ptrDownHandler);
    this.canvas.removeEventListener("pointermove", this.ptrMoveHandler);
    this.canvas.removeEventListener("pointerup",   this.ptrUpHandler);
    this.canvas.removeEventListener("contextmenu", this.ctxMenuHandler);
    this.canvas.removeEventListener("wheel",       this.wheelHandler);
  }
}
