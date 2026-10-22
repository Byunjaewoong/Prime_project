/** A 2.5D plastic paint layer. Distances/heights use a 1,000-unit square canvas. */
export type Tool = "knife" | "brush" | "smear";
export type PaintSettings = {
  tool: Tool; size: number; load: number; viscosity: number; yield: number;
  adhesion: number; texture: number; relief: number; lightAngle: number;
  lightHeight: number; gloss: number; color: string;
};
export const DEFAULTS: PaintSettings = {
  tool: "knife", size: 95, load: 65, viscosity: 82, yield: 86, adhesion: 72,
  texture: 78, relief: 100, lightAngle: 135, lightHeight: 28, gloss: 38, color: "#f4f1e7",
};
export type Point = { x: number; y: number; pressure: number };
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash(x: number, y: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), u = smooth(0, 1, x - ix), v = smooth(0, 1, y - iy);
  return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v)
    + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}
function linear(hex: string) {
  return [1, 3, 5].map(i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
}

export class PaintField {
  readonly size: number;
  readonly data: Float32Array;
  private before: Float32Array | null = null;
  private undoData: Float32Array | null = null;
  private direction = { x: .3, y: .95 };
  private phase = 0;
  private carried = 2;
  private bounds = [0, 0, 0, 0];
  private scratch: Float32Array;

  constructor(size: number) {
    this.size = size;
    this.data = new Float32Array(size * size * 4);
    this.scratch = new Float32Array(size * size);
    this.clear(false);
  }

  clear(remember = true) {
    if (remember) this.undoData = this.data.slice();
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const i = (y * this.size + x) * 4;
      this.data[i] = .91; this.data[i + 1] = .895; this.data[i + 2] = .86;
      this.data[i + 3] = .65 + .06 * noise(x * .08, y * .08);
    }
  }

  undo() {
    if (!this.undoData) return;
    const current = this.data.slice();
    this.data.set(this.undoData); this.undoData = current;
  }

  private index(x: number, y: number) {
    return (Math.round(clamp(y / 1000) * (this.size - 1)) * this.size + Math.round(clamp(x / 1000) * (this.size - 1))) * 4;
  }

  begin(p: Point, seed = Math.random()) {
    this.undoData = this.data.slice();
    this.before = this.undoData;
    this.phase = seed * 100;
    this.carried = this.data[this.index(p.x, p.y) + 3];
    this.bounds = [this.size, this.size, 0, 0];
  }

  /** Swept footprint keeps fast drags connected instead of leaving isolated stamps. */
  stroke(a: Point, b: Point, s: PaintSettings) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length > .1) this.direction = { x: dx / length, y: dy / length };
    const tx = this.direction.x, ty = this.direction.y;
    const radius = s.size * .5 * (.65 + .35 * b.pressure);
    const scale = (this.size - 1) / 1000;
    const minX = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius * 1.15) * scale));
    const maxX = Math.min(this.size - 1, Math.ceil((Math.max(a.x, b.x) + radius * 1.15) * scale));
    const minY = Math.max(0, Math.floor((Math.min(a.y, b.y) - radius * 1.15) * scale));
    const maxY = Math.min(this.size - 1, Math.ceil((Math.max(a.y, b.y) + radius * 1.15) * scale));
    this.bounds = [Math.min(this.bounds[0], minX), Math.min(this.bounds[1], minY), Math.max(this.bounds[2], maxX), Math.max(this.bounds[3], maxY)];
    const pigment = linear(s.color), source = this.before ?? this.data;
    const mobility = .17 + .7 * (1 - s.viscosity / 100);
    const force = .25 + b.pressure * .85;
    // A normalized yield threshold; below it the layer is elastic/static, above it plastic.
    const yielding = clamp((force - s.yield * .0065) * 2.5);
    const strength = (.3 + mobility) * yielding;
    const load = s.tool === "smear" ? 0 : s.load / 100;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const wx = x / scale, wy = y / scale;
      const along = clamp(((wx - a.x) * dx + (wy - a.y) * dy) / Math.max(length * length, .001));
      const cx = a.x + dx * along, cy = a.y + dy * along;
      const px = wx - cx, py = wy - cy;
      const across = (-ty * px + tx * py) / radius;
      const d = Math.hypot(px, py) / radius;
      const grit = noise(wx * .12 + this.phase, wy * .12);
      const border = 1 + (grit - .5) * .105;
      if (d > border) continue;
      const envelope = 1 - smooth(border - .12, border, d);
      const i = (y * this.size + x) * 4;
      const from = this.index(wx - tx * radius * .45, wy - ty * radius * .45);
      const bed = source[i + 3];
      const transported = source[from + 3];
      // Parallel bristles stay aligned with motion. Knife striae are finer and shallower.
      const thread = noise((across * radius + this.phase) * .38, .5);
      const fiber = smooth(.46, .85, thread) * (s.tool === "brush" ? .6 : .07);
      const lip = Math.exp(-(((Math.abs(across) - .89 - (grit - .5) * .035) / .035) ** 2));
      const plane = s.tool === "knife" ? .9 + across * .3 : 1 - .38 * across * across;
      const texture = s.texture / 100;
      const deposit = load * (3.2 + this.carried * .1) * plane;
      const target = Math.max(.3, bed * .3 + transported * .22 + this.carried * .3 + deposit
        + lip * (.7 + load * 1.7) + texture * (fiber + (grit - .5) * .18));
      const amount = envelope * strength;
      this.data[i + 3] = clamp(this.data[i + 3] + (target - this.data[i + 3]) * amount, .2, 32);
      for (let c = 0; c < 3; c++) {
        const mixed = source[from + c] * (1 - load * .72) + pigment[c] * load * .72;
        this.data[i + c] += (mixed - this.data[i + c]) * amount;
      }
    }
  }

  /** Adhesion pulls a tapering ridge up and forwards before a neck breaks. */
  lift(p: Point, s: PaintSettings, fraction: number) {
    const adhesion = s.adhesion / 100;
    if (!adhesion) return;
    const r = s.size * .5, scale = (this.size - 1) / 1000;
    const distance = r * adhesion * .68;
    const cx = p.x + this.direction.x * distance * fraction;
    const cy = p.y + this.direction.y * distance * fraction;
    const width = Math.max(2, r * .38 * (1 - fraction * .85));
    for (let y = Math.max(0, Math.floor((cy - width * 2) * scale)); y <= Math.min(this.size - 1, (cy + width * 2) * scale); y++) {
      for (let x = Math.max(0, Math.floor((cx - width * 2) * scale)); x <= Math.min(this.size - 1, (cx + width * 2) * scale); x++) {
        const d = Math.hypot(x / scale - cx, y / scale - cy) / width;
        const i = (y * this.size + x) * 4 + 3;
        this.data[i] = Math.min(32, this.data[i] + Math.exp(-d * d * 2.5) * adhesion * (.35 + fraction * .7));
      }
    }
  }

  end() { this.before = null; }

  /** Symmetric nearest-neighbour flux conserves layer volume. Yielded excess alone flows. */
  relax(s: PaintSettings, dt: number) {
    const [x0, y0, x1, y1] = this.bounds;
    if (x0 > x1) return 0;
    const n = this.size;
    const threshold = .002 + (s.yield / 100) ** 2 * 3.2 * 768 / n;
    const rate = Math.min(.12, dt * (.5 + 5 * (1 - s.viscosity / 100)));
    this.scratch.fill(0);
    for (let y = Math.max(0, y0 - 2); y <= Math.min(n - 2, y1 + 2); y++) {
      for (let x = Math.max(0, x0 - 2); x <= Math.min(n - 2, x1 + 2); x++) {
        const i = y * n + x;
        for (const j of [i + 1, i + n]) {
          const delta = this.data[i * 4 + 3] - this.data[j * 4 + 3];
          const flux = Math.sign(delta) * Math.max(0, Math.abs(delta) - threshold) * rate;
          this.scratch[i] -= flux; this.scratch[j] += flux;
        }
      }
    }
    let residual = 0;
    for (let y = Math.max(0, y0 - 2); y <= Math.min(n - 1, y1 + 3); y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(n - 1, x1 + 3); x++) {
      const i = y * n + x;
      this.data[i * 4 + 3] += this.scratch[i];
      residual = Math.max(residual, Math.abs(this.scratch[i]));
    }
    return residual;
  }

  /** Deterministic, overlapping curved knife swathes, generated incrementally. */
  *generate(seed: number, settings: PaintSettings = DEFAULTS) {
    this.clear(false);
    let state = seed >>> 0;
    const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    for (let k = 0; k < 52; k++) {
      const x = rand() * 1100 - 50, y = rand() * 1100 - 50;
      const angle = -.9 + rand() * 2.1;
      const length = 180 + rand() * 410, bend = (rand() - .5) * 180;
      const s = { ...settings, size: settings.size * (.74 + rand() * 1.63), load: clamp(settings.load * (.7 + rand() * .68), 0, 100),
        tool: (settings.tool === "knife" && k % 11 === 0 ? "brush" : settings.tool) as Tool };
      let previous = { x, y, pressure: .6 };
      this.begin(previous, rand());
      const steps = Math.ceil(length / (s.size * .16));
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const curve = Math.sin(t * Math.PI) * bend;
        const next = { x: x + Math.sin(angle) * length * t + Math.cos(angle) * curve,
          y: y + Math.cos(angle) * length * t - Math.sin(angle) * curve, pressure: .45 + .35 * Math.sin(t * Math.PI) };
        this.stroke(previous, next, s); previous = next;
      }
      for (let i = 0; i < 7; i++) this.lift(previous, s, i / 6);
      this.end();
      yield (k + 1) / 52;
    }
    this.undoData = null;
  }
}
