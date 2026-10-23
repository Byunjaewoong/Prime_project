/**
 * 3D PBF pressure iteration and cubic kernel adapted from SPlisHSPlasH:
 * TimeStepPBF.cpp / SPHKernels.h (MIT, Jan Bender). See ../LICENSE-SPlisHSPlasH.
 * Plastic springs, extrusion, brush contact and adhesion are application extensions.
 */
export type PaintTool = "tube" | "flat" | "round" | "fan" | "knife" | "pointed" | "view";
export type Settings = { tool: PaintTool; size: number; amount: number; pressure: number;
  viscosity: number; retention: number; adhesion: number; color: string; gloss: number; light: number };
export const DEFAULTS: Settings = { tool: "knife", size: 65, amount: 55, pressure: 75,
  viscosity: 85, retention: 85, adhesion: 60, color: "#f3f3ef", gloss: 18, light: 225 };
export const SPACING = .045;
export const SUPPORT = SPACING * 2.4;
export const RADIUS = SPACING * .44;
export const BOUND = 2.8;
export const PARTICLE_VOLUME = SPACING ** 3;
const VOLUME = PARTICLE_VOLUME, H2 = SUPPORT ** 2;
const K = 8 / (Math.PI * SUPPORT ** 3), L = 48 / (Math.PI * SUPPORT ** 3);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function kernel(r: number) { const q = r / SUPPORT; return q > 1 ? 0 : K * (q <= .5 ? 6 * q ** 3 - 6 * q * q + 1 : 2 * (1 - q) ** 3); }
function gradient(r: number) {
  if (r < 1e-8 || r >= SUPPORT) return 0;
  const q = r / SUPPORT;
  return L * (q <= .5 ? q * (3 * q - 2) : -((1 - q) ** 2)) / (SUPPORT * r);
}
function linear(hex: string) { return [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); }
type Spring = { a: number; b: number; rest: number };
export type Contact = { x: number; z: number; dx: number; dz: number; angle: number; pressure: number; lifting: number };
type Snapshot = { positions: Float32Array; colors: Float32Array; count: number; springs: Spring[] };

export class PaintSolver {
  readonly capacity: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly colors: Float32Array;
  count = 0;
  settings: Settings = { ...DEFAULTS };
  substrate: (x: number, z: number) => number = () => 0;
  private old: Float32Array;
  private delta: Float32Array;
  private lambda: Float32Array;
  private neighbors: number[][];
  private grid = new Map<number, number[]>();
  private springs = new Map<number, Spring>();
  private touches: Float32Array;
  private attached = new Map<number, [number, number, number]>();
  private history: Snapshot | null = null;

