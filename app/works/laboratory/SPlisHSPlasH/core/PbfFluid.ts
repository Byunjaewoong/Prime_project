/**
 * Browser PBF study informed by SPlisHSPlasH's position-based fluids solver.
 * This is a compact TypeScript implementation, not the native C++ library.
 * https://github.com/InteractiveComputerGraphics/SPlisHSPlasH
 */

export type FluidScene = "dam" | "drops" | "fountain";

export type FluidSettings = {
  particles: number;
  gravity: number;
  viscosity: number;
  pressureIterations: number;
};

export const FLUID_BOUNDS = { x: 2.25, y: 3.1, z: 1.15 };

const SPACING = 0.15;
const RADIUS = 0.075;
const SUPPORT = 0.32;
const SUPPORT_2 = SUPPORT * SUPPORT;
const MASS_OVER_REST = SPACING ** 3;
const POLY6 = 315 / (64 * Math.PI * SUPPORT ** 9);
const SPIKY = -45 / (Math.PI * SUPPORT ** 6);
const SELF_WEIGHT = POLY6 * SUPPORT_2 ** 3;
const CORR_REFERENCE = POLY6 * (SUPPORT_2 - (0.3 * SUPPORT) ** 2) ** 3;
const FIXED_STEP = 1 / 60;

function poly6(distanceSquared: number) {
  if (distanceSquared >= SUPPORT_2) return 0;
  const residual = SUPPORT_2 - distanceSquared;
  return POLY6 * residual * residual * residual;
}

function cellKey(x: number, y: number, z: number) {
  return x + y * 64 + z * 4096;
}

export class PbfFluid {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly settings: FluidSettings;
  count = 0;
  scene: FluidScene = "dam";

  private readonly previous: Float32Array;
  private readonly lambdas: Float32Array;
  private readonly corrections: Float32Array;
  private readonly neighbors: number[][];
  private readonly buckets = new Map<number, number[]>();
  private emitterClock = 0;

  constructor(settings: FluidSettings) {
    this.settings = { ...settings };
    this.positions = new Float32Array(settings.particles * 3);
    this.velocities = new Float32Array(settings.particles * 3);
    this.previous = new Float32Array(settings.particles * 3);
    this.lambdas = new Float32Array(settings.particles);
    this.corrections = new Float32Array(settings.particles * 3);
    this.neighbors = Array.from({ length: settings.particles }, () => []);
    this.reset("dam");
  }

  private add(x: number, y: number, z: number, vx = 0, vy = 0, vz = 0) {
    if (this.count >= this.settings.particles) return;
    const offset = this.count++ * 3;
    this.positions[offset] = x;
    this.positions[offset + 1] = y;
    this.positions[offset + 2] = z;
    this.velocities[offset] = vx;
    this.velocities[offset + 1] = vy;
    this.velocities[offset + 2] = vz;
  }

