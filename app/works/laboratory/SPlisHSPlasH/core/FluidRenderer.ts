import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FLUID_BOUNDS, PbfFluid, type FluidScene, type FluidSettings } from "./PbfFluid";
import { ParticleSurface } from "./ParticleSurface";

const STEP = 1 / 60;
export type FluidRenderMode = "surface" | "particles";

export class FluidRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
  private readonly controls: OrbitControls;
  private particles: THREE.InstancedMesh;
  private surface: ParticleSurface;
  private readonly dummy = new THREE.Object3D();
  private readonly blue = new THREE.Color("#187ab2");
  private readonly white = new THREE.Color("#a9edff");
  private readonly color = new THREE.Color();
  private readonly observer: ResizeObserver;
  private readonly click = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private readonly impactPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);
  private readonly impact = new THREE.Vector3();
  private readonly onPointerDown: (event: PointerEvent) => void;
  private readonly onPointerUp: (event: PointerEvent) => void;
  private readonly onContextLost: (event: Event) => void;
  private frame = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private lastSurfaceUpdate = 0;
  private pointerStart: { x: number; y: number } | null = null;
  private disposed = false;
  paused = false;
  renderMode: FluidRenderMode = "surface";
  surfaceResolution: number;
  surfaceThickness = 1.2;
  fluid: PbfFluid;

  constructor(private readonly canvas: HTMLCanvasElement, settings: FluidSettings) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.setClearColor("#e8eff1");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.65;
    this.scene.background = new THREE.Color("#e8eff1");
    this.scene.fog = new THREE.Fog("#e8eff1", 12, 25);
    this.camera.position.set(5.2, 3.7, 6.7);
    this.camera.lookAt(0, 1.25, 0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1.25, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.minDistance = 4.4;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x688aa0, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 3.3);
    sun.position.set(-3, 7, 5);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x74ceff, 1.8);
    rim.position.set(4, 4, -4);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: "#dce7e9", roughness: 0.89 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    this.scene.add(floor);
    const groundShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(FLUID_BOUNDS.x * 2 + 0.45, FLUID_BOUNDS.z * 2 + 0.45),
      new THREE.MeshBasicMaterial({ color: "#577b8b", transparent: true, opacity: 0.12, depthWrite: false }),
    );
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.y = 0.001;
    this.scene.add(groundShadow);

    const tankGeometry = new THREE.BoxGeometry(FLUID_BOUNDS.x * 2, FLUID_BOUNDS.y, FLUID_BOUNDS.z * 2);
    const tankEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(tankGeometry),
      new THREE.LineBasicMaterial({ color: "#518397", transparent: true, opacity: 0.32, depthWrite: false }),
    );
    tankEdges.position.y = FLUID_BOUNDS.y / 2;
    this.scene.add(tankEdges);
    const grid = new THREE.GridHelper(FLUID_BOUNDS.x * 2, 12, 0x8fb4bf, 0x8fb4bf);
    grid.scale.z = FLUID_BOUNDS.z / FLUID_BOUNDS.x;
    grid.position.y = 0.004;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.25;
    this.scene.add(grid);

    this.fluid = new PbfFluid(settings);
    const dropletGeometry = new THREE.SphereGeometry(0.084, 10, 8);
    const dropletMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.16,
      metalness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      transparent: true,
      opacity: 0.88,
    });
    this.particles = new THREE.InstancedMesh(dropletGeometry, dropletMaterial, settings.particles);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled = false;
    this.particles.visible = false;
    this.scene.add(this.particles);
    this.surfaceResolution = window.matchMedia("(max-width: 640px)").matches ? 36 : 44;
    this.surface = new ParticleSurface(this.surfaceResolution);
    this.scene.add(this.surface.mesh);
    this.surface.update(this.fluid.positions, this.fluid.count, this.surfaceThickness);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.onPointerDown = event => { this.pointerStart = { x: event.clientX, y: event.clientY }; };
    this.onPointerUp = event => {
      const start = this.pointerStart;
      this.pointerStart = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
      const rect = this.canvas.getBoundingClientRect();
      this.click.set((event.clientX - rect.left) / rect.width * 2 - 1,
        -((event.clientY - rect.top) / rect.height * 2 - 1));
      this.ray.setFromCamera(this.click, this.camera);
      if (this.ray.ray.intersectPlane(this.impactPlane, this.impact)) {
        this.fluid.splash(this.impact.x, this.impact.z);
      }
    };
    this.onContextLost = event => { event.preventDefault(); this.paused = true; };
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.frame = requestAnimationFrame(this.animate);
  }

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private syncParticles() {
    const positions = this.fluid.positions;
    const velocities = this.fluid.velocities;
    this.particles.count = this.fluid.count;
    for (let i = 0; i < this.fluid.count; i++) {
      const k = i * 3;
      this.dummy.position.set(positions[k], positions[k + 1], positions[k + 2]);
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(i, this.dummy.matrix);
      const speed = Math.hypot(velocities[k], velocities[k + 1], velocities[k + 2]);
      this.color.copy(this.blue).lerp(this.white, Math.min(speed / 8, 0.8));
      this.particles.setColorAt(i, this.color);
    }
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
  }

  private animate = (timestamp: number) => {
    if (this.disposed) return;
    const elapsed = this.lastFrame ? Math.min((timestamp - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = timestamp;
    if (!this.paused) {
      this.accumulator = Math.min(this.accumulator + elapsed, STEP * 3);
      let count = 0;
      while (this.accumulator >= STEP && count < 3) {
        this.fluid.step(STEP);
        this.accumulator -= STEP;
        count++;
      }
      if (count && this.renderMode === "particles") this.syncParticles();
      if (count && this.renderMode === "surface" && timestamp - this.lastSurfaceUpdate >= 70) {
        const started = performance.now();
        this.surface.update(this.fluid.positions, this.fluid.count, this.surfaceThickness);
        this.lastSurfaceUpdate = timestamp + Math.max(0, (performance.now() - started - 20) * 2);
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };

  reset(scene: FluidScene, settings: FluidSettings) {
    const sameCapacity = settings.particles === this.fluid.settings.particles;
    if (sameCapacity) {
      Object.assign(this.fluid.settings, settings);
      this.fluid.reset(scene);
    } else {
      this.fluid = new PbfFluid(settings);
      this.fluid.reset(scene);
      // InstancedMesh capacity is fixed, so a changed count replaces only this mesh.
      const replacement = new THREE.InstancedMesh(this.particles.geometry, this.particles.material, settings.particles);
      replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      replacement.frustumCulled = false;
      replacement.visible = this.renderMode === "particles";
      this.scene.remove(this.particles);
      this.particles.dispose();
      this.particles = replacement;
      this.scene.add(replacement);
    }
    this.accumulator = 0;
    if (this.renderMode === "surface") this.surface.update(this.fluid.positions, this.fluid.count, this.surfaceThickness);
    else this.syncParticles();
  }

  setRenderMode(mode: FluidRenderMode) {
    this.renderMode = mode;
    this.particles.visible = mode === "particles";
    this.surface.mesh.visible = mode === "surface";
    if (mode === "surface") this.surface.update(this.fluid.positions, this.fluid.count, this.surfaceThickness);
    else this.syncParticles();
  }

  setSurfaceSettings(resolution: number, thickness: number) {
    this.surfaceThickness = thickness;
    if (resolution !== this.surfaceResolution) {
      this.scene.remove(this.surface.mesh);
      this.surface.dispose();
      this.surfaceResolution = resolution;
      this.surface = new ParticleSurface(resolution);
      this.surface.mesh.visible = this.renderMode === "surface";
      this.scene.add(this.surface.mesh);
    }
    if (this.renderMode === "surface") this.surface.update(this.fluid.positions, this.fluid.count, this.surfaceThickness);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.controls.dispose();
    this.particles.dispose();
    this.scene.remove(this.surface.mesh);
    this.surface.dispose();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.GridHelper) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.renderer.dispose();
  }
}
