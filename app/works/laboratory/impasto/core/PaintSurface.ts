import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { SPACING, type Contact, type Settings } from "./PaintSolver";
import type { PaintState } from "./protocol";

/** A closed 3D isosurface, including undersides and detached material. */
export class PaintSurface {
  readonly mesh: MarchingCubes;
  readonly material: THREE.MeshPhysicalMaterial;
  private bump: THREE.DataTexture;
  private pixels = new Uint8Array(512 * 512);
  private history: Uint8Array | null = null;
  constructor(resolution: number) {
    const pixels = this.pixels;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      pixels[y * 512 + x] = 125 + Math.floor((noise - Math.floor(noise)) * 6);
    }
    this.bump = new THREE.DataTexture(pixels, 512, 512, THREE.RedFormat);
    this.bump.magFilter = THREE.LinearFilter; this.bump.needsUpdate = true;
    this.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .38,
      metalness: 0, clearcoat: .3, clearcoatRoughness: .3, bumpMap: this.bump, bumpScale: .055,
      side: THREE.DoubleSide });
    this.mesh = new MarchingCubes(resolution, this.material, true, true, 70000);
    // The generated vertex range changes each frame; keep raycasting bounds valid.
    this.mesh.geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    this.mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.sqrt(3));
    this.mesh.isolation = .75; this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }
  remember() { this.history = this.pixels.slice(); }
  undo() { if (this.history) { const current = this.pixels.slice(); this.pixels.set(this.history); this.history = current; this.bump.needsUpdate = true; } }
  clear() { this.remember(); this.pixels.fill(128); this.bump.needsUpdate = true; }
  /** Sub-particle bristle marks supplement, but never replace, the 3D collision surface. */
  mark(c: Contact, s: Settings) {
    if (s.tool === "tube" || s.tool === "view" || c.lifting > 0) return;
    const width = .16 + s.size * .012, ca = Math.cos(c.angle), sa = Math.sin(c.angle), scale = 512 / 6;
    const brush = s.tool === "flat" || s.tool === "round" || s.tool === "fan";
    for (let y = Math.max(0, Math.floor((c.z - width + 3) * scale)); y <= Math.min(511, (c.z + width + 3) * scale); y++) {
      for (let x = Math.max(0, Math.floor((c.x - width + 3) * scale)); x <= Math.min(511, (c.x + width + 3) * scale); x++) {
        const dx = x / scale - 3 - c.x, dz = y / scale - 3 - c.z;
        const cross = dx * ca - dz * sa, along = dx * sa + dz * ca;
        const halfLength = width * (brush ? .2 : .42);
        let halfWidth = width * .5;
        if (s.tool === "pointed") halfWidth *= Math.max(.08, (along / halfLength + 1) * .5);
        if (s.tool === "fan") halfWidth *= Math.max(.35, Math.min(1.1, .55 + .5 * along / halfLength));
        if (Math.abs(cross) > halfWidth || Math.abs(along) > halfLength) continue;
        if (s.tool === "round" && (cross / halfWidth) ** 2 + (along / halfLength) ** 2 > 1) continue;
        const grain = Math.sin(cross * 172 + Math.sin(cross * 51) * 1.7);
        this.pixels[y * 512 + x] = brush ? 128 + Math.round(grain * 35) : 128;
      }
    }
    this.bump.needsUpdate = true;
  }
  update(solver: PaintState) {
    const m = this.mesh, n = m.size, p = solver.positions;
    m.reset(); m.visible = solver.count > 0;
    if (!solver.count) return;
    let minX = Infinity, minY = -.1, minZ = Infinity, maxX = -Infinity, maxY = .25, maxZ = -Infinity;
    for (let i = 0; i < solver.count; i++) {
      const k = i * 3;
      minX = Math.min(minX, p[k]); minZ = Math.min(minZ, p[k + 2]);
      maxX = Math.max(maxX, p[k]); maxY = Math.max(maxY, p[k + 1]); maxZ = Math.max(maxZ, p[k + 2]);
    }
    minX -= .18; minY -= .08; minZ -= .18; maxX += .18; maxY += .18; maxZ += .18;
    const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ;
    m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2); m.scale.set(sx / 2, sy / 2, sz / 2);
    const support = SPACING * 1.9, r2 = support * support, fx = n / sx, fy = n / sy, fz = n / sz;
    for (let i = 0; i < solver.count; i++) {
      const k = i * 3, px = p[k], py = p[k + 1], pz = p[k + 2];
      const x0 = Math.max(1, Math.floor((px - support - minX) * fx)), x1 = Math.min(n - 2, Math.ceil((px + support - minX) * fx));
      const y0 = Math.max(1, Math.floor((py - support - minY) * fy)), y1 = Math.min(n - 2, Math.ceil((py + support - minY) * fy));
      const z0 = Math.max(1, Math.floor((pz - support - minZ) * fz)), z1 = Math.min(n - 2, Math.ceil((pz + support - minZ) * fz));
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x / fx + minX - px, dy = y / fy + minY - py, dz = z / fz + minZ - pz;
        const q = (dx * dx + dy * dy + dz * dz) / r2;
        if (q >= 1) continue;
        const w = (1 - q) ** 3, index = x + y * n + z * n * n;
        m.field[index] += w;
        for (let c = 0; c < 3; c++) m.palette[index * 3 + c] += w * solver.colors[k + c];
      }
    }
    for (let i = 0; i < m.field.length; i++) if (m.field[i] > 0) for (let c = 0; c < 3; c++) m.palette[i * 3 + c] /= m.field[i];
    m.update();
    // Fixed world-space material coordinates keep old grooves from sliding when the bounds change.
    const uv = m.geometry.getAttribute("uv");
    for (let i = 0; i < m.count; i++) {
      uv.setXY(i, (m.positionArray[i * 3] * m.scale.x + m.position.x + 3) / 6,
        (m.positionArray[i * 3 + 2] * m.scale.z + m.position.z + 3) / 6);
    }
    uv.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); this.bump.dispose(); }
}
