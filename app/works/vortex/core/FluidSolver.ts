// app/works/FluidSim_cpu/core/FluidSolver.ts
// Jos Stam "Stable Fluids" — rectangular grid Navier-Stokes with RGB dye (CPU)

export class FluidSolver {
  W: number;
  H: number;
  size: number;

  u: Float64Array;
  v: Float64Array;
  u0: Float64Array;
  v0: Float64Array;

  dR: Float64Array;
  dG: Float64Array;
  dB: Float64Array;
  dR0: Float64Array;
  dG0: Float64Array;
  dB0: Float64Array;

  dt = 0.1;
  diffusion = 0.00002;
  dyeDiff = 0.0;
  vorticityEps = 9.0;
  dyeDecay = 0.981;
  velocityDecay = 0.995;

  private curl: Float64Array;
  private stride: number;

  constructor(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.stride = W + 2;
    this.size = (W + 2) * (H + 2);

    this.u = new Float64Array(this.size);
    this.v = new Float64Array(this.size);
    this.u0 = new Float64Array(this.size);
    this.v0 = new Float64Array(this.size);

    this.dR = new Float64Array(this.size);
    this.dG = new Float64Array(this.size);
    this.dB = new Float64Array(this.size);
    this.dR0 = new Float64Array(this.size);
    this.dG0 = new Float64Array(this.size);
    this.dB0 = new Float64Array(this.size);

    this.curl = new Float64Array(this.size);
  }

  reset(): void {
    this.u.fill(0); this.v.fill(0); this.u0.fill(0); this.v0.fill(0);
    this.dR.fill(0); this.dG.fill(0); this.dB.fill(0);
    this.dR0.fill(0); this.dG0.fill(0); this.dB0.fill(0);
  }

  private IX(i: number, j: number): number {
    return i + this.stride * j;
  }

