import { Simulation } from "./types";

const PARTICLE_COUNT = 280;
const COLORS = ["#ff5d73", "#59d9ff", "#ffd45c", "#8cff79", "#bd7bff"];
const TYPE_COUNT = COLORS.length;

interface Atom {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: number;
  radius: number;
  mass: number;
  forceScale: number;
}

export class Atoms implements Simulation {
  private w: number;
  private h: number;
  private atoms: Atom[] = [];
  private sprites: HTMLCanvasElement[];
  private repulsionLinks: number[] = [];
  private attractionLinks: number[] = [];
  private stepAcc = 0;

  private distanceX = 32;
  private attraction = 42;
  private repulsion = 360;
  private damping = 0.65;
  private attractionMatrix = Array.from({ length: TYPE_COUNT }, () => Array<number>(TYPE_COUNT).fill(0));
  private repulsionMatrix = Array.from({ length: TYPE_COUNT }, () => Array<number>(TYPE_COUNT).fill(1));
  private mixedRuleMatrix = Array.from({ length: TYPE_COUNT }, () => Array<boolean>(TYPE_COUNT).fill(true));

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.sprites = COLORS.map(color => this.makeSphereSprite(color));
    this.randomiseInteractions();
    this.seed();
  }

  private makeSphereSprite(color: string): HTMLCanvasElement {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(25, 22, 1, 32, 32, 29);
    gradient.addColorStop(0, "rgba(255,255,255,0.72)");
    gradient.addColorStop(0.08, color + "48");
    gradient.addColorStop(0.48, color + "12");
    gradient.addColorStop(0.72, color + "24");
    gradient.addColorStop(0.88, color + "82");
    gradient.addColorStop(1, color + "00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = color + "72";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(26, 25, 12, Math.PI * 1.08, Math.PI * 1.58);
    ctx.stroke();
    return canvas;
  }

  private randomiseInteractions() {
    for (let i = 0; i < TYPE_COUNT; i++) {
      for (let j = 0; j < TYPE_COUNT; j++) {
        // Row type reacts to column type. A->B is independent of B->A,
        // allowing chasing, rotating and flowing groups to emerge.
        const mixed = Math.random() < 0.68;
        this.mixedRuleMatrix[i][j] = mixed;
        this.attractionMatrix[i][j] = mixed ? 0.25 + Math.random() * 1.45 : 0;
        this.repulsionMatrix[i][j] = 0.55 + Math.random() * 1.2;
      }
    }
  }

  private seed() {
    this.atoms.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const type = i % COLORS.length;
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 14;
      const radius = 4.5 + Math.random() * 3.5;
      this.atoms.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        type,
        radius,
        mass: 0.75 + radius * 0.12,
        forceScale: 0.75 + Math.random() * 0.5,
      });
    }
  }

  update(delta: number) {
    this.stepAcc += Math.min(delta, 0.05);
    const fixedDt = 1 / 60;
    let steps = 0;
    while (this.stepAcc >= fixedDt && steps < 3) {
      this.integrate(fixedDt);
      this.stepAcc -= fixedDt;
      steps++;
    }
  }

  private integrate(dt: number) {
    const n = this.atoms.length;
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const x = this.distanceX;
    const maxDistance = x * 3;
    const maxDistance2 = maxDistance * maxDistance;
    this.repulsionLinks.length = 0;
    this.attractionLinks.length = 0;

    for (let i = 0; i < n; i++) {
      const a = this.atoms[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.atoms[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (dx > this.w / 2) dx -= this.w;
        else if (dx < -this.w / 2) dx += this.w;
        if (dy > this.h / 2) dy -= this.h;
        else if (dy < -this.h / 2) dy += this.h;
        const d2 = dx * dx + dy * dy;
        if (d2 < 0.01 || d2 >= maxDistance2) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        let curve: number;
        let forceA: number;
        let forceB: number;
        if (d < x) {
          // Linear repulsion: strongest at contact, zero at X.
          curve = 1 - d / x;
          forceA = -this.repulsion * this.repulsionMatrix[a.type][b.type] * curve;
          forceB = -this.repulsion * this.repulsionMatrix[b.type][a.type] * curve;
          if (Math.abs(b.x - a.x) < this.w / 2 && Math.abs(b.y - a.y) < this.h / 2)
            this.repulsionLinks.push(a.x, a.y, b.x, b.y, curve);
        } else {
          // Continuous triangular attraction: zero at X/3X and peak at 2X.
          curve = d < x * 2 ? (d - x) / x : (maxDistance - d) / x;
          forceA = this.mixedRuleMatrix[a.type][b.type]
            ? this.attraction * this.attractionMatrix[a.type][b.type] * curve
            : 0;
          forceB = this.mixedRuleMatrix[b.type][a.type]
            ? this.attraction * this.attractionMatrix[b.type][a.type] * curve
            : 0;
          if (forceA === 0 && forceB === 0) continue;
          if (Math.abs(b.x - a.x) < this.w / 2 && Math.abs(b.y - a.y) < this.h / 2)
            this.attractionLinks.push(a.x, a.y, b.x, b.y, curve);
        }

        // Each direction is independent, so the pair need not exert equal forces.
        forceA *= a.forceScale;
        forceB *= b.forceScale;
        ax[i] += nx * forceA / a.mass;
        ay[i] += ny * forceA / a.mass;
        ax[j] -= nx * forceB / b.mass;
        ay[j] -= ny * forceB / b.mass;
      }
    }

    const drag = Math.exp(-this.damping * dt);
    for (let i = 0; i < n; i++) {
      const atom = this.atoms[i];
      atom.vx = (atom.vx + ax[i] * dt) * drag;
      atom.vy = (atom.vy + ay[i] * dt) * drag;
      const speed = Math.hypot(atom.vx, atom.vy);
      if (speed > 220) {
        atom.vx *= 220 / speed;
        atom.vy *= 220 / speed;
      }
      atom.x = (atom.x + atom.vx * dt + this.w) % this.w;
      atom.y = (atom.y + atom.vy * dt + this.h) % this.h;
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = "#020306";
    ctx.fillRect(0, 0, w, h);

    this.drawLinks(ctx, this.attractionLinks, "95, 180, 255", 0.10);
    this.drawLinks(ctx, this.repulsionLinks, "255, 90, 110", 0.18);

    ctx.globalCompositeOperation = "screen";
    for (const atom of this.atoms) {
      const size = atom.radius * 3.2;
      ctx.globalAlpha = 0.72;
      ctx.drawImage(this.sprites[atom.type], atom.x - size / 2, atom.y - size / 2, size, size);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  private drawLinks(ctx: CanvasRenderingContext2D, links: number[], rgb: string, alpha: number) {
    ctx.beginPath();
    for (let i = 0; i < links.length; i += 5) {
      ctx.moveTo(links[i], links[i + 1]);
      ctx.lineTo(links[i + 2], links[i + 3]);
    }
    ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }

  getParams(): Record<string, number> {
    const params: Record<string, number> = {
      distanceX: this.distanceX,
      attraction: this.attraction,
      repulsion: this.repulsion,
      damping: this.damping,
      particles: this.atoms.length,
    };
    for (let i = 0; i < TYPE_COUNT; i++) {
      for (let j = 0; j < TYPE_COUNT; j++) {
        params[`matrixA_${i}_${j}`] = this.attractionMatrix[i][j];
        params[`matrixR_${i}_${j}`] = this.repulsionMatrix[i][j];
        params[`matrixMode_${i}_${j}`] = this.mixedRuleMatrix[i][j] ? 1 : 0;
      }
    }
    return params;
  }

  randomiseParams() {
    this.randomiseInteractions();
  }

  setParam(key: string, value: number) {
    if (key === "distanceX") this.distanceX = value;
    else if (key === "attraction") this.attraction = value;
    else if (key === "repulsion") this.repulsion = value;
    else if (key === "damping") this.damping = value;
  }

  onPointerDown(x: number, y: number, button: number) {
    if (button !== 0) return;
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 4.5 + Math.random() * 3.5;
      this.atoms.push({
        x: x + Math.cos(angle) * Math.random() * 18,
        y: y + Math.sin(angle) * Math.random() * 18,
        vx: Math.cos(angle) * 25,
        vy: Math.sin(angle) * 25,
        type: Math.floor(Math.random() * COLORS.length),
        radius,
        mass: 0.75 + radius * 0.12,
        forceScale: 0.75 + Math.random() * 0.5,
      });
    }
  }

  resize(w: number, h: number) {
    const sx = w / this.w;
    const sy = h / this.h;
    for (const atom of this.atoms) {
      atom.x *= sx;
      atom.y *= sy;
    }
    this.w = w;
    this.h = h;
  }

  destroy() {
    this.atoms.length = 0;
    this.repulsionLinks.length = 0;
    this.attractionLinks.length = 0;
  }
}
