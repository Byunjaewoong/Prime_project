import * as THREE from "three";
import { disposeObject } from "@/app/lib/disposeObject";
import { StepModel } from "./StepModel";
import { loadShoeAsset } from "./ShoeAsset";
import { PassingSilhouette } from "./PassingSilhouette";
import { StepPrints, type StepContact } from "./StepPrints";

export type StepDirection = "random" | "right" | "left" | "down" | "up";
export type StepSettings = { direction: StepDirection; speed: number };
export const DEFAULT_STEP_SETTINGS: StepSettings = { direction: "random", speed: 1 };
const DIRECTIONS = ["right", "down", "left", "up"] as const;
const DURATION = 1.55;
const CAMERA_HEIGHT = 0.5;
const CAMERA_GROUND_OFFSET = 0.065;
const SHORT_EDGE_FOV = 16;
const OFFSCREEN_NDC = 4.5;
// Measured at the OBJ's raised collar after its 0.32 m normalization.
const SHOE_ANKLE = new THREE.Vector3(-0.01, 0.12, -0.05);
const clamp = THREE.MathUtils.clamp;
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const screenDirection = (direction: Exclude<StepDirection, "random">) => new THREE.Vector2(
  direction === "right" ? 1 : direction === "left" ? -1 : 0,
  direction === "up" ? 1 : direction === "down" ? -1 : 0,
);

type Step = {
  time: number;
  contact: THREE.Vector3;
  start: THREE.Vector3;
  end: THREE.Vector3;
  heading: number;
  stamped: boolean;
};