  addVelocity(cx: number, cy: number, amtX: number, amtY: number, radius = 4): void {
    const W = this.W, H = this.H;
    const sigma = radius * 0.5;
    const invTwoSigmaSq = 1 / (2 * sigma * sigma);
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        const i = cx + di, j = cy + dj;
        if (i < 1 || i > W || j < 1 || j > H) continue;
        const distSq = di * di + dj * dj;
        if (distSq > radius * radius) continue;
        const falloff = Math.exp(-distSq * invTwoSigmaSq);
        const idx = this.IX(i, j);
        this.u0[idx] += amtX * falloff;
        this.v0[idx] += amtY * falloff;
      }
    }
  }

  addDye(cx: number, cy: number, r: number, g: number, b: number, radius = 1): void {
    const W = this.W, H = this.H;
    const sigma = radius * 0.5;
    const invTwoSigmaSq = 1 / (2 * sigma * sigma);
    for (let di = -radius; di <= radius; di++) {
      for (let dj = -radius; dj <= radius; dj++) {
        const i = cx + di, j = cy + dj;
        if (i < 1 || i > W || j < 1 || j > H) continue;
        const distSq = di * di + dj * dj;
        if (distSq > radius * radius) continue;
        const falloff = Math.exp(-distSq * invTwoSigmaSq);
        const idx = this.IX(i, j);
        this.dR0[idx] += r * falloff;
        this.dG0[idx] += g * falloff;
        this.dB0[idx] += b * falloff;
      }
    }
  }

  step(): void {
    this.addSource(this.u, this.u0);
    this.addSource(this.v, this.v0);
    this.vorticityConfinement();

    this.swap(this.u0, this.u);
    this.diffuse(1, this.u, this.u0, this.diffusion);
    this.swap(this.v0, this.v);
    this.diffuse(2, this.v, this.v0, this.diffusion);
    this.project(this.u, this.v, this.u0, this.v0);

    this.swap(this.u0, this.u);
    this.swap(this.v0, this.v);
    this.advect(1, this.u, this.u0, this.u0, this.v0);
    this.advect(2, this.v, this.v0, this.u0, this.v0);
    this.project(this.u, this.v, this.u0, this.v0);

    this.addSource(this.dR, this.dR0);
    this.addSource(this.dG, this.dG0);
    this.addSource(this.dB, this.dB0);

    this.swap(this.dR0, this.dR);
    this.diffuse(0, this.dR, this.dR0, this.dyeDiff);
    this.swap(this.dG0, this.dG);
    this.diffuse(0, this.dG, this.dG0, this.dyeDiff);
    this.swap(this.dB0, this.dB);
    this.diffuse(0, this.dB, this.dB0, this.dyeDiff);

    this.swap(this.dR0, this.dR);
    this.advect(0, this.dR, this.dR0, this.u, this.v);
    this.swap(this.dG0, this.dG);
    this.advect(0, this.dG, this.dG0, this.u, this.v);
    this.swap(this.dB0, this.dB);
    this.advect(0, this.dB, this.dB0, this.u, this.v);

    this.applyDyeDecay();
    const vd = this.velocityDecay;
    if (vd < 1.0) {
      for (let i = 0; i < this.size; i++) { this.u[i] *= vd; this.v[i] *= vd; }
    }
    this.u0.fill(0); this.v0.fill(0);
    this.dR0.fill(0); this.dG0.fill(0); this.dB0.fill(0);
  }

  private addSource(target: Float64Array, source: Float64Array): void {
    const dt = this.dt;
    for (let i = 0; i < this.size; i++) target[i] += dt * source[i];
  }

  private swap(a: Float64Array, b: Float64Array): void {
    const tmp = new Float64Array(a); a.set(b); b.set(tmp);
  }

  private diffuse(b: number, x: Float64Array, x0: Float64Array, diff: number): void {
    const W = this.W, H = this.H;
    const a = this.dt * diff * Math.max(W, H) ** 2;
    if (a === 0) { x.set(x0); return; }
    const c = 1 + 4 * a;
    for (let k = 0; k < 4; k++) {
      for (let j = 1; j <= H; j++)
        for (let i = 1; i <= W; i++) {
          const idx = this.IX(i, j);
          x[idx] = (x0[idx] + a * (x[this.IX(i-1,j)] + x[this.IX(i+1,j)] + x[this.IX(i,j-1)] + x[this.IX(i,j+1)])) / c;
        }
      this.setBoundary(b, x);
    }
  }

  private advect(b: number, d: Float64Array, d0: Float64Array, u: Float64Array, v: Float64Array): void {
    const W = this.W, H = this.H;
    const N = Math.max(W, H);
    const dt0 = this.dt * N;
    for (let j = 1; j <= H; j++)
      for (let i = 1; i <= W; i++) {
        const idx = this.IX(i, j);
        let x = i - dt0 * u[idx], y = j - dt0 * v[idx];
        if (x < 0.5) x = 0.5; if (x > W + 0.5) x = W + 0.5;
        if (y < 0.5) y = 0.5; if (y > H + 0.5) y = H + 0.5;
        const i0 = Math.floor(x), i1 = i0+1, j0 = Math.floor(y), j1 = j0+1;
        const s1 = x-i0, s0 = 1-s1, t1 = y-j0, t0 = 1-t1;
        d[idx] = s0*(t0*d0[this.IX(i0,j0)]+t1*d0[this.IX(i0,j1)]) + s1*(t0*d0[this.IX(i1,j0)]+t1*d0[this.IX(i1,j1)]);
      }
    this.setBoundary(b, d);
  }

  private project(u: Float64Array, v: Float64Array, p: Float64Array, div: Float64Array): void {
    const W = this.W, H = this.H;
    const N = Math.max(W, H);
    const h = 1 / N;
    for (let j = 1; j <= H; j++)
      for (let i = 1; i <= W; i++) {
        const idx = this.IX(i, j);
        div[idx] = -0.5 * (h*(u[this.IX(i+1,j)]-u[this.IX(i-1,j)]) + h*(v[this.IX(i,j+1)]-v[this.IX(i,j-1)]));
        p[idx] = 0;
      }
    this.setBoundary(0, div); this.setBoundary(0, p);
    for (let k = 0; k < 20; k++) {
      for (let j = 1; j <= H; j++)
        for (let i = 1; i <= W; i++) {
          const idx = this.IX(i, j);
          p[idx] = (div[idx] + p[this.IX(i-1,j)] + p[this.IX(i+1,j)] + p[this.IX(i,j-1)] + p[this.IX(i,j+1)]) / 4;
        }
      this.setBoundary(0, p);
    }
    for (let j = 1; j <= H; j++)
      for (let i = 1; i <= W; i++) {
        const idx = this.IX(i, j);
        u[idx] -= 0.5 * N * (p[this.IX(i+1,j)] - p[this.IX(i-1,j)]);
        v[idx] -= 0.5 * N * (p[this.IX(i,j+1)] - p[this.IX(i,j-1)]);
      }
    this.setBoundary(1, u); this.setBoundary(2, v);
  }

  private setBoundary(b: number, x: Float64Array): void {
    const W = this.W, H = this.H;
    for (let i = 1; i <= W; i++) {
      x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
      x[this.IX(i, H+1)] = b === 2 ? -x[this.IX(i, H)] : x[this.IX(i, H)];
    }
    for (let j = 1; j <= H; j++) {
      x[this.IX(0, j)] = b === 1 ? -x[this.IX(1, j)] : x[this.IX(1, j)];
      x[this.IX(W+1, j)] = b === 1 ? -x[this.IX(W, j)] : x[this.IX(W, j)];
    }
    x[this.IX(0,0)] = 0.5*(x[this.IX(1,0)]+x[this.IX(0,1)]);
    x[this.IX(0,H+1)] = 0.5*(x[this.IX(1,H+1)]+x[this.IX(0,H)]);
    x[this.IX(W+1,0)] = 0.5*(x[this.IX(W,0)]+x[this.IX(W+1,1)]);
    x[this.IX(W+1,H+1)] = 0.5*(x[this.IX(W,H+1)]+x[this.IX(W+1,H)]);
  }

  private vorticityConfinement(): void {
    const W = this.W, H = this.H, curl = this.curl;
    const N = Math.max(W, H);
    for (let j = 1; j <= H; j++)
      for (let i = 1; i <= W; i++) {
        const idx = this.IX(i, j);
        curl[idx] = 0.5*N*(this.v[this.IX(i+1,j)]-this.v[this.IX(i-1,j)]-(this.u[this.IX(i,j+1)]-this.u[this.IX(i,j-1)]));
      }
    for (let j = 2; j < H; j++)
      for (let i = 2; i < W; i++) {
        const idx = this.IX(i, j);
        const dxC = (Math.abs(curl[this.IX(i+1,j)])-Math.abs(curl[this.IX(i-1,j)]))*0.5*N;
        const dyC = (Math.abs(curl[this.IX(i,j+1)])-Math.abs(curl[this.IX(i,j-1)]))*0.5*N;
        const len = Math.sqrt(dxC*dxC+dyC*dyC)+1e-5;
        const c = curl[idx];
        const invN = 1/N;
        this.u[idx] += this.vorticityEps*this.dt*(dyC/len)*c*invN;
        this.v[idx] -= this.vorticityEps*this.dt*(dxC/len)*c*invN;
      }
  }

  private applyDyeDecay(): void {
    const decay = this.dyeDecay;
    for (let i = 0; i < this.size; i++) {
      this.dR[i] *= decay; this.dG[i] *= decay; this.dB[i] *= decay;
    }
  }
}
