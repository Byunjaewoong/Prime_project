import { Simulation } from "./types";
import { atomColorCss, DEFAULT_COLOR_TYPES, INITIAL_ATOM_COLORS, MAX_COLOR_TYPES, randomAtomPalette } from "./AtomPalette";
import { AtomDefaults, DESKTOP_ATOM_DEFAULTS } from "./AtomsDefaults";

const MAX_PARTICLE_COUNT = 30000;
const TYPE_COUNT = MAX_COLOR_TYPES;
const MAX_SAMPLES_PER_CELL = 8;
const MIN_WORLD_SCALE = 0.5;
const MAX_WORLD_SCALE = 4;

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
  private worldOriginX = 0;
  private worldOriginY = 0;
  private baseW: number;
  private baseH: number;
  private viewportW: number;
  private viewportH: number;
  private atoms: Atom[] = [];
  private stepAcc = 0;
  private sampleFrame = 0;

  private repel = 1;
  private forceFactor = 0.18;
  private friction = 0.08;
  private particleSize = 4;
  private depthMode = false;
  private focusLayer = 1;
  private focusMix = 1;
  private colorCount = DEFAULT_COLOR_TYPES;
  private palette = [...INITIAL_ATOM_COLORS];

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

  constructor(w: number, h: number, defaults: AtomDefaults = DESKTOP_ATOM_DEFAULTS) {
    this.w = w * defaults.worldScale;
    this.h = h * defaults.worldScale;
    this.baseW = w;
    this.baseH = h;
    this.viewportW = w;
    this.viewportH = h;
    this.zoom = 1 / defaults.worldScale;
    this.friction = defaults.friction;
    this.depthMode = defaults.depthMode;
    this.focusLayer = defaults.focusLayer;
    this.focusMix = defaults.focusLayer;
    this.randomiseInteractions();
    this.setParticleCount(defaults.particleCount);
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

  private createAtom(
    x = this.worldOriginX + Math.random() * this.w,
    y = this.worldOriginY + Math.random() * this.h,
  ): Atom {
    return { x, y, vx: 0, vy: 0, type: Math.floor(Math.random() * this.colorCount) };
  }

  private setColorCount(value: number) {
    const next = Math.max(1, Math.min(TYPE_COUNT, Math.round(value)));
    if (next === this.colorCount) return;
    const previous = this.colorCount;
    for (let index = 0; index < this.atoms.length; index++) {
      const atom = this.atoms[index];
      if (next < previous && atom.type >= next) {
        atom.type = Math.floor(Math.random() * next);
      } else if (next > previous && (index === 0 || Math.random() < (next - previous) / next)) {
        atom.type = previous + Math.floor(Math.random() * (next - previous));
      }
    }
    this.colorCount = next;
  }

  getColors(): number[] { return [...this.palette]; }

  setColors(colors: number[]) {
    if (colors.length === TYPE_COUNT) this.palette = [...colors];
  }

  randomiseColors() {
    this.palette = randomAtomPalette();
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
    this.focusMix += (this.focusLayer - this.focusMix) * Math.min(1, Math.max(0, delta) * 4.5);
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
    this.sampleFrame++;
    const cellSize = Math.max(1, this.currentMaxRadius);
    const columns = Math.max(1, Math.ceil(this.w / cellSize));
    const rows = Math.max(1, Math.ceil(this.h / cellSize));
    const cells = new Map<number, number[]>();

    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      const cx = Math.min(columns - 1, Math.floor((atom.x - this.worldOriginX) / cellSize));
      const cy = Math.min(rows - 1, Math.floor((atom.y - this.worldOriginY) / cellSize));
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
      const cx = Math.min(columns - 1, Math.floor((atom.x - this.worldOriginX) / cellSize));
      const cy = Math.min(rows - 1, Math.floor((atom.y - this.worldOriginY) / cellSize));
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

          const sampleCount = this.atoms.length > 2000
            ? Math.min(bucket.length, MAX_SAMPLES_PER_CELL)
            : bucket.length;
          const start = sampleCount === bucket.length ? 0 : (i * 17 + this.sampleFrame * 23) % bucket.length;
          const stride = sampleCount === bucket.length ? 1 : Math.max(1, Math.floor(bucket.length / sampleCount));
          for (let sample = 0; sample < sampleCount; sample++) {
            const j = bucket[(start + sample * stride) % bucket.length];
            if (i === j) continue;
            if (this.depthMode && (i & 1) !== (j & 1)) continue;
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

      const layerTime = this.depthMode && (i & 1) === 1 ? 0.7 : 1;
      const layerFriction = Math.pow(frictionMultiplier, layerTime);
      nextVX[i] = (atom.vx + forceX * this.forceFactor * layerTime) * layerFriction;
      nextVY[i] = (atom.vy + forceY * this.forceFactor * layerTime) * layerFriction;
    }

    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      atom.vx = nextVX[i];
      atom.vy = nextVY[i];
      const layerTime = this.depthMode && (i & 1) === 1 ? 0.7 : 1;
      atom.x = ((atom.x + atom.vx * layerTime - this.worldOriginX) % this.w + this.w) % this.w + this.worldOriginX;
      atom.y = ((atom.y + atom.vy * layerTime - this.worldOriginY) % this.h + this.h) % this.h + this.worldOriginY;
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
    if (this.depthMode) {
      this.renderDepth(ctx, w, h);
      return;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.offsetX * this.zoom, this.offsetY * this.zoom);
    const radius = this.particleSize / 2;
    const minX = -this.offsetX - radius / this.zoom;
    const minY = -this.offsetY - radius / this.zoom;
    const maxX = minX + w / this.zoom + radius * 2;
    const maxY = minY + h / this.zoom + radius * 2;

    for (let type = 0; type < this.colorCount; type++) {
      ctx.fillStyle = atomColorCss(this.palette[type]);
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

  private renderDepth(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const layer of [1, 0]) {
      const scale = this.zoom;
      const blurAmount = layer === 0 ? this.focusMix : 1 - this.focusMix;
      const radius = this.particleSize * (layer === 0 ? 1.45 : 0.72 + 0.46 * this.focusMix) / 2;
      const translateX = this.offsetX * scale;
      const translateY = this.offsetY * scale;
      const blurMargin = radius + 6 / scale;
      const minX = (-translateX) / scale - blurMargin;
      const minY = (-translateY) / scale - blurMargin;
      const maxX = (w - translateX) / scale + blurMargin;
      const maxY = (h - translateY) / scale + blurMargin;
      ctx.save();
      ctx.setTransform(scale, 0, 0, scale, translateX, translateY);
      const blurRadius = layer === 0 ? 6 : 4.5;
      const layerFilter = blurAmount > 0.01 ? `blur(${(blurAmount * blurRadius).toFixed(2)}px)` : "none";
      const layerAlpha = layer === 0
        ? 1 - 0.42 * blurAmount
        : 1 - 0.15 * blurAmount;
      ctx.filter = layerFilter;
      ctx.globalAlpha = layerAlpha;
      for (let type = 0; type < this.colorCount; type++) {
        const color = this.palette[type];
        const fade = layer === 0 ? 0.7 * this.focusMix : 0;
        const paleChannel = (shift: number) => Math.round(((color >> shift) & 255) * (1 - fade) + 191 * fade);
        ctx.fillStyle = fade > 0
          ? `rgb(${paleChannel(16)}, ${paleChannel(8)}, ${paleChannel(0)})`
          : atomColorCss(color);
        ctx.beginPath();
        for (let index = layer; index < this.atoms.length; index += 2) {
          const atom = this.atoms[index];
          if (atom.type !== type || atom.x < minX || atom.x > maxX || atom.y < minY || atom.y > maxY) continue;
          if (this.particleSize * scale < 2) {
            ctx.rect(atom.x - radius, atom.y - radius, radius * 2, radius * 2);
          } else {
            ctx.moveTo(atom.x + radius, atom.y);
            ctx.arc(atom.x, atom.y, radius, 0, Math.PI * 2);
          }
        }
        ctx.fill();
        if (layer === 1 && blurAmount > 0.01) {
          // Keep the distant color legible beneath its wider soft glow.
          ctx.filter = `blur(${(blurAmount * 1.5).toFixed(2)}px)`;
          ctx.globalAlpha = 0.3 * blurAmount;
          ctx.fill();
          ctx.filter = layerFilter;
          ctx.globalAlpha = layerAlpha;
        }
      }
      ctx.restore();
    }
  }

  getParams(): Record<string, number> {
    const params: Record<string, number> = {
      particles: this.atoms.length,
      colors: this.colorCount,
      repel: this.repel,
      forceFactor: this.forceFactor,
      friction: this.friction,
      particleSize: this.particleSize,
      depthMode: this.depthMode ? 1 : 0,
      focusLayer: this.focusLayer,
      worldScale: this.w / this.baseW,
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
    for (let type = 0; type < TYPE_COUNT; type++) params[`color_${type}`] = this.palette[type];
    return params;
  }

  randomiseParams() {
    this.randomiseInteractions();
  }

  setParam(key: string, value: number) {
    if (key === "particles") this.setParticleCount(value);
    else if (key === "colors") this.setColorCount(value);
    else if (key === "worldScale") this.setWorldScale(value);
    else if (key === "repel") this.repel = value;
    else if (key === "forceFactor") this.forceFactor = value;
    else if (key === "friction") this.friction = value;
    else if (key === "particleSize") this.particleSize = value;
    else if (key === "depthMode") this.depthMode = value >= 0.5;
    else if (key === "focusLayer") this.focusLayer = value >= 0.5 ? 1 : 0;
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
    this.clampCameraOffset();
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
        ((world.x + Math.cos(angle) * radius - this.worldOriginX) % this.w + this.w) % this.w + this.worldOriginX,
        ((world.y + Math.sin(angle) * radius - this.worldOriginY) % this.h + this.h) % this.h + this.worldOriginY,
      ));
    }
  }

  private minimumCameraZoom() {
    return Math.max(this.viewportW / this.w, this.viewportH / this.h);
  }

  private clampCameraOffset() {
    const visibleW = this.viewportW / this.zoom;
    const visibleH = this.viewportH / this.zoom;
    this.offsetX = visibleW >= this.w
      ? (visibleW - this.w) * 0.5 - this.worldOriginX
      : Math.max(visibleW - this.w - this.worldOriginX, Math.min(-this.worldOriginX, this.offsetX));
    this.offsetY = visibleH >= this.h
      ? (visibleH - this.h) * 0.5 - this.worldOriginY
      : Math.max(visibleH - this.h - this.worldOriginY, Math.min(-this.worldOriginY, this.offsetY));
  }

  private zoomCamera(x: number, y: number, scale: number): boolean {
    if (!Number.isFinite(scale) || scale <= 0) return true;
    const oldZoom = this.zoom;
    this.zoom = Math.max(this.minimumCameraZoom(), Math.min(3.2, this.zoom * scale));
    if (this.zoom === oldZoom) return true;
    const ratio = this.zoom / oldZoom;
    this.offsetX -= (x / this.zoom) * (ratio - 1);
    this.offsetY -= (y / this.zoom) * (ratio - 1);
    this.clampCameraOffset();
    return true;
  }

  private setWorldScale(value: number) {
    const scale = Math.max(MIN_WORLD_SCALE, Math.min(MAX_WORLD_SCALE, value));
    const nextW = this.baseW * scale;
    const nextH = this.baseH * scale;
    this.worldOriginX -= (nextW - this.w) * 0.5;
    this.worldOriginY -= (nextH - this.h) * 0.5;
    this.w = nextW;
    this.h = nextH;
    for (let i = 0; i < this.atoms.length; i++) {
      const atom = this.atoms[i];
      if (
        atom.x < this.worldOriginX ||
        atom.y < this.worldOriginY ||
        atom.x >= this.worldOriginX + this.w ||
        atom.y >= this.worldOriginY + this.h
      ) this.atoms[i] = this.createAtom();
    }
    this.zoom = Math.max(this.zoom, this.minimumCameraZoom());
    this.clampCameraOffset();
  }

  private resizeWorldFromWheel(x: number, y: number, zoomScale: number): boolean {
    if (!Number.isFinite(zoomScale) || zoomScale <= 0) return true;
    const oldWorldScale = this.w / this.baseW;
    const nextWorldScale = Math.max(
      MIN_WORLD_SCALE,
      Math.min(MAX_WORLD_SCALE, oldWorldScale / zoomScale),
    );
    const appliedZoomScale = oldWorldScale / nextWorldScale;
    const oldZoom = this.zoom;
    this.zoom = Math.min(3.2, oldZoom * appliedZoomScale);
    const ratio = this.zoom / oldZoom;
    this.offsetX -= (x / this.zoom) * (ratio - 1);
    this.offsetY -= (y / this.zoom) * (ratio - 1);
    this.setWorldScale(nextWorldScale);
    return true;
  }

  onWheel(x: number, y: number, deltaY: number): boolean {
    return this.resizeWorldFromWheel(x, y, deltaY < 0 ? 1.1 : 0.9);
  }

  onPinch(x: number, y: number, scale: number): boolean {
    return this.zoomCamera(x, y, scale);
  }

  private toWorld(x: number, y: number) {
    return { x: x / this.zoom - this.offsetX, y: y / this.zoom - this.offsetY };
  }

  resize(w: number, h: number) {
    const centerX = this.viewportW * 0.5 / this.zoom - this.offsetX;
    const centerY = this.viewportH * 0.5 / this.zoom - this.offsetY;
    this.viewportW = w;
    this.viewportH = h;
    this.zoom = Math.max(this.zoom, this.minimumCameraZoom());
    this.offsetX = this.viewportW * 0.5 / this.zoom - centerX;
    this.offsetY = this.viewportH * 0.5 / this.zoom - centerY;
    this.clampCameraOffset();
  }

  destroy() {
    this.atoms.length = 0;
  }
}
