// app/works/emergence/core/Boids.ts
import { Simulation } from "./types";

const N          = 2000;
const MAX_SPEED  = 180;
const MIN_SPEED  = 60;
const NEIGHBOR_R = 65;
const NEIGHBOR_R2 = NEIGHBOR_R * NEIGHBOR_R;
const SEP_R2     = 28 * 28;
const SEP_FORCE  = 2.8;
const ALI_FORCE  = 1.0;
const COH_FORCE  = 0.9;
const MAX_STEER  = 400;
const CELL       = NEIGHBOR_R;

// ─── Trail ring buffer ────────────────────────────────────────────────────────
// Every update() writes the new position into the ring.
// render() clears the canvas and redraws solid polylines — no alpha-fade.
//
// Per-particle fade dynamics:
//   visLen[i] += (60 − tailSpeed[i]) × dt     (frame-rate-independent)
//
//   tailSpeed < 60  → net growth  (tail lengthens)
//   tailSpeed = 60  → stable
//   tailSpeed > 60  → net shrink  (tail shortens)
//
// tailSpeed[i] is re-randomised for each particle independently every 3–5 s.
// 70 % of updates draw from the "fast fade" range → shrink tendency.
// No sudden length jumps: only the rate changes, not the current length.
const MAX_TRAIL = 150;   // ring buffer depth (frames) per boid
const N_BUCKETS = 12;    // colour batching → 12 ctx.stroke() per frame max

// ─── Spatial grid (pre-allocated, no per-frame heap allocation) ───────────────
const MAX_CELLS = 120 * 80;
const gridHead  = new Int32Array(MAX_CELLS);
const gridNext  = new Int32Array(N);

export class Boids implements Simulation {
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private w:  number;
  private h:  number;

  // Ring buffer
  private ringX:    Float32Array;   // [N × MAX_TRAIL]
  private ringY:    Float32Array;   // [N × MAX_TRAIL]
  private ringPtr:  Uint16Array;    // [N] next-write slot
  private frameCount = 0;

  // Per-particle trail state
  private visLen:    Float32Array;  // [N] current visible history (continuous float, frames)
  private tailSpeed: Float32Array;  // [N] fade speed (frames/s equivalent); >60 → shrink
  private tailTimer: Float32Array;  // [N] seconds until next speed re-roll

  // Reusable per-frame scratch — no per-frame GC
  private buckets: number[][] = Array.from({ length: N_BUCKETS }, () => []);

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vy = new Float32Array(N);

    this.ringX    = new Float32Array(N * MAX_TRAIL);
    this.ringY    = new Float32Array(N * MAX_TRAIL);
    this.ringPtr  = new Uint16Array(N);
    this.visLen   = new Float32Array(N);
    this.tailSpeed = new Float32Array(N);
    this.tailTimer = new Float32Array(N);

    this.spawnAll();

