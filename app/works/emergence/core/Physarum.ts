// app/works/emergence/core/Physarum.ts
import { Simulation } from "./types";

// ─── Fixed constants ───────────────────────────────────────────────────────────
const N_AGENTS = 1500;

// Trail is capped so its range matches the colormap (trail/80 in COLOR_FRAG).
// Without a cap, trail accumulates into the hundreds and the extinction wave
// (which removes a fixed amount per frame) becomes visually imperceptible.
const TRAIL_MAX = 80;

// CPU diffuse is O(W×H). Cap pixel count to keep frame budget reasonable.
// At 1280×960 = 1.2M pixels, diffuse ≈ ~11ms — acceptable.
const MAX_PHYS_PIXELS = 1280 * 960;

function calcMapDims(w: number, h: number): { mw: number; mh: number } {
  const pixels = w * h;
  if (pixels <= MAX_PHYS_PIXELS) return { mw: w, mh: h };
  const scale = Math.sqrt(MAX_PHYS_PIXELS / pixels);
  return { mw: Math.round(w * scale), mh: Math.round(h * scale) };
}

// ─── Randomisable parameter ranges ────────────────────────────────────────────
interface PhysarumParams {
  sa:            number;  // sensor angle (rad)     PI/8–PI/2.5
  saDist:        number;  // sensor distance (px)   3–13
  ra:            number;  // rotation angle (rad)   PI/8–PI/2.5
  speed:         number;  // px/step                0.4–1.6
  deposit:       number;  // trail deposited/step   3–12
  decay:         number;  // trail decay factor     0.90–0.98
  stepsPerFrame: number;  // sim steps/frame        3–8
}

function randPhysarumParams(): PhysarumParams {
  return {
    sa:            Math.PI / 8 + Math.random() * (Math.PI / 2.5 - Math.PI / 8),
    saDist:        3 + Math.random() * 10,
    ra:            Math.PI / 8 + Math.random() * (Math.PI / 2.5 - Math.PI / 8),
    speed:         0.4 + Math.random() * 1.2,
    deposit:       3   + Math.random() * 9,
    decay:         0.90 + Math.random() * 0.08,
    stepsPerFrame: 3 + Math.floor(Math.random() * 6),
  };
}

