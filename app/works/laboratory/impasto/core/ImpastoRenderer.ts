import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DEFAULTS, type Settings, type Contact } from "./PaintSolver";
import { PaintSurface } from "./PaintSurface";
import type { Command, PaintState } from "./protocol";

export class ImpastoRenderer {
  settings: Settings = { ...DEFAULTS };
  private state: PaintState = { positions: new Float32Array(), colors: new Float32Array(), count: 0, capacity: 3000, speed: 0, advanced: false };
  private worker: Worker;
  private busy = false;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(37, 1, .05, 60);
  private controls: OrbitControls;
  private surface: PaintSurface;
  private ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private light = new THREE.DirectionalLight(0xfff5e3, 3.3);
  private tool = new THREE.Group();
  private observer: ResizeObserver;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointer: number | null = null;
  private contact: Contact | null = null;
  private releasing = false;
  private target = new THREE.Vector3();
  private raf = 0;
  private last = 0;
  private accumulator = 0;
  private emitTime = 0;
  private remaining = 0;
  private disposed = false;
  private stopped = false;
  private onCount: (count: number, capacity: number) => void;
  private onError: (message: string) => void;

  constructor(canvas: HTMLCanvasElement, onCount: (count: number, capacity: number) => void, onError: (message: string) => void) {
    this.canvas = canvas; this.onCount = onCount; this.onError = onError;
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    this.state.capacity = mobile ? 1800 : 3000;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.setClearColor("#f3f0e9");
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.camera.position.set(1.4, 2.8, 3.5);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.target.set(0, .08, 0);
    this.controls.enableDamping = false; this.controls.minDistance = 1.5; this.controls.maxDistance = 12;
    this.controls.maxPolarAngle = Math.PI * .47; this.controls.enablePan = false; this.controls.update(); this.controls.enabled = false;
    this.controls.addEventListener("change", this.wake);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b1a2, 1.2));
    this.light.castShadow = true; this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.camera.left = this.light.shadow.camera.bottom = -3.5;
    this.light.shadow.camera.right = this.light.shadow.camera.top = 3.5;
    this.light.shadow.normalBias = .006; this.light.shadow.bias = -.0001; this.scene.add(this.light);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: "#e9e5dc", roughness: .93 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -.015; this.ground.receiveShadow = true; this.scene.add(this.ground);
    this.surface = new PaintSurface(mobile ? 72 : 90); this.scene.add(this.surface.mesh, this.tool);
    this.worker = new Worker(new URL("./paint.worker.ts", import.meta.url));
    this.worker.onmessage = (event: MessageEvent<PaintState>) => {
      if (this.disposed) return;
      this.state = event.data;
      if (this.state.advanced) this.busy = false;
      if (this.state.advanced && !this.contact && this.state.speed < .008) this.remaining = 0;
      this.surface.update(this.state); this.onCount(this.state.count, this.state.capacity); this.wake();
    };
    this.worker.onerror = () => {
      this.stopped = true; cancelAnimationFrame(this.raf); this.worker.terminate();
      this.onError("물감 계산을 시작하지 못했습니다. 캔버스를 다시 열어주세요.");
    };
    this.send({ type: "init", capacity: this.state.capacity });
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
    canvas.addEventListener("pointerdown", this.down); canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up); canvas.addEventListener("pointercancel", this.cancel);
    canvas.addEventListener("lostpointercapture", this.cancel); canvas.addEventListener("pointerleave", this.leave);
    canvas.addEventListener("webglcontextlost", this.contextLost);
    this.update(this.settings);
    this.remaining = 1.5; this.wake();
  }
  update(settings: Settings) {
    if (settings.tool !== this.settings.tool && this.contact) this.stop();
    const rebuild = settings.tool !== this.settings.tool || settings.size !== this.settings.size || this.tool.children.length === 0;
    this.settings = { ...settings }; this.send({ type: "settings", settings: { ...settings } });
    this.controls.enabled = settings.tool === "view"; this.canvas.style.cursor = settings.tool === "view" ? "grab" : "crosshair";
    this.surface.material.roughness = .62 - settings.gloss * .004; this.surface.material.clearcoat = settings.gloss * .008;
    const angle = settings.light * Math.PI / 180; this.light.position.set(Math.cos(angle) * 3.8, 3, Math.sin(angle) * 3.8);
    if (rebuild) this.makeTool(); this.wake();
  }
  private disposeTool() {
    this.tool.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose()); } }); this.tool.clear();
  }
  private makeTool() {
    this.disposeTool(); const s = this.settings, width = .16 + s.size * .012;
    const metal = new THREE.MeshStandardMaterial({ color: "#aab2b4", metalness: .65, roughness: .33, transparent: true, opacity: .65 });
    if (s.tool === "knife" || s.tool === "pointed") {
      const shape = new THREE.Shape(); shape.moveTo(-width * .5, width * .42); shape.lineTo(width * .5, width * .42);
      if (s.tool === "pointed") shape.lineTo(0, -width * .42);
      else { shape.lineTo(width * .5, -width * .42); shape.lineTo(-width * .5, -width * .42); } shape.closePath();
      const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .015, bevelEnabled: false }), metal);
      blade.rotation.x = -Math.PI / 2; this.tool.add(blade);
    } else if (s.tool === "tube") {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.07, .035, .28, 14), metal); nozzle.position.y = .2; this.tool.add(nozzle);
    } else if (s.tool !== "view") {
      metal.dispose();
      for (let i = 0; i < 13; i++) {
        const x = (i / 12 - .5) * width;
        const bristle = new THREE.Mesh(new THREE.CylinderGeometry(.011, .008, .23, 5), new THREE.MeshStandardMaterial({ color: "#8e6d45", roughness: .8, transparent: true, opacity: .6 }));
        bristle.position.set(x, .12, s.tool === "round" ? Math.sqrt(Math.max(0, 1 - (x / (width / 2)) ** 2)) * .06 : 0);
        if (s.tool === "fan") bristle.rotation.z = -x * .5; this.tool.add(bristle);
      }
    } else metal.dispose();
    if (s.tool !== "tube" && s.tool !== "view") {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, .6, 10), new THREE.MeshStandardMaterial({ color: "#80644b", roughness: .75, transparent: true, opacity: .6 }));
      handle.position.set(0, .3, -.3); handle.rotation.x = -.8; this.tool.add(handle);
    } this.tool.visible = false;
  }
  private send(command: Command) { this.worker.postMessage(command); }
  clear() { this.stop(); this.surface.clear(); this.send({ type: "clear" }); }
  undo() { this.stop(); this.surface.undo(); this.send({ type: "undo" }); }
  resetView() { this.camera.position.set(1.4, 2.8, 3.5); this.controls.target.set(0, .08, 0); this.controls.update(); this.wake(); }
  private resize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h, false); this.wake();
  };
  private project(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), this.camera);
    // Start on the visible paint surface, then keep the drag plane fixed. Projecting
    // every input onto the board made raised dollops impossible to grab precisely.
    const paintHit = this.pointer === null && !this.releasing && this.surface.mesh.visible
      ? this.ray.intersectObject(this.surface.mesh, false)[0]?.point : undefined;
    const hit = paintHit ?? this.ray.ray.intersectPlane(this.plane, new THREE.Vector3()); if (!hit) return null;
    hit.x = THREE.MathUtils.clamp(hit.x, -2.6, 2.6); hit.z = THREE.MathUtils.clamp(hit.z, -2.6, 2.6); return hit;
  }
  private down = (e: PointerEvent) => {
    if (this.settings.tool === "view" || this.pointer !== null || e.button !== 0) return;
    const p = this.project(e); if (!p) return;
    this.plane.constant = -p.y; this.releasing = false;
    this.send({ type: "end" }); this.send({ type: "remember" }); this.surface.remember(); this.pointer = e.pointerId; this.canvas.setPointerCapture(e.pointerId);
    this.target.copy(p); this.contact = { x: p.x, z: p.z, dx: 0, dz: 0, angle: 0, pressure: e.pointerType === "pen" ? e.pressure : 1, lifting: 0 };
    if (this.settings.tool === "tube") this.send({ type: "emit", x: p.x, z: p.z, count: 22 });
    this.emitTime = 0; this.remaining = 3; this.wake();
  };
  private move = (e: PointerEvent) => {
    if (this.settings.tool === "view") return; const p = this.project(e); if (!p) return;
    this.tool.visible = true;
    if (e.pointerId === this.pointer && this.contact) { this.target.copy(p); this.contact.pressure = e.pointerType === "pen" ? Math.max(.1, e.pressure) : 1; }
    else this.tool.position.set(p.x, .45, p.z);
    this.wake();
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointer) return; this.pointer = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (this.contact && this.settings.tool !== "tube") this.releasing = true;
    else { this.contact = null; this.plane.constant = 0; }
    this.remaining = 3; this.wake();
  };
  private cancel = (e: PointerEvent) => { if (e.pointerId === this.pointer) this.stop(); };
  private leave = () => { if (this.pointer === null) { this.tool.visible = false; this.wake(); } };
  private contextLost = (e: Event) => { e.preventDefault(); this.stopped = true; cancelAnimationFrame(this.raf); this.worker.terminate(); this.onError("그래픽 연결이 중단되었습니다. 캔버스를 다시 열어주세요."); };
  private stop() {
    const pointer = this.pointer; this.pointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    this.contact = null; this.releasing = false; this.plane.constant = 0;
    this.send({ type: "end" }); this.remaining = 0; this.tool.visible = false;
  }
  private wake = () => { if (!this.raf && !this.disposed && !this.stopped) this.raf = requestAnimationFrame(this.frame); };
  private frame = (time: number) => {
    this.raf = 0; if (this.disposed) return;
    const elapsed = Math.min(.05, (time - this.last) / 1000 || 1 / 60); this.last = time;
    this.accumulator += elapsed;
    if (!this.busy && (this.contact || this.remaining > 0) && this.accumulator >= 1 / 30) {
      this.accumulator = 0; const c = this.contact; let emit = 0;
      if (c) {
        const dx = this.target.x - c.x, dz = this.target.z - c.z, d = Math.hypot(dx, dz), scale = d > .07 ? .07 / d : 1;
        c.dx = dx * scale; c.dz = dz * scale; c.x += c.dx; c.z += c.dz;
        if (d > .002) c.angle = Math.atan2(c.dx, c.dz);
        // Finish the swept stroke before lifting, including fast touch releases.
        if (this.releasing && d < .075 && c.lifting === 0) c.lifting = .001;
        if (c.lifting > 0) c.lifting += 1 / 15;
        if (this.settings.tool === "tube" && this.pointer !== null) {
          this.emitTime += 1 / 30;
          if (this.emitTime > .07) { this.emitTime = 0; emit = 5 + Math.round(this.settings.amount * .18); }
        }
        this.surface.mark(c, this.settings);
        this.tool.position.set(c.x, .03 + .18 * (1 - this.settings.pressure / 100 * c.pressure) + c.lifting * .6, c.z);
        this.tool.rotation.y = c.angle; this.tool.visible = true;
      }
      this.busy = true; this.send({ type: "step", contact: c, emit }); this.remaining -= 1 / 30;
      if (c && c.lifting > 1) { this.contact = null; this.releasing = false; this.plane.constant = 0; this.send({ type: "end" }); this.tool.visible = false; }
    }
    this.renderer.render(this.scene, this.camera); if (this.contact || this.remaining > 0) this.wake();
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); this.worker.terminate();
    this.controls.removeEventListener("change", this.wake); this.controls.dispose(); this.disposeTool();
    this.canvas.removeEventListener("pointerdown", this.down); this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up); this.canvas.removeEventListener("pointercancel", this.cancel);
    this.canvas.removeEventListener("lostpointercapture", this.cancel); this.canvas.removeEventListener("pointerleave", this.leave);
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.surface.dispose(); this.ground.geometry.dispose(); this.ground.material.dispose(); this.light.shadow.map?.dispose(); this.renderer.dispose();
  }
}
