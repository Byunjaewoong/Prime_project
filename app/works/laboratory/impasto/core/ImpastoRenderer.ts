import * as THREE from "three";
import { PaintField, DEFAULTS, type PaintSettings, type Point } from "./PaintField";
import { vertex, fragment } from "./shaders";

export class ImpastoRenderer {
  settings: PaintSettings = { ...DEFAULTS };
  readonly field: PaintField;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private texture: THREE.DataTexture;
  private material: THREE.ShaderMaterial;
  private geometry = new THREE.PlaneGeometry(2, 2);
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private observer: ResizeObserver;
  private raf = 0;
  private disposed = false;
  private activePointer: number | null = null;
  private previous: Point | null = null;
  private queue: Point[] = [];
  private release = false;
  private liftFrame = 0;
  private settling = 0;
  private generation: Generator<number> | null = null;
  private view = new THREE.Vector2(1, 1);
  private onProgress: (p: number | null) => void;
  private onError: (message: string) => void;

  constructor(canvas: HTMLCanvasElement, onProgress: (p: number | null) => void, onError: (message: string) => void) {
    this.canvas = canvas; this.onProgress = onProgress; this.onError = onError;
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    this.field = new PaintField(mobile ? 640 : 1024);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "default" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.texture = new THREE.DataTexture(this.field.data, this.field.size, this.field.size, THREE.RGBAFormat, THREE.FloatType);
    const filter = this.renderer.extensions.has("OES_texture_float_linear") ? THREE.LinearFilter : THREE.NearestFilter;
    this.texture.magFilter = filter; this.texture.minFilter = filter;
    this.texture.generateMipmaps = false; this.texture.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: {
      uPaint: { value: this.texture }, uView: { value: this.view }, uTexel: { value: 1 / this.field.size },
      uRelief: { value: 1 }, uTexture: { value: .78 }, uGloss: { value: .38 },
      uLight: { value: new THREE.Vector3() }, uCursor: { value: new THREE.Vector3(-2, -2, 0) },
    } });
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.cancel);
    canvas.addEventListener("lostpointercapture", this.lostCapture);
    canvas.addEventListener("pointerleave", this.leave);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    this.update(this.settings);
    this.regenerate();
  }

  update(settings: PaintSettings) {
    this.settings = { ...settings };
    const u = this.material.uniforms;
    u.uRelief.value = settings.relief / 100 * 1.65;
    u.uTexture.value = settings.texture / 100;
    u.uGloss.value = settings.gloss / 100;
    const angle = settings.lightAngle * Math.PI / 180, height = settings.lightHeight * Math.PI / 180;
    u.uLight.value.set(Math.cos(angle) * Math.cos(height), Math.sin(angle) * Math.cos(height), Math.sin(height));
    this.wake();
  }

  regenerate() {
    this.stopStroke();
    this.generation = this.field.generate(Math.floor(Math.random() * 4294967296), { ...this.settings });
    this.onProgress(0); this.wake();
  }

  clear() {
    this.generation = null; this.onProgress(null); this.stopStroke();
    this.field.clear(); this.texture.needsUpdate = true; this.wake();
  }

  undo() {
    if (this.generation) return;
    this.stopStroke(); this.field.undo(); this.texture.needsUpdate = true; this.wake();
  }

  private resize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    // A square material canvas, cropped to fit. Resizing never stretches the relief.
    this.view.set(w / Math.max(w, h), h / Math.max(w, h));
    this.wake();
  };

  private point(e: PointerEvent): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: ( .5 + ((e.clientX - r.left) / r.width - .5) * this.view.x) * 1000,
      y: (.5 + (.5 - (e.clientY - r.top) / r.height) * this.view.y) * 1000,
      pressure: e.pointerType === "pen" ? Math.max(.08, e.pressure) : .65 };
  }

  private down = (e: PointerEvent) => {
    if (this.generation || this.activePointer !== null || e.button !== 0) return;
    this.finishLift();
    this.activePointer = e.pointerId; this.canvas.setPointerCapture(e.pointerId);
    this.previous = this.point(e); this.field.begin(this.previous);
    this.queue = [this.previous]; this.release = false; this.liftFrame = 0; this.settling = 0;
    this.wake();
  };

  private move = (e: PointerEvent) => {
    const p = this.point(e);
    this.material.uniforms.uCursor.value.set(p.x / 1000, p.y / 1000, this.settings.size * .5);
    if (e.pointerId === this.activePointer) {
      // A bounded queue; the last swept segment still connects to the final position.
      if (this.queue.length < 64) this.queue.push(p); else this.queue[this.queue.length - 1] = p;
    }
    this.wake();
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointer) return;
    this.queue.push(this.point(e)); this.release = true; this.activePointer = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.material.uniforms.uCursor.value.z = 0; this.wake();
  };

  private cancel = (e: PointerEvent) => { if (e.pointerId === this.activePointer) this.stopStroke(); };
  private lostCapture = (e: PointerEvent) => { if (e.pointerId === this.activePointer) this.stopStroke(); };
  private leave = () => { this.material.uniforms.uCursor.value.z = 0; this.wake(); };
  private contextLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(this.raf); this.onError("그래픽 연결이 중단되었습니다. 아래 버튼으로 캔버스를 다시 열어주세요."); };

  private finishLift() {
    while (this.queue.length && this.previous) {
      const p = this.queue.shift()!;
      this.field.stroke(this.previous, p, this.settings); this.previous = p;
      this.texture.needsUpdate = true;
    }
    if (this.release && this.previous) {
      for (let i = this.liftFrame; i < 12; i++) this.field.lift(this.previous, this.settings, i / 11);
      this.texture.needsUpdate = true;
    }
    this.release = false; this.field.end();
  }

  private stopStroke() {
    const pointer = this.activePointer; this.activePointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    this.queue = []; this.release = false; this.previous = null; this.settling = 0; this.field.end();
    this.material.uniforms.uCursor.value.z = 0;
  }

  private wake() { if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.frame); }

  private frame = () => {
    this.raf = 0;
    if (this.disposed) return;
    let dirty = false;
    if (this.generation) {
      const next = this.generation.next();
      if (next.done) { this.generation = null; this.onProgress(null); }
      else this.onProgress(Math.round(next.value * 100));
      dirty = true;
    } else {
      const start = performance.now();
      while (this.queue.length && this.previous) {
        const p = this.queue.shift()!;
        this.field.stroke(this.previous, p, this.settings); this.previous = p; dirty = true;
        if (performance.now() - start > 9) break;
      }
      if (!this.queue.length && this.release && this.previous) {
        this.field.lift(this.previous, this.settings, this.liftFrame / 11); dirty = true;
        if (++this.liftFrame >= 12) { this.release = false; this.field.end(); this.settling = 180; }
      }
      if (this.settling > 0) {
        const residual = this.field.relax(this.settings, 1 / 60);
        this.settling = residual < .00005 ? 0 : this.settling - 1;
        dirty ||= residual > 0;
      }
    }
    if (dirty) this.texture.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    if (this.generation || this.queue.length || this.release || this.settling) this.wake();
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); this.generation = null;
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.cancel);
    this.canvas.removeEventListener("lostpointercapture", this.lostCapture);
    this.canvas.removeEventListener("pointerleave", this.leave);
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.texture.dispose(); this.material.dispose(); this.geometry.dispose(); this.renderer.dispose();
  }
}