// ─── Shader sources ───────────────────────────────────────────────────────────
const VERT = /* glsl */`#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Colormap: trail value → teal/green glow
const COLOR_FRAG = /* glsl */`#version 300 es
precision mediump float;
uniform sampler2D u_trail;
in  vec2 v_uv;
out vec4 o;
void main(){
  float t = clamp(texture(u_trail, v_uv).r / 80.0, 0.0, 1.0);
  // black → dim teal → bright cyan → white-teal
  vec3 c;
  if(t < 0.4){
    float k = t / 0.4;
    c = mix(vec3(0.0), vec3(0.02, 0.55, 0.45), k);
  } else if(t < 0.75){
    float k = (t - 0.4) / 0.35;
    c = mix(vec3(0.02, 0.55, 0.45), vec3(0.1, 1.0, 0.8), k);
  } else {
    float k = (t - 0.75) / 0.25;
    c = mix(vec3(0.1, 1.0, 0.8), vec3(0.8, 1.0, 0.95), k);
  }
  o = vec4(c, 1.0);
}`;

// ─── WebGL helpers ────────────────────────────────────────────────────────────
function mkProg(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("Physarum shader: " + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error("Physarum link: " + gl.getProgramInfoLog(p));
  return p;
}

// ─── Simulation ───────────────────────────────────────────────────────────────
export class Physarum implements Simulation {
  // CPU simulation arrays
  private trail:     Float32Array;
  private nextTrail: Float32Array;
  private ax:        Float32Array;
  private ay:        Float32Array;
  private aa:        Float32Array;

  // Simulation grid dimensions (may differ from canvas if capped)
  private mapW: number;
  private mapH: number;

  // Outer canvas dimensions — used to convert pointer coords to map coords
  private outerW: number;
  private outerH: number;

  // GPU rendering
  private gl:       WebGL2RenderingContext;
  private glCanvas: HTMLCanvasElement;
  private dProg:    WebGLProgram;
  private trailTex: WebGLTexture;
  private vao:      WebGLVertexArrayObject;

  // Randomisable simulation parameters
  private p: PhysarumParams;

  // Round-robin index for recycling agents when spawning via right-drag
  private spawnCursor = 0;

  // Extinction wave: a propagating decay front that spreads along the trail network.
  // Seeded probabilistically each frame; propagates to connected trail cells and
  // consumes trail as it goes — thin branches disappear first, thick ones last.
  private extinctionWave:     Float32Array;
  private nextExtinctionWave: Float32Array;

  constructor(w: number, h: number) {
    const { mw, mh } = calcMapDims(w, h);
    this.mapW   = mw;
    this.mapH   = mh;
    this.outerW = w;
    this.outerH = h;

    this.p = randPhysarumParams();

    this.trail              = new Float32Array(mw * mh);
    this.nextTrail          = new Float32Array(mw * mh);
    this.extinctionWave     = new Float32Array(mw * mh);
    this.nextExtinctionWave = new Float32Array(mw * mh);
    this.ax = new Float32Array(N_AGENTS);
    this.ay = new Float32Array(N_AGENTS);
    this.aa = new Float32Array(N_AGENTS);
    this.initAgents();

    // ── WebGL setup ──────────────────────────────────────────────────────────
    const canvas = document.createElement("canvas");
    canvas.width = mw; canvas.height = mh;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
    this.glCanvas = canvas;
    this.gl = gl;

    gl.getExtension("EXT_color_buffer_float");

    this.dProg = mkProg(gl, VERT, COLOR_FRAG);

    // Trail texture: R32F, updated each frame via texSubImage2D
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, mw, mh, 0, gl.RED, gl.FLOAT, this.trail);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.trailTex = tex;

    // Fullscreen quad VAO
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    gl.useProgram(this.dProg);
    gl.uniform1i(gl.getUniformLocation(this.dProg, "u_trail"), 0);
    gl.useProgram(null);
  }

  private initAgents() {
    const { mapW, mapH } = this;
    const cx = mapW / 2, cy = mapH / 2;
    const initR = Math.min(mapW, mapH) * 0.35;
    for (let i = 0; i < N_AGENTS; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = Math.random() * initR;
      this.ax[i]  = cx + Math.cos(angle) * r;
      this.ay[i]  = cy + Math.sin(angle) * r;
      this.aa[i]  = angle + Math.PI + (Math.random() - 0.5) * 0.5;
    }
  }

  private sampleTrail(x: number, y: number): number {
    const { mapW, mapH } = this;
    const xi = Math.max(0, Math.min(Math.round(x), mapW - 1));
    const yi = Math.max(0, Math.min(Math.round(y), mapH - 1));
    return this.trail[yi * mapW + xi];
  }

  private stepAgents() {
    const { ax, ay, aa, trail, mapW, mapH } = this;
    const { sa, saDist, ra, speed, deposit } = this.p;
    for (let i = 0; i < N_AGENTS; i++) {
      const a = aa[i], x = ax[i], y = ay[i];
      const sC = this.sampleTrail(x + saDist * Math.cos(a),       y + saDist * Math.sin(a));
      const sL = this.sampleTrail(x + saDist * Math.cos(a - sa),  y + saDist * Math.sin(a - sa));
      const sR = this.sampleTrail(x + saDist * Math.cos(a + sa),  y + saDist * Math.sin(a + sa));

      if      (sC > sL && sC > sR) { /* keep heading */ }
      else if (sL > sR)             { aa[i] -= ra; }
      else if (sR > sL)             { aa[i] += ra; }
      else                          { aa[i] += (Math.random() - 0.5) * ra * 2; }

      const nx = x + speed * Math.cos(aa[i]);
      const ny = y + speed * Math.sin(aa[i]);
      if (nx < 0 || nx >= mapW || ny < 0 || ny >= mapH) {
        aa[i] += Math.PI + (Math.random() - 0.5) * 0.5;
        ax[i] = Math.max(0, Math.min(nx, mapW - 1));
        ay[i] = Math.max(0, Math.min(ny, mapH - 1));
      } else {
        ax[i] = nx; ay[i] = ny;
      }
      const xi = Math.max(0, Math.min(Math.round(ax[i]), mapW - 1));
      const yi = Math.max(0, Math.min(Math.round(ay[i]), mapH - 1));
      trail[yi * mapW + xi] = Math.min(TRAIL_MAX, trail[yi * mapW + xi] + deposit);
    }
  }

  private diffuseAndDecay() {
    const { trail, nextTrail, extinctionWave, nextExtinctionWave, mapW, mapH } = this;
    const { decay } = this.p;

    // 3 seeds per step in dense interior cells only (trail > 40).
    // Fewer seeds but each clears a large visible patch with the higher consumption below.
    for (let s = 0; s < 3; s++) {
      const rx = Math.floor(Math.random() * mapW);
      const ry = Math.floor(Math.random() * mapH);
      const ri = ry * mapW + rx;
      if (trail[ri] > 40) extinctionWave[ri] = 1.0;
    }

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const i = y * mapW + x;
        let sum = 0, cnt = 0;
        let maxE = extinctionWave[i];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < mapW && ny >= 0 && ny < mapH) {
              const ni = ny * mapW + nx;
              sum += trail[ni]; cnt++;
              if ((dx !== 0 || dy !== 0) && extinctionWave[ni] > 0.05 && trail[i] > 6) {
                const spread = extinctionWave[ni] * 0.97;  // attenuates per hop → localized
                if (spread > maxE) maxE = spread;
              }
            }
          }
        }
        nextExtinctionWave[i] = maxE * 0.985;
        // consumption=60: even on a max-trail cell refilled to 80 by agents,
        // 80×0.94 - 60 = 15.2 (dark teal, t≈0.19) — clearly visible against the bright network.
        nextTrail[i] = Math.min(TRAIL_MAX, Math.max(0, (sum / cnt) * decay - maxE * 60));
      }
    }

    this.trail              = nextTrail;
    this.nextTrail          = trail;
    this.extinctionWave     = nextExtinctionWave;
    this.nextExtinctionWave = extinctionWave;
  }

  update(_delta: number) {
    for (let s = 0; s < this.p.stepsPerFrame; s++) this.stepAgents();
    this.diffuseAndDecay();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const { gl, dProg, trailTex, vao, mapW, mapH } = this;

    // Upload updated CPU trail to GPU texture
    gl.bindTexture(gl.TEXTURE_2D, trailTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mapW, mapH, gl.RED, gl.FLOAT, this.trail);

    // GPU colormap render
    gl.useProgram(dProg);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trailTex);
    gl.viewport(0, 0, mapW, mapH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // Blit to main canvas (uniform zoom if map was capped)
    ctx.drawImage(this.glCanvas, 0, 0, w, h);
  }

  // ── Left-click: randomise parameters for a fresh growth pattern ─────────
  // ── Right-click + drag: spawn 40 agents at cursor position ───────────────
  onPointerDown(x: number, y: number, button: number) {
    if (button === 0) {
      this.p = randPhysarumParams();
    } else if (button === 2) {
      this.spawnAt(x, y);
    }
  }

  onPointerMove(x: number, y: number, buttons: number) {
    if (buttons & 2) {  // right mouse button held
      this.spawnAt(x, y);
    }
  }

  onPointerUp() { /* stateless drag — nothing to clean up */ }

  // Convert outer-canvas coordinates to map coordinates and scatter N agents there.
  // Agents are recycled round-robin so total count stays fixed at N_AGENTS.
  // Y is flipped: WebGL texture row 0 renders at the bottom of the screen,
  // so canvas Y (top=0) must be inverted to match CPU trail array coordinates.
  private spawnAt(canvasX: number, canvasY: number) {
    const mapX = canvasX * this.mapW / this.outerW;
    const mapY = (this.outerH - canvasY) * this.mapH / this.outerH;
    const N_SPAWN = 40;
    for (let k = 0; k < N_SPAWN; k++) {
      const idx = this.spawnCursor % N_AGENTS;
      this.spawnCursor++;
      const r = Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      this.ax[idx] = Math.max(0, Math.min(this.mapW - 1, mapX + Math.cos(a) * r));
      this.ay[idx] = Math.max(0, Math.min(this.mapH - 1, mapY + Math.sin(a) * r));
      this.aa[idx] = Math.random() * Math.PI * 2;
    }
  }

  resize(w: number, h: number) {
    const { gl } = this;
    const { mw: newMW, mh: newMH } = calcMapDims(w, h);
    const oldMW = this.mapW, oldMH = this.mapH;

    this.outerW = w;
    this.outerH = h;

    // 1. Copy trail state into new array (top-left aligned, zero-fill elsewhere)
    const newTrail = new Float32Array(newMW * newMH);
    const cpW = Math.min(oldMW, newMW);
    const cpH = Math.min(oldMH, newMH);
    for (let y = 0; y < cpH; y++) {
      for (let x = 0; x < cpW; x++) {
        newTrail[y * newMW + x] = this.trail[y * oldMW + x];
      }
    }
    this.trail              = newTrail;
    this.nextTrail          = new Float32Array(newMW * newMH);
    this.extinctionWave     = new Float32Array(newMW * newMH);
    this.nextExtinctionWave = new Float32Array(newMW * newMH);

    // 2. Scale agent positions proportionally to new map dimensions
    const scaleX = newMW / oldMW;
    const scaleY = newMH / oldMH;
    for (let i = 0; i < N_AGENTS; i++) {
      this.ax[i] = Math.max(0, Math.min(newMW - 1, this.ax[i] * scaleX));
      this.ay[i] = Math.max(0, Math.min(newMH - 1, this.ay[i] * scaleY));
    }

    this.mapW = newMW;
    this.mapH = newMH;

    // 3. Resize GL canvas
    this.glCanvas.width  = newMW;
    this.glCanvas.height = newMH;

    // 4. Recreate trail texture at new size with preserved data
    gl.deleteTexture(this.trailTex);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, newMW, newMH, 0, gl.RED, gl.FLOAT, this.trail);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.trailTex = tex;
  }

  destroy() {
    this.gl.deleteTexture(this.trailTex);
    this.gl.deleteProgram(this.dProg);
    this.gl.deleteVertexArray(this.vao);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
