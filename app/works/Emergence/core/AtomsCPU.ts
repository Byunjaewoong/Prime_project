import { Simulation } from "./types";

const DEFAULT_PARTICLE_COUNT = 1000;
const MAX_PARTICLE_COUNT = 20000;
const COLORS = ["#f04464", "#20c8e8", "#f2c94c", "#54d66b", "#a56cff"];
const TYPE_COUNT = COLORS.length;

interface Atom {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: number;
}

export class AtomsCPU implements Simulation {
  private w: number;
  private h: number;
  private atoms: Atom[] = [];
  private stepAcc = 0;

  private repel = 1;
  private forceFactor = 0.18;
  private friction = 0.08;
  private particleSize = 4;

  private rulesMatrix = this.makeMatrix(0);
  private minRadiusMatrix = this.makeMatrix(20);
  private maxRadiusMatrix = this.makeMatrix(100);
  private currentMaxRadius = 100;

  private zoom = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.randomiseInteractions();
    this.setParticleCount(DEFAULT_PARTICLE_COUNT);
  }

  private makeMatrix(value: number): number[][] {
    return Array.from({ length: TYPE_COUNT }, () => Array<number>(TYPE_COUNT).fill(value));
  }

  private randomiseInteractions() {
    let largestRadius = 0;
    for (let row = 0; row < TYPE_COUNT; row++) {
      for (let column = 0; column < TYPE_COUNT; column++) {
        this.rulesMatrix[row][column] = Math.round((Math.random() * 2 - 1) * 100) / 100;
        this.minRadiusMatrix[row][column] = Math.round(12 + Math.random() * 16);
        this.maxRadiusMatrix[row][column] = Math.round(65 + Math.random() * 75);
        largestRadius = Math.max(largestRadius, this.maxRadiusMatrix[row][column]);
      }
    }
    this.currentMaxRadius = largestRadius;
  }

  private createAtom(x = Math.random() * this.w, y = Math.random() * this.h): Atom {
    return { x, y, vx: 0, vy: 0, type: Math.floor(Math.random() * TYPE_COUNT) };
  }

  private setParticleCount(value: number) {
    const count = Math.max(0, Math.min(MAX_PARTICLE_COUNT, Math.round(value)));
    if (count < this.atoms.length) {
      this.atoms.length = count;
      return;
    }
    while (this.atoms.length < count) this.atoms.push(this.createAtom());
  }

  update(delta: number) {
    this.stepAcc += Math.min(delta, 0.05);
    const fixedDt = 1 / 60;
    let steps = 0;
    while (this.stepAcc >= fixedDt && steps < 3) {
      this.integrate();
      this.stepAcc -= fixedDt;
      steps++;
    }
  }

  private integrate() {
    const cellSize = Math.max(1, this.currentMaxRadius);
    const columns = Math.max(1, Math.ceil(this.w / cellSize));
    const rows = Math.max(1, Math.ceil(this.h / cellSize));
    const cells = new Map<number, number[]>();

    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      const cx = Math.min(columns - 1, Math.floor(atom.x / cellSize));
      const cy = Math.min(rows - 1, Math.floor(atom.y / cellSize));
      const key = cx + cy * columns;
      const bucket = cells.get(key);
      if (bucket) bucket.push(i);
      else cells.set(key, [i]);
    }

    const nextVX = new Float32Array(this.atoms.length);
    const nextVY = new Float32Array(this.atoms.length);
    const frictionMultiplier = 1 - this.friction;

    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      const cx = Math.min(columns - 1, Math.floor(atom.x / cellSize));
      const cy = Math.min(rows - 1, Math.floor(atom.y / cellSize));
      let forceX = 0;
      let forceY = 0;
      const visited = new Set<number>();

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = (cx + ox + columns) % columns;
          const ny = (cy + oy + rows) % rows;
          const key = nx + ny * columns;
          if (visited.has(key)) continue;
          visited.add(key);
          const bucket = cells.get(key);
          if (!bucket) continue;

          for (const j of bucket) {
            if (i === j) continue;
            const other = this.atoms[j];
            let dx = other.x - atom.x;
            let dy = other.y - atom.y;
            if (dx > this.w / 2) dx -= this.w;
            else if (dx < -this.w / 2) dx += this.w;
            if (dy > this.h / 2) dy -= this.h;
            else if (dy < -this.h / 2) dy += this.h;

            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared < 0.0001) continue;
            const maxRadius = this.maxRadiusMatrix[atom.type][other.type];
            if (distanceSquared >= maxRadius * maxRadius) continue;

            const distance = Math.sqrt(distanceSquared);
            const force = this.getForce(
              this.rulesMatrix[atom.type][other.type],
              this.minRadiusMatrix[atom.type][other.type],
              maxRadius,
              distance,
            );
            forceX += (dx / distance) * force;
            forceY += (dy / distance) * force;
          }
        }
      }

      nextVX[i] = (atom.vx + forceX * this.forceFactor) * frictionMultiplier;
      nextVY[i] = (atom.vy + forceY * this.forceFactor) * frictionMultiplier;
    }

    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      atom.vx = nextVX[i];
      atom.vy = nextVY[i];
      atom.x = (atom.x + atom.vx + this.w) % this.w;
      atom.y = (atom.y + atom.vy + this.h) % this.h;
    }
  }

  private getForce(rule: number, minRadius: number, maxRadius: number, distance: number): number {
    if (distance < minRadius) return (this.repel / minRadius) * distance - this.repel;
    if (distance > maxRadius) return 0;
    const middle = (minRadius + maxRadius) / 2;
    const slope = rule / (middle - minRadius);
    return -(slope * Math.abs(distance - middle)) + rule;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.offsetX * this.zoom, this.offsetY * this.zoom);
    const radius = this.particleSize / 2;
    const minX = -this.offsetX - radius / this.zoom;
    const minY = -this.offsetY - radius / this.zoom;
    const maxX = minX + w / this.zoom + radius * 2;
    const maxY = minY + h / this.zoom + radius * 2;

    for (let type = 0; type < TYPE_COUNT; type++) {
      ctx.fillStyle = COLORS[type];
      ctx.beginPath();
      for (const atom of this.atoms) {
        if (atom.type !== type || atom.x < minX || atom.x > maxX || atom.y < minY || atom.y > maxY) continue;
        if (this.particleSize * this.zoom < 2) {
          ctx.rect(atom.x - radius, atom.y - radius, this.particleSize, this.particleSize);
        } else {
          ctx.moveTo(atom.x + radius, atom.y);
          ctx.arc(atom.x, atom.y, radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
    ctx.restore();
  }

  getParams(): Record<string, number> {
    const params: Record<string, number> = {
      particles: this.atoms.length,
      repel: this.repel,
      forceFactor: this.forceFactor,
      friction: this.friction,
      particleSize: this.particleSize,
      zoom: this.zoom,
      viewX: this.offsetX,
      viewY: this.offsetY,
    };
    for (let row = 0; row < TYPE_COUNT; row++) {
      for (let column = 0; column < TYPE_COUNT; column++) {
        params[`matrixRule_${row}_${column}`] = this.rulesMatrix[row][column];
        params[`matrixMin_${row}_${column}`] = this.minRadiusMatrix[row][column];
        params[`matrixMax_${row}_${column}`] = this.maxRadiusMatrix[row][column];
      }
    }
    return params;
  }

  randomiseParams() {
    this.randomiseInteractions();
    const count = this.atoms.length;
    this.atoms.length = 0;
    this.setParticleCount(count);
  }

  setParam(key: string, value: number) {
    if (key === "particles") this.setParticleCount(value);
    else if (key === "repel") this.repel = value;
    else if (key === "forceFactor") this.forceFactor = value;
    else if (key === "friction") this.friction = value;
    else if (key === "particleSize") this.particleSize = value;
  }

  onPointerDown(x: number, y: number, button: number) {
    if (button === 0) {
      this.dragging = true;
      this.lastPointerX = x;
      this.lastPointerY = y;
    }
  }

  onPointerMove(x: number, y: number, buttons: number) {
    if (!this.dragging || !(buttons & 1)) return;
    this.offsetX += (x - this.lastPointerX) / this.zoom;
    this.offsetY += (y - this.lastPointerY) / this.zoom;
    this.lastPointerX = x;
    this.lastPointerY = y;
  }

  onPointerUp(x: number, y: number, button: number) {
    this.dragging = false;
    if (button !== 2) return;
    const world = this.toWorld(x, y);
    for (let i = 0; i < 20 && this.atoms.length < MAX_PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 24;
      this.atoms.push(this.createAtom(
        (world.x + Math.cos(angle) * radius + this.w) % this.w,
        (world.y + Math.sin(angle) * radius + this.h) % this.h,
      ));
    }
  }

  onWheel(x: number, y: number, deltaY: number): boolean {
    const oldZoom = this.zoom;
    const direction = deltaY < 0 ? 1 : -1;
    this.zoom = Math.max(0.1, Math.min(3.2, this.zoom * (1 + direction * 0.1)));
    const ratio = this.zoom / oldZoom;
    this.offsetX -= (x / this.zoom) * (ratio - 1);
    this.offsetY -= (y / this.zoom) * (ratio - 1);
    return true;
  }

  private toWorld(x: number, y: number) {
    return { x: x / this.zoom - this.offsetX, y: y / this.zoom - this.offsetY };
  }

  resize(w: number, h: number) {
    const scaleX = w / this.w;
    const scaleY = h / this.h;
    for (const atom of this.atoms) {
      atom.x *= scaleX;
      atom.y *= scaleY;
    }
    this.w = w;
    this.h = h;
  }

  destroy() {
    this.atoms.length = 0;
  }
}