export class StepApp {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(SHORT_EDGE_FOV, 1, 0.015, 30);
  private readonly model: StepModel;
  private readonly passage: PassingSilhouette;
  private readonly prints: StepPrints;
  private readonly floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly projectedAnkle = new THREE.Vector3();
  private readonly projectedAnkleScreen = new THREE.Vector2();
  private readonly observer: ResizeObserver;
  private settings = { ...DEFAULT_STEP_SETTINGS };
  private step: Step | null = null;
  private queued: THREE.Vector2 | null = null;
  private lastDirection = -1;
  private frame = 0;
  private lastTime = 0;
  private destroyed = false;
  private paused = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onContact?: (contact: StepContact) => void,
    private readonly options: { transparentBackground?: boolean; renderPrints?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !!options.transparentBackground, powerPreference: "high-performance" });
    this.renderer.setClearColor(0xffffff, options.transparentBackground ? 0 : 1);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    // Knee height, looking almost straight down (about 7 degrees off vertical).
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_GROUND_OFFSET); this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);
    this.passage = new PassingSilhouette(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xf0f3ff, 0x9b9891, 2.15));
    const light = new THREE.DirectionalLight(0xfff8ed, 3.1);
    light.position.set(-1.8, 4, 2.5); light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = light.shadow.camera.bottom = -0.75;
    light.shadow.camera.right = light.shadow.camera.top = 0.75; light.shadow.camera.near = 0.1; light.shadow.camera.far = 10;
    light.shadow.normalBias = 0.006; light.shadow.bias = -0.0002; light.shadow.radius = 3;
    this.scene.add(light);
    const fill = new THREE.DirectionalLight(0xbac8df, 0.8); fill.position.set(3, 2, -2); this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ color: 0x3e4149, opacity: 0.19 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    this.model = new StepModel(); this.scene.add(this.model.shoe);
    this.model.shoe.visible = false;
    void this.loadShoe();
    this.prints = new StepPrints();
    if (options.renderPrints !== false) this.scene.add(this.prints.group);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    document.addEventListener("visibilitychange", this.onVisibility);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    this.resize(); this.frame = requestAnimationFrame(this.animate);
  }

  setSettings(partial: Partial<StepSettings>) {
    this.settings = { ...this.settings, ...partial };
    this.settings.speed = clamp(this.settings.speed, 0.5, 1.5);
  }

  private async loadShoe() {
    try {
      const asset = await loadShoeAsset();
      if (this.destroyed) { disposeObject(asset); return; }
      // Preserve the animated parent transform while swapping its fallback geometry.
      this.prints.matchShoeSole(asset);
      disposeObject(this.model.shoe);
      this.model.shoe.add(asset);
    } catch (error) {
      console.warn("Shoe OBJ could not load; using the procedural shoe.", error);
    }
  }

  private worldAt(ndc: THREE.Vector2) {
    this.camera.updateMatrixWorld(); this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
  }

  stepAt(clientX: number, clientY: number) {
    const bounds = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((clientX - bounds.left) / bounds.width * 2 - 1, 1 - (clientY - bounds.top) / bounds.height * 2);
    if (this.step) { this.queued = ndc; return; }
    this.beginStep(ndc);
  }

  private beginStep(ndc: THREE.Vector2) {
    const contact = this.worldAt(ndc); if (!contact) return;
    let index = DIRECTIONS.indexOf(this.settings.direction as typeof DIRECTIONS[number]);
    if (index < 0) {
      index = this.lastDirection < 0 ? Math.floor(Math.random() * 4) : (this.lastDirection + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    this.lastDirection = index;
    const direction = screenDirection(DIRECTIONS[index]);
    const next = this.worldAt(ndc.clone().addScaledVector(direction, 0.08));
    if (!next) return;
    const forward = next.sub(contact).normalize();
    const startNdc = ndc.clone(), endNdc = ndc.clone();
    // The close crop needs extra travel before the entire shoe clears the frame.
    if (direction.x) { startNdc.x = -direction.x * OFFSCREEN_NDC; endNdc.x = direction.x * OFFSCREEN_NDC; }
    else { startNdc.y = -direction.y * OFFSCREEN_NDC; endNdc.y = direction.y * OFFSCREEN_NDC; }
    const start = this.worldAt(startNdc) ?? contact.clone().addScaledVector(forward, -1.7);
    const end = this.worldAt(endNdc) ?? contact.clone().addScaledVector(forward, 1.7);
    this.step = { time: 0, contact, start, end, heading: Math.atan2(forward.x, forward.z), stamped: false };
    this.model.shoe.visible = true;
    this.passage.begin(direction);
    this.lastTime = 0;
  }

  clearPrints() { this.prints.clear(); }
  setPaused(paused: boolean) { this.paused = paused; this.lastTime = 0; }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    // Frame roughly 0.14 m of ground along the short edge: only a portion of
    // the 0.32 m shoe remains visible, including on tall phone viewports.
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(SHORT_EDGE_FOV / 2)) / Math.min(1, this.camera.aspect)));
    this.camera.updateProjectionMatrix();
    this.passage.resize();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 760 ? 1.5 : 1.75));
    this.renderer.setSize(width, height, false);
    this.render();
  }

  private updateStep(dt: number) {
    const step = this.step; if (!step) return;
    step.time += dt * this.settings.speed;
    const t = step.time / DURATION;
    const plantAt = 0.3, liftAt = 0.48;
    const shoe = this.model.shoe;
    shoe.rotation.set(0, step.heading, 0);
    if (t < plantAt) {
      const u = clamp(t / plantAt, 0, 1), ease = 1 - Math.pow(1 - u, 1.55);
      shoe.position.lerpVectors(step.start, step.contact, ease);
      shoe.position.y = Math.sin(Math.PI * u) * 0.19 + (1 - u) * 0.1;
      shoe.rotateX(-0.17 * (1 - u) + Math.sin(u * Math.PI) * 0.16);
    } else if (t < liftAt) {
      shoe.position.copy(step.contact);
      // Heel settles first; the entire sole is planted before the body crosses.
      shoe.rotateX(-0.075 * (1 - smooth((t - plantAt) / 0.055)));
    } else {
      const u = clamp((t - liftAt) / (1 - liftAt), 0, 1);
      const travel = Math.pow(u, 1.7);
      shoe.position.lerpVectors(step.contact, step.end, travel);
      shoe.position.y = Math.sin(Math.PI * u) * 0.2 + u * 0.08;
      shoe.rotateX(u * 0.52);
    }
    this.camera.updateMatrixWorld();
    this.projectedAnkle.copy(SHOE_ANKLE);
    shoe.localToWorld(this.projectedAnkle);
    this.projectedAnkle.project(this.camera);
    this.projectedAnkleScreen.set(this.projectedAnkle.x, this.projectedAnkle.y);
    this.passage.update(t, this.projectedAnkleScreen);
    if (!step.stamped && t >= plantAt + 0.03) {
      step.stamped = true;
      const { length, width } = this.prints.dimensions;
      const contact: StepContact = { position: step.contact.clone(), heading: step.heading, length, width, pressure: 1 };
      if (this.options.renderPrints !== false) this.prints.stamp(contact);
      if (this.onContact) {
        const side = new THREE.Vector3(-Math.cos(step.heading) * width, 0, Math.sin(step.heading) * width);
        const heel = new THREE.Vector3(-Math.sin(step.heading) * length, 0, -Math.cos(step.heading) * length);
        const center = step.contact.clone().addScaledVector(heel, -this.prints.centerOffset / length);
        const project = (point: THREE.Vector3) => {
          const ndc = point.project(this.camera);
          return { x: (ndc.x + 1) * this.canvas.clientWidth / 2, y: (1 - ndc.y) * this.canvas.clientHeight / 2 };
        };
        const screenCenter = project(center.clone());
        const screenSide = project(center.clone().add(side));
        const screenHeel = project(center.clone().add(heel));
        contact.screen = {
          x: screenCenter.x, y: screenCenter.y,
          sideX: screenSide.x - screenCenter.x, sideY: screenSide.y - screenCenter.y,
          heelX: screenHeel.x - screenCenter.x, heelY: screenHeel.y - screenCenter.y,
        };
        this.onContact(contact);
      }
    }
    if (t >= 1) {
      this.step = null; shoe.visible = false; this.passage.end();
      if (this.queued) { const next = this.queued; this.queued = null; this.beginStep(next); }
    }
  }

  private render() { if (!this.destroyed) this.renderer.render(this.scene, this.camera); }
  private animate = (now: number) => {
    if (this.destroyed) return;
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.06) : 0;
    this.lastTime = now;
    if (!this.paused && !document.hidden) this.updateStep(dt);
    this.render(); this.frame = requestAnimationFrame(this.animate);
  };
  private onVisibility = () => { this.lastTime = 0; };
  private onContextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(this.frame); };
  private onContextRestored = () => { this.lastTime = 0; if (!this.destroyed) this.frame = requestAnimationFrame(this.animate); };

  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.scene.remove(this.prints.group); this.prints.dispose(); disposeObject(this.scene); this.renderer.dispose();
    this.step = null; this.queued = null;
  }
}