  constructor(capacity = 4500) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3); this.velocities = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3); this.old = new Float32Array(capacity * 3);
    this.delta = new Float32Array(capacity * 3); this.lambda = new Float32Array(capacity);
    this.touches = new Float32Array(capacity); this.neighbors = Array.from({ length: capacity }, () => []);
  }

  private key(x: number, y: number, z: number) { return x + y * 128 + z * 16384; }
  private cells(x: number, y: number, z: number) { return [Math.floor((x + 4) / SUPPORT), Math.floor((y + 1) / SUPPORT), Math.floor((z + 4) / SUPPORT)]; }
  private search() {
    this.grid.clear(); const p = this.positions;
    for (let i = 0; i < this.count; i++) {
      const [x, y, z] = this.cells(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      const key = this.key(x, y, z), list = this.grid.get(key);
      if (list) list.push(i); else this.grid.set(key, [i]);
    }
    for (let i = 0; i < this.count; i++) {
      const k = i * 3, [x, y, z] = this.cells(p[k], p[k + 1], p[k + 2]), near = this.neighbors[i]; near.length = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const list = this.grid.get(this.key(x + dx, y + dy, z + dz));
        if (!list) continue;
        for (const j of list) {
          if (i === j) continue;
          const q = j * 3, rx = p[k] - p[q], ry = p[k + 1] - p[q + 1], rz = p[k + 2] - p[q + 2];
          if (rx * rx + ry * ry + rz * rz < H2) near.push(j);
        }
      }
    }
  }

  remember() { this.history = { positions: this.positions.slice(0, this.count * 3), colors: this.colors.slice(0, this.count * 3), count: this.count, springs: [...this.springs.values()].map(s => ({ ...s })) }; }
  undo() {
    if (!this.history) return;
    const snapshot = this.history; this.remember(); this.count = snapshot.count;
    this.positions.set(snapshot.positions); this.colors.set(snapshot.colors); this.velocities.fill(0);
    this.springs.clear(); for (const s of snapshot.springs) this.springs.set(s.a * this.capacity + s.b, { ...s });
    this.attached.clear();
  }
  clear() { this.remember(); this.count = 0; this.springs.clear(); this.attached.clear(); this.velocities.fill(0); }
  endContact() { this.attached.clear(); }

  /** Convert yielded particles to resting paint without discarding their volume. */
  depositContact(deposit: (x: number, z: number, volume: number, color: number[]) => void) {
    const previous = this.count;
    let next = 0; const attachments = new Map<number, [number, number, number]>();
    for (let i = 0; i < this.count; i++) {
      const k = i * 3, x = this.positions[k], y = this.positions[k + 1], z = this.positions[k + 2];
      if (this.touches[i] && !this.attached.has(i) && y - this.substrate(x, z) < SPACING * 2.8) {
        deposit(x, z, VOLUME, Array.from(this.colors.subarray(k, k + 3))); continue;
      }
      const attachment = this.attached.get(i); if (attachment) attachments.set(next, attachment);
      for (let a = 0; a < 3; a++) { this.positions[next * 3 + a] = this.positions[k + a]; this.colors[next * 3 + a] = this.colors[k + a]; this.velocities[next * 3 + a] = this.velocities[k + a]; }
      next++;
    }
    if (next !== this.count) { this.springs.clear(); this.attached = attachments; this.count = next; }
    return previous - next;
  }
  pickUp(c: Contact, color: number[], count: number) {
    for (let n = 0; n < count && this.count < this.capacity; n++) {
      const i = this.count++, k = i * 3, x = c.x + (n % 3 - 1) * SPACING, z = c.z + Math.floor(n / 3) * SPACING;
      const y = this.substrate(x, z) + RADIUS;
      this.positions.set([x, y, z], k); this.colors.set(color, k); this.velocities.fill(0, k, k + 3);
      this.attached.set(i, [x - c.x, y, z - c.z]);
    }
  }

  /** Nozzle adds equal-volume particles; spreading never creates or deletes mass. */
  emit(x: number, z: number, count: number) {
    const color = linear(this.settings.color);
    const width = .14 + this.settings.size * .0015;
    const nozzle: [number, number][] = [];
    const extent = Math.ceil(width / SPACING);
    for (let row = -extent; row <= extent; row++) for (let col = -extent; col <= extent; col++) {
      const px = (col + (row % 2) * .5) * SPACING, pz = row * SPACING * .866;
      if (px * px + pz * pz < width * width) nozzle.push([px, pz]);
    }
    for (let n = 0; n < count && this.count < this.capacity; n++) {
      const offset = nozzle[this.count % nozzle.length];
      const px = clamp(x + offset[0], -BOUND + .1, BOUND - .1);
      const pz = clamp(z + offset[1], -BOUND + .1, BOUND - .1);
      let py = this.substrate(px, pz) + RADIUS;
      for (let j = 0; j < this.count; j++) {
        const q = j * 3, dx = this.positions[q] - px, dz = this.positions[q + 2] - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < SPACING ** 2 * .42) py = Math.max(py, this.positions[q + 1] + Math.sqrt(SPACING ** 2 * .85 - d2));
      }
      // Spread a full nozzle footprint before filling a taller column.
      if (py > 1.45) break;
      const k = this.count++ * 3;
      this.positions[k] = px; this.positions[k + 1] = py; this.positions[k + 2] = pz;
      this.colors.set(color, k); this.velocities[k] = this.velocities[k + 1] = this.velocities[k + 2] = 0;
    }
  }

  private confine(k: number) {
    const p = this.positions;
    p[k] = clamp(p[k], -BOUND, BOUND); p[k + 2] = clamp(p[k + 2], -BOUND, BOUND);
    p[k + 1] = clamp(p[k + 1], this.substrate(p[k], p[k + 2]) + RADIUS, 1.8);
  }

  private contact(c: Contact, transport: boolean) {
    if (this.settings.tool === "tube" || this.settings.tool === "view") return;
    const p = this.positions, s = this.settings;
    const width = .16 + s.size * .012, ca = Math.cos(c.angle), sa = Math.sin(c.angle);
    const pressure = clamp(s.pressure / 100 * c.pressure, .05, 1);
    const bottom = RADIUS + .18 * (1 - pressure);
    const brush = s.tool === "flat" || s.tool === "round" || s.tool === "fan";
    if (transport && c.lifting === 0) this.attached.clear();
    for (let i = 0; i < this.count; i++) {
      const k = i * 3, dx = p[k] - c.x, dz = p[k + 2] - c.z;
      const cross = dx * ca - dz * sa, along = dx * sa + dz * ca;
      const halfLength = s.tool === "knife" || s.tool === "pointed" ? width * .42 : width * .2;
      let halfWidth = width * .5;
      if (s.tool === "pointed") halfWidth *= clamp((along / halfLength + 1) * .5, .08, 1);
      if (s.tool === "fan") halfWidth *= clamp(.55 + .5 * along / halfLength, .35, 1.1);
      if (Math.abs(cross) > halfWidth || Math.abs(along) > halfLength) continue;
      if (s.tool === "round" && (cross / halfWidth) ** 2 + (along / halfLength) ** 2 > 1) continue;
      // Each bristle reaches a slightly different depth. This deforms particle geometry.
      const bristle = brush ? .033 * (.5 + .5 * Math.cos(cross * 48)) + .008 * Math.sin(cross * 89) : 0;
      const floor = this.substrate(p[k], p[k + 2]);
      const surface = floor + bottom + bristle + Math.max(0, along) * (brush ? .1 : .15);
      if (c.lifting > 0) continue;
      if (p[k + 1] < surface - .07 || p[k + 1] > surface + .8) continue;
      this.touches[i] = 1;
      if (transport) {
        // No-slip substrate: the bottom film stays on the board while the tool
        // shears the upper material. Uniform drag picked up the whole dollop.
        const shear = clamp((p[k + 1] - floor - RADIUS) / (SPACING * 1.8), 0, 1);
        const drag = (brush ? .8 : .5) * (.35 + s.viscosity * .006) * shear;
        p[k] += c.dx * drag; p[k + 2] += c.dz * drag;
      }
      if (p[k + 1] > surface) p[k + 1] = surface;
      if (Math.abs(cross) < width * .12 && Math.abs(along) < halfLength * .35 && this.attached.size < (brush ? 8 : 4))
        this.attached.set(i, [p[k] - c.x, p[k + 1], p[k + 2] - c.z]);
    }
    if (c.lifting > 0 && transport) {
      for (const [i, offset] of this.attached) {
        const k = i * 3, lift = c.lifting * (.08 + s.adhesion * .003);
        const tx = c.x + offset[0], ty = offset[1] + lift, tz = c.z + offset[2];
        const separation = Math.hypot(tx - p[k], ty - p[k + 1], tz - p[k + 2]);
        if (c.lifting > .7 || separation > .05 + s.adhesion * .0015) { this.attached.delete(i); continue; }
        const grip = s.adhesion / 100 * .22;
        p[k] += (tx - p[k]) * grip; p[k + 1] += (ty - p[k + 1]) * grip; p[k + 2] += (tz - p[k + 2]) * grip;
        this.touches[i] = 1;
      }
    }
  }

  step(dt = 1 / 60, contact: Contact | null = null) {
    if (!this.count) return 0;
    dt = clamp(dt, 1 / 240, 1 / 40);
    const p = this.positions, v = this.velocities, s = this.settings;
    this.old.set(p.subarray(0, this.count * 3)); this.touches.fill(0);
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      v[k + 1] -= .8 * dt;
      for (let a = 0; a < 3; a++) p[k + a] += clamp(v[k + a] * dt, -.035, .035);
      this.confine(k);
    }
    if (contact) this.contact(contact, true);
    this.search();
    // Bond topology evolves locally; bonds yield to permanent rest lengths under tool stress.
    for (let i = 0; i < this.count; i++) for (const j of this.neighbors[i]) {
      if (j <= i) continue;
      const key = i * this.capacity + j;
      if (this.springs.has(key)) continue;
      const k = i * 3, q = j * 3, r = Math.hypot(p[k] - p[q], p[k + 1] - p[q + 1], p[k + 2] - p[q + 2]);
      if (r < SPACING * 1.55 && r > SPACING * .65) this.springs.set(key, { a: i, b: j, rest: r });
    }
    for (let iteration = 0; iteration < 4; iteration++) {
      // SPlisHSPlasH pressureSolveIteration, single fluid and analytic board boundary.
      for (let i = 0; i < this.count; i++) {
        const k = i * 3; let density = VOLUME * K, gx = 0, gy = 0, gz = 0, denom = 0;
        for (const j of this.neighbors[i]) {
          const q = j * 3, x = p[k] - p[q], y = p[k + 1] - p[q + 1], z = p[k + 2] - p[q + 2];
          const r = Math.hypot(x, y, z); density += VOLUME * kernel(r);
          const g = VOLUME * gradient(r), a = g * x, b = g * y, c = g * z;
          gx += a; gy += b; gz += c; denom += a * a + b * b + c * c;
        }
        this.lambda[i] = -Math.max(0, density - 1) / (denom + gx * gx + gy * gy + gz * gz + 1e-6);
      }
      this.delta.fill(0, 0, this.count * 3);
      for (let i = 0; i < this.count; i++) {
        const k = i * 3;
        for (const j of this.neighbors[i]) {
          const q = j * 3, x = p[k] - p[q], y = p[k + 1] - p[q + 1], z = p[k + 2] - p[q + 2];
          const f = (this.lambda[i] + this.lambda[j]) * VOLUME * gradient(Math.hypot(x, y, z));
          this.delta[k] += f * x; this.delta[k + 1] += f * y; this.delta[k + 2] += f * z;
        }
      }
      for (const [key, spring] of this.springs) {
        const a = spring.a * 3, b = spring.b * 3;
        const x = p[b] - p[a], y = p[b + 1] - p[a + 1], z = p[b + 2] - p[a + 2], r = Math.hypot(x, y, z);
        if (r > SUPPORT * 1.7 || r < .00001) { this.springs.delete(key); continue; }
        const touched = this.touches[spring.a] + this.touches[spring.b] > 0;
        const threshold = spring.rest * (.08 + s.retention * .002);
        const strain = r - spring.rest;
        // Contact exceeds the yield stress: remember the compressed shape instead
        // of storing spring energy that would pull an entire smear up on release.
        if (touched) spring.rest += strain * .75;
        else if (Math.abs(strain) > threshold) spring.rest += Math.sign(strain) * (Math.abs(strain) - threshold) * .025;
        const correction = (r - spring.rest) / r * (.008 + s.retention * .0006);
        this.delta[a] += x * correction; this.delta[a + 1] += y * correction; this.delta[a + 2] += z * correction;
        this.delta[b] -= x * correction; this.delta[b + 1] -= y * correction; this.delta[b + 2] -= z * correction;
      }
      for (let i = 0; i < this.count; i++) {
        const k = i * 3, d = Math.hypot(this.delta[k], this.delta[k + 1], this.delta[k + 2]);
        const scale = d > .024 ? .024 / d : 1;
        for (let a = 0; a < 3; a++) p[k + a] += this.delta[k + a] * scale;
        this.confine(k);
      }
      if (contact) this.contact(contact, false);
    }
    for (let k = 0; k < this.count * 3; k++) v[k] = (p[k] - this.old[k]) / dt;
    // Stable backward-Euler graph viscosity (Jacobi); large viscosity does not explode.
    const alpha = s.viscosity * .06;
    this.old.set(v.subarray(0, this.count * 3));
    for (let iteration = 0; iteration < 3; iteration++) {
      for (let i = 0; i < this.count; i++) {
        const k = i * 3; let wsum = 0, x = 0, y = 0, z = 0;
        for (const j of this.neighbors[i]) {
          const q = j * 3, w = VOLUME * kernel(Math.hypot(p[k] - p[q], p[k + 1] - p[q + 1], p[k + 2] - p[q + 2]));
          wsum += w; x += w * v[q]; y += w * v[q + 1]; z += w * v[q + 2];
        }
        const denominator = 1 + alpha * wsum;
        this.delta[k] = (this.old[k] + alpha * x) / denominator;
        this.delta[k + 1] = (this.old[k + 1] + alpha * y) / denominator;
        this.delta[k + 2] = (this.old[k + 2] + alpha * z) / denominator;
      }
      v.set(this.delta.subarray(0, this.count * 3));
    }
    let speed = 0;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3, damping = Math.exp(-(2 + s.viscosity * .1) * dt);
      const floor = this.substrate(p[k], p[k + 2]);
      const friction = p[k + 1] < floor + RADIUS * 1.8 ? .25 : 1;
      v[k] *= damping * friction; v[k + 1] *= damping; v[k + 2] *= damping * friction;
      if (p[k + 1] <= floor + RADIUS + .001 && v[k + 1] < 0) v[k + 1] = 0;
      speed = Math.max(speed, Math.hypot(v[k], v[k + 1], v[k + 2]));
    }
    return speed;
  }
}