  reset(scene: FluidScene = this.scene) {
    this.scene = scene;
    this.count = 0;
    this.emitterClock = 0;
    this.velocities.fill(0);
    if (scene === "dam") {
      const nx = 9;
      const nz = 8;
      const ny = Math.ceil(this.settings.particles / (nx * nz));
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
        this.add(-2.0 + x * SPACING, RADIUS + y * SPACING, -0.55 + z * SPACING);
      }
    } else if (scene === "drops") {
      const poolTarget = Math.floor(this.settings.particles * 0.55);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 18; x++) for (let z = 0; z < 8; z++) {
        if (this.count >= poolTarget) break;
        this.add(-1.35 + x * SPACING, RADIUS + y * SPACING, -0.55 + z * SPACING);
      }
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) {
        const dx = (x - 4.5) * SPACING;
        const dy = (y - 4.5) * SPACING;
        const dz = (z - 4.5) * SPACING;
        if (dx * dx + dy * dy + dz * dz < 0.58 ** 2) this.add(dx, 2.08 + dy, dz);
      }
    } else {
      for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) for (let z = 0; z < 8; z++) {
        this.add(-1.15 + x * SPACING, RADIUS + y * SPACING, -0.55 + z * SPACING);
      }
    }
  }

  private emit(dt: number) {
    if (this.scene !== "fountain" || this.count >= this.settings.particles) return;
    this.emitterClock += dt * 90;
    while (this.emitterClock >= 1 && this.count < this.settings.particles) {
      this.emitterClock--;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 0.14;
      this.add(radius * Math.cos(angle), 0.23, radius * Math.sin(angle),
        (Math.random() - 0.5) * 0.8, 5.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8);
    }
  }

  private confine(offset: number) {
    const p = this.positions;
    p[offset] = Math.max(-FLUID_BOUNDS.x + RADIUS, Math.min(FLUID_BOUNDS.x - RADIUS, p[offset]));
    p[offset + 1] = Math.max(RADIUS, Math.min(FLUID_BOUNDS.y - RADIUS, p[offset + 1]));
    p[offset + 2] = Math.max(-FLUID_BOUNDS.z + RADIUS, Math.min(FLUID_BOUNDS.z - RADIUS, p[offset + 2]));
  }

  private findNeighbors() {
    const p = this.positions;
    this.buckets.clear();
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      const x = Math.floor((p[k] + FLUID_BOUNDS.x) / SUPPORT);
      const y = Math.floor(p[k + 1] / SUPPORT);
      const z = Math.floor((p[k + 2] + FLUID_BOUNDS.z) / SUPPORT);
      const key = cellKey(x, y, z);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = [];
        this.buckets.set(key, bucket);
      }
      bucket.push(i);
    }
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      const x = Math.floor((p[k] + FLUID_BOUNDS.x) / SUPPORT);
      const y = Math.floor(p[k + 1] / SUPPORT);
      const z = Math.floor((p[k + 2] + FLUID_BOUNDS.z) / SUPPORT);
      const near = this.neighbors[i];
      near.length = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.buckets.get(cellKey(x + dx, y + dy, z + dz));
        if (!bucket) continue;
        for (const j of bucket) {
          if (j === i) continue;
          const q = j * 3;
          const rx = p[k] - p[q];
          const ry = p[k + 1] - p[q + 1];
          const rz = p[k + 2] - p[q + 2];
          if (rx * rx + ry * ry + rz * rz < SUPPORT_2) near.push(j);
        }
      }
    }
  }

  step(dt = FIXED_STEP) {
    const p = this.positions;
    const v = this.velocities;
    const old = this.previous;
    this.emit(dt);
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      old[k] = p[k]; old[k + 1] = p[k + 1]; old[k + 2] = p[k + 2];
      v[k + 1] -= this.settings.gravity * dt;
      p[k] += v[k] * dt;
      p[k + 1] += v[k + 1] * dt;
      p[k + 2] += v[k + 2] * dt;
      this.confine(k);
    }

    for (let iteration = 0; iteration < this.settings.pressureIterations; iteration++) {
      this.findNeighbors();
      for (let i = 0; i < this.count; i++) {
        const k = i * 3;
        let density = MASS_OVER_REST * SELF_WEIGHT;
        let gx = 0, gy = 0, gz = 0, denominator = 0;
        for (const j of this.neighbors[i]) {
          const q = j * 3;
          const rx = p[k] - p[q];
          const ry = p[k + 1] - p[q + 1];
          const rz = p[k + 2] - p[q + 2];
          const r2 = rx * rx + ry * ry + rz * rz;
          const r = Math.sqrt(r2);
          density += MASS_OVER_REST * poly6(r2);
          if (r < 1e-5) continue;
          const grad = MASS_OVER_REST * SPIKY * (SUPPORT - r) ** 2 / r;
          const sx = grad * rx, sy = grad * ry, sz = grad * rz;
          gx += sx; gy += sy; gz += sz;
          denominator += sx * sx + sy * sy + sz * sz;
        }
        denominator += gx * gx + gy * gy + gz * gz;
        this.lambdas[i] = -Math.max(density - 1, 0) / (denominator + 1e-4);
      }

      for (let i = 0; i < this.count; i++) {
        const k = i * 3;
        let dx = 0, dy = 0, dz = 0;
        for (const j of this.neighbors[i]) {
          const q = j * 3;
          const rx = p[k] - p[q];
          const ry = p[k + 1] - p[q + 1];
          const rz = p[k + 2] - p[q + 2];
          const r2 = rx * rx + ry * ry + rz * rz;
          const r = Math.sqrt(r2);
          if (r < 1e-5) continue;
          const w = poly6(r2);
          const tensile = -0.002 * (w / CORR_REFERENCE) ** 4;
          const factor = (this.lambdas[i] + this.lambdas[j] + tensile) *
            MASS_OVER_REST * SPIKY * (SUPPORT - r) ** 2 / r;
          dx += factor * rx;
          dy += factor * ry;
          dz += factor * rz;
        }
        const correction = Math.hypot(dx, dy, dz);
        const scale = correction > 0.06 ? 0.06 / correction : 1;
        this.corrections[k] = dx * scale;
        this.corrections[k + 1] = dy * scale;
        this.corrections[k + 2] = dz * scale;
      }
      for (let i = 0; i < this.count; i++) {
        const k = i * 3;
        p[k] += this.corrections[k];
        p[k + 1] += this.corrections[k + 1];
        p[k + 2] += this.corrections[k + 2];
        this.confine(k);
      }
    }

    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      v[k] = (p[k] - old[k]) / dt;
      v[k + 1] = (p[k + 1] - old[k + 1]) / dt;
      v[k + 2] = (p[k + 2] - old[k + 2]) / dt;
      if (p[k + 1] <= RADIUS + 1e-4 && v[k + 1] < 0) v[k + 1] *= -0.12;
      if (Math.abs(p[k]) >= FLUID_BOUNDS.x - RADIUS - 1e-4) v[k] *= 0.45;
      if (Math.abs(p[k + 2]) >= FLUID_BOUNDS.z - RADIUS - 1e-4) v[k + 2] *= 0.45;
    }

    // XSPH velocity filtering, also exposed by SPlisHSPlasH.
    const viscosity = this.settings.viscosity;
    if (viscosity > 0) {
      for (let i = 0; i < this.count; i++) {
        const k = i * 3;
        let vx = 0, vy = 0, vz = 0;
        for (const j of this.neighbors[i]) {
          const q = j * 3;
          const rx = p[k] - p[q], ry = p[k + 1] - p[q + 1], rz = p[k + 2] - p[q + 2];
          const weight = MASS_OVER_REST * poly6(rx * rx + ry * ry + rz * rz);
          vx += (v[q] - v[k]) * weight;
          vy += (v[q + 1] - v[k + 1]) * weight;
          vz += (v[q + 2] - v[k + 2]) * weight;
        }
        this.corrections[k] = vx;
        this.corrections[k + 1] = vy;
        this.corrections[k + 2] = vz;
      }
      for (let i = 0; i < this.count * 3; i++) v[i] += viscosity * this.corrections[i];
    }
  }

  splash(x: number, z: number) {
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      const dx = this.positions[k] - x;
      const dz = this.positions[k + 2] - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.85 ** 2) continue;
      const impulse = Math.exp(-d2 * 5) * 3.5;
      this.velocities[k] += dx * impulse;
      this.velocities[k + 1] += impulse * 1.6;
      this.velocities[k + 2] += dz * impulse;
    }
  }
}
