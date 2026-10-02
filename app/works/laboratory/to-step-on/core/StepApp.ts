import * as THREE from "three";
import { disposeObject } from "@/app/lib/disposeObject";
import { ANKLE, createForegroundCloth, SHOE_LENGTH, SHOE_WIDTH, StepModel } from "./StepModel";
import { StepPrints, type StepContact } from "./StepPrints";

export type StepDirection = "random" | "right" | "left" | "down" | "up";
export type StepSettings = { direction: StepDirection; speed: number };
export const DEFAULT_STEP_SETTINGS: StepSettings = { direction: "random", speed: 1 };
const DIRECTIONS = ["right", "down", "left", "up"] as const;
const DURATION = 2.8;
const CAMERA_HEIGHT = 0.5;
const CAMERA_GROUND_OFFSET = 0.065;
const SHORT_EDGE_FOV = 44;
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
  forward: THREE.Vector3;
  screenDirection: THREE.Vector2;
  heading: number;
  stamped: boolean;
};

export class StepApp {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(44, 1, 0.015, 30);
  private readonly model: StepModel;
  private readonly prints: StepPrints;
  private readonly foreground: THREE.Mesh;
  private readonly floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly observer: ResizeObserver;
  private settings = { ...DEFAULT_STEP_SETTINGS };
  private step: Step | null = null;
  private queued: THREE.Vector2 | null = null;
  private lastDirection = -1;
  private frame = 0;
  private lastTime = 0;
  private destroyed = false;
  private paused = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onContact?: (contact: StepContact) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0xffffff);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    // Knee height, looking almost straight down (about 7 degrees off vertical).
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_GROUND_OFFSET); this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xf0f3ff, 0x9b9891, 2.15));
    const light = new THREE.DirectionalLight(0xfff8ed, 3.1);
    light.position.set(-1.8, 4, 2.5); light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = light.shadow.camera.bottom = -3;
    light.shadow.camera.right = light.shadow.camera.top = 3; light.shadow.camera.near = 0.1; light.shadow.camera.far = 10;
    light.shadow.normalBias = 0.006; light.shadow.bias = -0.0002; light.shadow.radius = 3;
    this.scene.add(light);
    const fill = new THREE.DirectionalLight(0xbac8df, 0.8); fill.position.set(3, 2, -2); this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ color: 0x3e4149, opacity: 0.19 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    this.model = new StepModel(); this.scene.add(this.model.shoe, this.model.trouser);
    this.model.shoe.visible = this.model.trouser.visible = false;
    this.prints = new StepPrints(); this.scene.add(this.prints.group);
    const nearFabric = this.model.fabric.clone(); nearFabric.color.set("#020203");
    // Composite the lens-close cloth after scene geometry: at knee height a
    // lifted shoe can otherwise intersect and render through this staged pass.
    nearFabric.transparent = true; nearFabric.depthTest = false; nearFabric.depthWrite = false;
    this.foreground = createForegroundCloth(nearFabric); this.foreground.visible = false;
    this.foreground.renderOrder = 100;
    this.camera.add(this.foreground);
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
    if (direction.x) { startNdc.x = -direction.x * 1.65; endNdc.x = direction.x * 1.65; }
    else { startNdc.y = -direction.y * 1.65; endNdc.y = direction.y * 1.65; }
    const start = this.worldAt(startNdc) ?? contact.clone().addScaledVector(forward, -1.7);
    const end = this.worldAt(endNdc) ?? contact.clone().addScaledVector(forward, 1.7);
    this.step = { time: 0, contact, start, end, forward, screenDirection: direction, heading: Math.atan2(forward.x, forward.z), stamped: false };
    this.model.shoe.visible = this.model.trouser.visible = true;
    this.lastTime = 0;
  }

  clearPrints() { this.prints.clear(); }
  setPaused(paused: boolean) { this.paused = paused; this.lastTime = 0; }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth), height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    // Frame a roughly 0.41 m patch along the shorter viewport edge. Both the
    // real shoe and its ground contact become large, with the same world scale.
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(SHORT_EDGE_FOV / 2)) / Math.min(1, this.camera.aspect)));
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 760 ? 1.5 : 1.75));
    this.renderer.setSize(width, height, false);
    this.render();
  }

  private updateStep(dt: number) {
    const step = this.step; if (!step) return;
    step.time += dt * this.settings.speed;
    const t = step.time / DURATION;
    const plantAt = 0.32, liftAt = 0.58;
    const shoe = this.model.shoe;
    shoe.rotation.set(0, step.heading, 0);
    if (t < plantAt) {
      const u = clamp(t / plantAt, 0, 1), ease = 1 - Math.pow(1 - u, 2.2);
      shoe.position.lerpVectors(step.start, step.contact, ease);
      shoe.position.y = Math.sin(Math.PI * u) * 0.19 + (1 - u) * 0.1;
      shoe.rotateX(-0.17 * (1 - u) + Math.sin(u * Math.PI) * 0.16);
    } else if (t < liftAt) {
      shoe.position.copy(step.contact);
      // Heel settles first; the entire sole is planted before the body crosses.
      shoe.rotateX(-0.075 * (1 - smooth((t - plantAt) / 0.055)));
    } else {
      const u = smooth((t - liftAt) / 0.3);
      shoe.position.lerpVectors(step.contact, step.end, u);
      shoe.position.y = Math.sin(Math.PI * u) * 0.2 + u * 0.08;
      shoe.rotateX(u * 0.52);
    }
    if (!step.stamped && t >= plantAt + 0.055) {
      step.stamped = true;
      const contact: StepContact = { position: step.contact.clone(), heading: step.heading, length: SHOE_LENGTH, width: SHOE_WIDTH, pressure: 1 };
      this.prints.stamp(contact); this.onContact?.(contact);
    }
    shoe.updateMatrixWorld(true);
    const ankle = shoe.localToWorld(ANKLE.clone());
    // With the lens at knee height, keep the knee/hip on the entrance side
    // until the sole settles. Weight transfer then brings the body past it.
    const stride = THREE.MathUtils.lerp(-0.52, 0.42, smooth((t - 0.39) / 0.31));
    const hip = ankle.clone().addScaledVector(step.forward, stride); hip.y += 0.73 - Math.sin(clamp(t / 0.7, 0, 1) * Math.PI) * 0.045;
    const knee = ankle.clone().lerp(hip, 0.5).addScaledVector(step.forward, 0.045 + Math.abs(stride) * 0.06);
    this.model.poseLeg(ankle, knee, hip, step.forward, t > plantAt && t < liftAt ? 1 : 0.5);
    shoe.visible = this.model.trouser.visible = t < 0.84;

    const crossing = (t - 0.38) / 0.58;
    this.foreground.visible = crossing >= 0 && crossing <= 1;
    if (this.foreground.visible) {
      const distance = 0.29;
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * distance;
      const halfWidth = halfHeight * this.camera.aspect;
      const d = step.screenDirection;
      const along = Math.abs(d.x) * halfWidth + Math.abs(d.y) * halfHeight;
      const across = Math.abs(d.y) * halfWidth + Math.abs(d.x) * halfHeight;
      const travel = (smooth(crossing) * 2 - 1) * along * 3.9;
      this.foreground.position.set(d.x * travel, d.y * travel, -distance);
      this.foreground.rotation.z = Math.atan2(d.y, d.x);
      this.foreground.scale.set(along * 1.65, across * 1.95, 1);
    }
    if (t >= 1) {
      this.step = null; this.foreground.visible = shoe.visible = this.model.trouser.visible = false;
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
