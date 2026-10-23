import type { Contact, Settings } from "./PaintSolver";

export const FILM_SIZE = 6;
export const FILM_RESOLUTION = 385;
export type FilmState = { height: Float32Array; color: Float32Array; grain: Uint8Array; volume: number };
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (x: number) => { const n = Math.sin(x * 127.1 + 13.7) * 43758.5453; return n - Math.floor(n); };

/** Resting, yielded paint on the substrate. Heights store material volume per area.
 * The blade redistributes that volume; it never stamps new paint into empty cells.
 * Raised/free material is still handled by the 3D PBF solver.
 */
export class PaintFilm {
  readonly n = FILM_RESOLUTION;
  readonly cell = FILM_SIZE / (this.n - 1);
  readonly area = this.cell ** 2;
  height = new Float32Array(this.n ** 2);
  color = new Float32Array(this.n ** 2 * 3).fill(.89);
  grain = new Uint8Array(this.n ** 2 * 4);
  dirty = true;
  private history: FilmState | null = null;
  private bladeLevel: number | null = null;

  volume() { let h = 0; for (const v of this.height) h += v; return h * this.area; }
  snapshot(): FilmState { return { height: this.height.slice(), color: this.color.slice(), grain: this.grain.slice(), volume: this.volume() }; }
  remember() { this.history = this.snapshot(); }
  undo() { if (!this.history) return; const previous = this.history; this.remember(); this.height.set(previous.height); this.color.set(previous.color); this.grain.set(previous.grain); this.dirty = true; this.end(); }
  clear() { this.remember(); this.height.fill(0); this.color.fill(.89); this.grain.fill(0); this.dirty = true; this.end(); }
  end() { this.bladeLevel = null; }
  sample(x: number, z: number) {
    const u = clamp((x + 3) / this.cell, 0, this.n - 1.001), v = clamp((z + 3) / this.cell, 0, this.n - 1.001);
    const ix = Math.floor(u), iz = Math.floor(v), fx = u - ix, fz = v - iz, k = iz * this.n + ix;
    return (this.height[k] * (1 - fx) + this.height[k + 1] * fx) * (1 - fz)
      + (this.height[k + this.n] * (1 - fx) + this.height[k + this.n + 1] * fx) * fz;
  }
  private cells(x: number, z: number, radius: number, visit: (i: number, x: number, z: number) => void) {
    const x0 = Math.max(0, Math.floor((x - radius + 3) / this.cell)), x1 = Math.min(this.n - 1, Math.ceil((x + radius + 3) / this.cell));
    const z0 = Math.max(0, Math.floor((z - radius + 3) / this.cell)), z1 = Math.min(this.n - 1, Math.ceil((z + radius + 3) / this.cell));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) visit(iz * this.n + ix, ix * this.cell - 3, iz * this.cell - 3);
  }
  private add(i: number, height: number, color: readonly number[]) {
    const old = this.height[i], next = old + height;
    for (let k = 0; k < 3; k++) this.color[i * 3 + k] = (this.color[i * 3 + k] * old + color[k] * height) / Math.max(next, 1e-9);
    this.height[i] = next;
  }
  /** Conservative particle-to-film transfer; the normalized footprint preserves volume. */
  deposit(x: number, z: number, volume: number, color: readonly number[], radius = .065) {
    let total = 0; const cells: [number, number][] = [];
    this.cells(x, z, radius, (i, px, pz) => {
      const q = ((px - x) ** 2 + (pz - z) ** 2) / radius ** 2;
      if (q < 1) { const w = (1 - q) ** 2; cells.push([i, w]); total += w; }
    });
    if (!total) return;
    for (const [i, w] of cells) this.add(i, volume / this.area * w / total, color);
    this.dirty = true;
  }
  /** Remove a small coherent patch for the tool's adhesive pickup. */
  extract(x: number, z: number, requested: number, quantum: number): { volume: number; color: number[] } {
    let available = 0; const cells: number[] = [], color = [0, 0, 0];
    this.cells(x, z, .09, (i, px, pz) => { if (Math.hypot(px - x, pz - z) < .09) { cells.push(i); available += this.height[i] * this.area; } });
    const volume = Math.floor(Math.min(requested, available * .28) / quantum) * quantum, ratio = volume / Math.max(available, 1e-10);
    for (const i of cells) {
      const removed = this.height[i] * ratio;
      for (let k = 0; k < 3; k++) color[k] += this.color[i * 3 + k] * removed * this.area;
      this.height[i] -= removed;
    }
    for (let k = 0; k < 3; k++) color[k] /= Math.max(volume, 1e-10);
    if (volume) this.dirty = true;
    return { volume, color };
  }
  contact(c: Contact, s: Settings) {
    if (s.tool === "tube" || s.tool === "view" || c.lifting > 0) return;
    if (this.bladeLevel === null && Math.hypot(c.dx, c.dz) < .0001) return;
    const width = .16 + s.size * .012, ca = Math.cos(c.angle), sa = Math.sin(c.angle);
    const brush = ["flat", "round", "fan"].includes(s.tool), halfLength = width * (brush ? .2 : .42);
    const pressure = clamp(s.pressure / 100 * c.pressure);
    if (this.bladeLevel === null) this.bladeLevel = Math.max(.008, this.sample(c.x, c.z) * (1 - pressure * .7));
    const cells: { i: number; cross: number; along: number; edge: number; halfWidth: number }[] = [];
    let removed = 0, crossMoment = 0, crossMoment2 = 0; const pigment = [0, 0, 0];
    this.cells(c.x, c.z, width, (i, x, z) => {
      const cross = (x - c.x) * ca - (z - c.z) * sa, along = (x - c.x) * sa + (z - c.z) * ca;
      let halfWidth = width * .5;
      if (s.tool === "pointed") halfWidth *= clamp((along / halfLength + 1) * .5, .06, 1);
      if (s.tool === "fan") halfWidth *= clamp(.55 + .5 * along / halfLength, .35, 1.1);
      if (Math.abs(cross) > halfWidth + this.cell || Math.abs(along) > halfLength + this.cell) return;
      if (s.tool === "round" && (cross / halfWidth) ** 2 + (along / halfLength) ** 2 > 1) return;
      const edge = Math.min(halfWidth - Math.abs(cross), halfLength - Math.abs(along));
      cells.push({ i, cross, along, edge, halfWidth });
      if (edge < this.cell * 1.6 || this.height[i] <= .001) return;
      const grooves = brush ? .003 * (.5 + .5 * Math.sin(cross * 80 + Math.sin(cross * 23))) : 0;
      const plane = this.bladeLevel! + grooves + Math.max(0, along) * .012;
      const mobility = .5 + .5 / (1 + s.viscosity * .03);
      const excess = Math.max(0, this.height[i] - plane) * (.45 + pressure * .5) * mobility;
      this.height[i] -= excess; removed += excess;
      crossMoment += excess * cross; crossMoment2 += excess * cross * cross;
      for (let k = 0; k < 3; k++) pigment[k] += excess * this.color[i * 3 + k];
      const g = i * 4; this.grain[g] = Math.round((sa * .5 + .5) * 255); this.grain[g + 1] = Math.round((ca * .5 + .5) * 255);
      this.grain[g + 2] = brush ? 230 : 90; this.grain[g + 3] = 255;
    });
    if (removed > 0) {
      for (let k = 0; k < 3; k++) pigment[k] /= removed;
      const crossMean = crossMoment / removed;
      const spread = Math.sqrt(Math.max(0, crossMoment2 / removed - crossMean ** 2)) * 1.4 + this.cell * 2;
      // Front/side banks receive what the blade removed. A narrow bank produces
      // an actual raised, shadow-casting knife lip rather than a blurred blob.
      const weights = cells.map(p => {
        const side = Math.exp(-Math.abs(p.halfWidth - Math.abs(p.cross) - this.cell * .6) / (this.cell * 1.2));
        const front = Math.exp(-Math.abs(halfLength - p.along - this.cell * .6) / (this.cell * 1.2));
        // No trailing-edge bank on every integration step: that stamps an
        // artificial transverse washboard into an otherwise continuous stroke.
        // A small dollop cannot instantly fill the whole blade outline. Limit
        // outflow to the lateral extent of material actually displaced this step.
        const coverage = Math.exp(-.5 * ((p.cross - crossMean) / spread) ** 2);
        return (side * .7 + front * .3) * coverage;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total > 0) cells.forEach((p, j) => this.add(p.i, removed * weights[j] / total, pigment));
      // Banks yield sideways under the blade instead of growing into vertical
      // walls. Pairwise flux preserves both material and pigment at the boundary.
      const yieldHeight = .025 + s.retention * .0004;
      const flux = (a: number, b: number) => {
        const difference = this.height[a] - this.height[b];
        if (Math.abs(difference) < yieldHeight) return;
        const hi = difference > 0 ? a : b, lo = difference > 0 ? b : a;
        const amount = (Math.abs(difference) - yieldHeight) * .22;
        const old = this.height[lo], next = old + amount;
        for (let k = 0; k < 3; k++) this.color[lo * 3 + k] = (this.color[lo * 3 + k] * old + this.color[hi * 3 + k] * amount) / next;
        this.height[hi] -= amount; this.height[lo] = next;
      };
      for (let pass = 0; pass < 3; pass++) this.cells(c.x, c.z, width + .2, (i) => {
        if (i % this.n < this.n - 1) flux(i, i + 1);
        if (i + this.n < this.height.length) flux(i, i + this.n);
      });
    }
    if (cells.length) this.dirty = true;
  }

  /** Procedurally laid palette-knife study: overlapping curved sheets, torn lips
   * and directional scoring. This is a prepared sample, not a fluid rest state.
   */
  prepare(seed = 17) {
    this.remember(); this.end(); this.height.fill(.025); this.color.fill(.89);
    for (let i = 0; i < this.n ** 2; i++) this.grain.set([128, 255, 90, 255], i * 4);
    const order = Array.from({ length: 48 }, (_, i) => i).sort((a, b) => hash(seed + a * 71) - hash(seed + b * 71));
    for (const stroke of order) {
      const r = (n: number) => hash(seed + stroke * 31.17 + n * 7.91);
      const cx = ((stroke % 8) - 3.5) * .8 + (r(1) - .5) * .8;
      const cz = (Math.floor(stroke / 8) - 2.5) * 1.15 + (r(2) - .5) * 1.5;
      const angle = (r(3) - .5) * 1.95, sa = Math.sin(angle), ca = Math.cos(angle);
      const length = 1.9 + r(4) * 1.5, width = .25 + r(5) * .32, curve = (r(6) - .5) * .95;
      const level = .028 + r(7) * .026, ridge = .02 + r(8) * .035;
      this.cells(cx, cz, length, (i, x, z) => {
        const along = (x - cx) * sa + (z - cz) * ca, t = along / length + .5;
        if (t <= 0 || t >= 1) return;
        const bend = curve * Math.sin(t * Math.PI), cross = (x - cx) * ca - (z - cz) * sa - bend;
        const w = width * (.52 + .48 * Math.sin(Math.PI * t) ** .35) * (1 - smooth(.73, 1, t) * .84);
        const ragged = .003 * Math.sin(t * 73 + r(9) * 20) + .002 * Math.sin(t * 151);
        const distance = w - Math.abs(cross) + ragged;
        if (distance < -.035) return;
        const coverage = smooth(-.025, .025, distance) * smooth(0, .045, t) * (1 - smooth(.98, 1, t));
        const score = Math.pow(.5 + .5 * Math.sin(cross * 85 + Math.sin(cross * 17) * 4 + t * .5), 12) * .0015 * smooth(.3, .8, r(13));
        const bed = level + cross * .008 + Math.sin(t * 4.2 + r(10)) * .009 + Math.sin(t * 11 + cross * 4) * .002 - score;
        const lip = Math.exp(-Math.abs(distance - .008) / .022) * ridge * (.65 + .35 * Math.sin(t * 27 + r(11)) ** 2) * (cross > 0 ? 1 : .38);
        const peel = smooth(.8, .96, t) * (1 - smooth(.96, 1, t)) * .028;
        this.height[i] = this.height[i] * (1 - coverage) + (bed + lip + peel) * coverage;
        const direction = angle + Math.atan(curve * Math.cos(t * Math.PI) * Math.PI / length);
        this.grain.set([Math.round((Math.sin(direction) * .5 + .5) * 255), Math.round((Math.cos(direction) * .5 + .5) * 255), 65 + Math.floor(r(12) * 55), 255], i * 4);
      });
    }
    this.dirty = true;
  }
}