    for (let i = 0; i < N; i++) {
      // Seed ring slot 0 with spawn position
      this.ringX[i * MAX_TRAIL] = this.px[i];
      this.ringY[i * MAX_TRAIL] = this.py[i];
      this.ringPtr[i] = 1;
      // Spread initial visible lengths so the start looks varied
      this.visLen[i]   = 2 + Math.random() * 50;
      this.tailSpeed[i] = this.randomSpeed();
      // Stagger timers so particles don't all update simultaneously
      this.tailTimer[i] = Math.random() * 5;
    }
    this.frameCount = 1;
  }

  // 70 % fast fade (tailSpeed 80–150, shrinks), 30 % slow fade (10–55, grows)
  private randomSpeed(): number {
    return Math.random() < 0.7
      ? 80  + Math.random() * 70   // 80–150: faster than 60 fps → net shrink
      : 10  + Math.random() * 45;  // 10–55:  slower  than 60 fps → net grow
  }

  private spawnAll() {
    for (let i = 0; i < N; i++) {
      this.px[i] = Math.random() * this.w;
      this.py[i] = Math.random() * this.h;
      const a = Math.random() * Math.PI * 2;
      const s = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      this.vx[i] = Math.cos(a) * s;
      this.vy[i] = Math.sin(a) * s;
    }
  }

  // ─── Spatial grid ──────────────────────────────────────────────────────────
  private buildGrid(cols: number, rows: number) {
    gridHead.fill(-1, 0, cols * rows);
    const { px, py } = this;
    for (let i = N - 1; i >= 0; i--) {
      const cx = Math.min(Math.floor(px[i] / CELL), cols - 1);
      const cy = Math.min(Math.floor(py[i] / CELL), rows - 1);
      const c  = cy * cols + cx;
      gridNext[i] = gridHead[c];
      gridHead[c] = i;
    }
  }

  // ─── Physics ───────────────────────────────────────────────────────────────
  update(delta: number) {
    const dt = Math.min(delta, 0.05);
    const { px, py, vx, vy, w, h } = this;

    const cols = Math.max(1, Math.ceil(w / CELL));
    const rows = Math.max(1, Math.ceil(h / CELL));
    this.buildGrid(cols, rows);

    const ax = new Float32Array(N);
    const ay = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const cx = Math.min(Math.floor(px[i] / CELL), cols - 1);
      const cy = Math.min(Math.floor(py[i] / CELL), rows - 1);

      let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0, cnt = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ((cx + dx) % cols + cols) % cols;
          const ny = ((cy + dy) % rows + rows) % rows;
          let j = gridHead[ny * cols + nx];
          while (j !== -1) {
            if (j !== i) {
              const djx = px[j] - px[i], djy = py[j] - py[i];
              const d2  = djx * djx + djy * djy;
              if (d2 < NEIGHBOR_R2) {
                aliX += vx[j]; aliY += vy[j];
                cohX += px[j]; cohY += py[j];
                cnt++;
                if (d2 < SEP_R2 && d2 > 1) {
                  const inv = 1 / Math.sqrt(d2);
                  sepX -= djx * inv; sepY -= djy * inv;
                }
              }
            }
            j = gridNext[j];
          }
        }
      }

      if (cnt > 0) {
        const ic = 1 / cnt;
        ax[i] += (aliX * ic - vx[i]) * ALI_FORCE;
        ay[i] += (aliY * ic - vy[i]) * ALI_FORCE;
        ax[i] += (cohX * ic - px[i]) * COH_FORCE;
        ay[i] += (cohY * ic - py[i]) * COH_FORCE;
        ax[i] += sepX * SEP_FORCE;
        ay[i] += sepY * SEP_FORCE;
        const flen = Math.sqrt(ax[i] ** 2 + ay[i] ** 2);
        if (flen > MAX_STEER) { const inv = MAX_STEER / flen; ax[i] *= inv; ay[i] *= inv; }
      }
    }

    for (let i = 0; i < N; i++) {
      vx[i] += ax[i] * dt; vy[i] += ay[i] * dt;
      const spd = Math.sqrt(vx[i] ** 2 + vy[i] ** 2);
      if (spd > MAX_SPEED) { const inv = MAX_SPEED / spd; vx[i] *= inv; vy[i] *= inv; }
      else if (spd < MIN_SPEED && spd > 0) { const inv = MIN_SPEED / spd; vx[i] *= inv; vy[i] *= inv; }
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      if (px[i] < 0) px[i] += w; else if (px[i] >= w) px[i] -= w;
      if (py[i] < 0) py[i] += h; else if (py[i] >= h) py[i] -= h;
    }

    // Write positions into ring buffer
    const { ringX, ringY, ringPtr } = this;
    for (let i = 0; i < N; i++) {
      const ptr = ringPtr[i];
      ringX[i * MAX_TRAIL + ptr] = px[i];
      ringY[i * MAX_TRAIL + ptr] = py[i];
      ringPtr[i] = (ptr + 1) % MAX_TRAIL;
    }
    if (this.frameCount < MAX_TRAIL) this.frameCount++;

    // ── Per-particle trail fade dynamics ──────────────────────────────────────
    // visLen[i] += (60 − tailSpeed[i]) × dt
    //   → tailSpeed < 60: tail grows at (60−tailSpeed) frames/s
    //   → tailSpeed > 60: tail shrinks at (tailSpeed−60) frames/s
    // No sudden jump: speed changes only affect the rate, not the current length.
    const maxVis = Math.min(this.frameCount, MAX_TRAIL);
    const { visLen, tailSpeed, tailTimer } = this;
    for (let i = 0; i < N; i++) {
      tailTimer[i] -= delta;
      if (tailTimer[i] <= 0) {
        tailTimer[i] = 3 + Math.random() * 2; // 3–5 s per particle
        tailSpeed[i] = this.randomSpeed();
      }
      visLen[i] += (60 - tailSpeed[i]) * dt;
      // Clamp: minimum 1 (always at least one point), max = available history
      if (visLen[i] < 1)      visLen[i] = 1;
      if (visLen[i] > maxVis) visLen[i] = maxVis;
    }
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────
  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const { vx, vy, ringX, ringY, ringPtr, visLen, buckets } = this;

    ctx.fillStyle = "#020508";
    ctx.fillRect(0, 0, w, h);

    // Assign boids to colour buckets by heading
    for (let b = 0; b < N_BUCKETS; b++) buckets[b].length = 0;
    for (let i = 0; i < N; i++) {
      const angle   = Math.atan2(vy[i], vx[i]);
      const hueNorm = (angle + Math.PI) / (Math.PI * 2);
      const b       = Math.min(Math.floor(hueNorm * N_BUCKETS), N_BUCKETS - 1);
      buckets[b].push(i);
    }

    // One ctx.stroke() per colour bucket — 12 total
    ctx.lineWidth = 1.2;
    ctx.lineCap   = "round";
    for (let b = 0; b < N_BUCKETS; b++) {
      const list = buckets[b];
      if (list.length === 0) continue;
      const hue = (155 + (b / N_BUCKETS) * 60) | 0;  // 155°(teal) → 215°(blue)
      ctx.strokeStyle = `hsl(${hue}, 80%, 55%)`;
      ctx.beginPath();

      for (let bi = 0; bi < list.length; bi++) {
        const i   = list[bi];
        const iVis = Math.round(visLen[i]);
        if (iVis < 2) continue;

        const base = i * MAX_TRAIL;
        let ptr = (ringPtr[i] - 1 + MAX_TRAIL) % MAX_TRAIL;
        let prevX = ringX[base + ptr];
        let prevY = ringY[base + ptr];
        ctx.moveTo(prevX, prevY);

        for (let t = 1; t < iVis; t++) {
          ptr = (ptr - 1 + MAX_TRAIL) % MAX_TRAIL;
          const cx = ringX[base + ptr];
          const cy = ringY[base + ptr];
          if (Math.abs(prevX - cx) > w * 0.4 || Math.abs(prevY - cy) > h * 0.4) {
            ctx.moveTo(cx, cy);  // wrap-around boundary: break polyline
          } else {
            ctx.lineTo(cx, cy);
          }
          prevX = cx; prevY = cy;
        }
      }
      ctx.stroke();
    }
    // No head circles — the tip of each polyline is the head
  }

  resize(w: number, h: number) {
    // Scale all positions proportionally to the new canvas size.
    // This preserves the visual shape of every trail without introducing
    // spurious long-line artifacts that modulo-wrap would cause:
    // if two consecutive ring entries straddle a multiple of new_w after
    // mod-wrapping, they appear close but draw an undetected cross-screen line.
    // With uniform scaling, consecutive entries that were ≤3 px apart stay
    // ≤3*scale px apart — always well below the 0.4*w break threshold.
    const scaleX = w / this.w;
    const scaleY = h / this.h;
    this.w = w; this.h = h;
    const { ringX, ringY } = this;
    for (let i = 0; i < N; i++) {
      this.px[i] *= scaleX;
      this.py[i] *= scaleY;
      for (let t = 0; t < MAX_TRAIL; t++) {
        const idx = i * MAX_TRAIL + t;
        ringX[idx] *= scaleX;
        ringY[idx] *= scaleY;
      }
    }
    // frameCount, ringPtr, visLen, tailSpeed, tailTimer all preserved
  }

  destroy() { /* nothing to clean up */ }
}
