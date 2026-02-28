// app/works/emergence/core/GrayScott.ts
import { Simulation } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────
const SUBSTEPS = 16;
const SPOT_R        = 30;   // spot circle radius (canvas pixels)
const TENT_R        = 15;   // tentacle half-thickness (px)
const TENT_LEN      = 100;  // end-point distance from spot centre (px)
const TENT_SAMPLES  = 50;   // bezier sample count for rasterisation

// Default RD parameters (used as initial values; randomised on right-click)
const DEF_DU        = 0.2097;
const DEF_DV        = 0.1050;
const DEF_F         = 0.040;
const DEF_K         = 0.060;
const DEF_NOISE_K   = 0.012;

// ─── Shader sources ───────────────────────────────────────────────────────────
const VERT = /* glsl */`#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Compute: reaction-diffusion step
// Texture: R=U, G=V, B=H (hue / colony ID), A=seed (per-colony noise phase 0.01–1.0)
//
// Channel invariants:
//   H = 0.0   → uninitialised background
//   H > 0.005 → permanently categorised colony (immutable)
//   A = 0.0   → background / unset
//   A > 0.005 → per-colony random seed used to offset the spatial noise phase
//
// Amoeba-like spreading: a smooth low-frequency noise field (seeded per colony)
// locally shifts the kill-rate K.  Low-K zones spread faster and form pseudopods;
// high-K zones spread slower and form indentations — exactly like an amoeba cell.
const COMPUTE_FRAG = /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform vec2      u_res;
in  vec2 v_uv;
out vec4 o;

uniform float u_DU;
uniform float u_DV;
uniform float u_F;
uniform float u_Kk;
uniform float u_noiseKAmp;
const float DT = 1.0;

// Low-cost spatial hash used for per-colony K noise
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main(){
  vec2 px  = 1.0 / u_res;
  vec4 cen = texture(u_state, v_uv);
  vec4 lft = texture(u_state, v_uv + vec2(-px.x,  0.0));
  vec4 rgt = texture(u_state, v_uv + vec2( px.x,  0.0));
  vec4 up  = texture(u_state, v_uv + vec2( 0.0, -px.y));
  vec4 dn  = texture(u_state, v_uv + vec2( 0.0,  px.y));

  float U = cen.r;
  float V = cen.g;
  float H = cen.b;
  float A = cen.a;  // anisotropy angle: 0=background, 0.01–1.0=colony

  // Colony wall: no-flux boundary between different colonies
  bool lftWall = (H > 0.005) && (lft.b > 0.005) && (abs(lft.b - H) > 0.005);
  bool rgtWall = (H > 0.005) && (rgt.b > 0.005) && (abs(rgt.b - H) > 0.005);
  bool upWall  = (H > 0.005) && (up.b  > 0.005) && (abs(up.b  - H) > 0.005);
  bool dnWall  = (H > 0.005) && (dn.b  > 0.005) && (abs(dn.b  - H) > 0.005);

  float lU = lftWall ? U : lft.r;
  float rU = rgtWall ? U : rgt.r;
  float uU = upWall  ? U : up.r;
  float dU = dnWall  ? U : dn.r;
  float lV = lftWall ? V : lft.g;
  float rV = rgtWall ? V : rgt.g;
  float uV = upWall  ? V : up.g;
  float dV = dnWall  ? V : dn.g;

  // Standard isotropic Laplacian
  float lu = lU + rU + uU + dU - 4.0 * U;
  float lv = lV + rV + uV + dV - 4.0 * V;

  // Per-colony K noise: bilinear value noise using cheap hash() (no sin).
  // 4-corner interpolation with smoothstep removes square tile edges.
  vec2  np  = v_uv * u_res / 32.0 + A * vec2(47.0, 83.0);
  vec2  ni  = floor(np);
  vec2  nf  = fract(np);
  vec2  ns  = nf * nf * (3.0 - 2.0 * nf);
  float n00 = hash(ni);
  float n10 = hash(ni + vec2(1.0, 0.0));
  float n01 = hash(ni + vec2(0.0, 1.0));
  float n11 = hash(ni + vec2(1.0, 1.0));
  float nz  = mix(mix(n00, n10, ns.x), mix(n01, n11, ns.x), ns.y);
  float localKk = (A > 0.005) ? (u_Kk + (nz - 0.5) * u_noiseKAmp) : u_Kk;

  float oscF = u_F;

  float newU = clamp(U + DT * (u_DU * lu - U * V * V + oscF * (1.0 - U)), 0.0, 1.0);
  float newV = clamp(V + DT * (u_DV * lv + U * V * V - (oscF + localKk) * V), 0.0, 1.0);

  // Colony boundary: drain V to zero so RD diffusion creates a natural dark zone.
  if (lftWall || rgtWall || upWall || dnWall) newV = 0.0;

  // ── Hue + anisotropy propagation ──────────────────────────────────────────
  float newH;
  float newA;
  if (H > 0.005) {
    newH = H; newA = A;
  } else if (newV > 0.02) {
    // Background cell inherits from highest-V neighbour
    float mV = max(max(lft.g, rgt.g), max(up.g, dn.g));
    if      (lft.g >= mV - 0.001) { newH = lft.b; newA = lft.a; }
    else if (rgt.g >= mV - 0.001) { newH = rgt.b; newA = rgt.a; }
    else if (up.g  >= mV - 0.001) { newH = up.b;  newA = up.a;  }
    else                           { newH = dn.b;  newA = dn.a;  }
  } else {
    newH = 0.0;
    newA = 0.0;
  }

  o = vec4(newU, newV, newH, newA);
}`;

// Colormap: H channel → hue, V channel → brightness
// Each patch keeps the colour it was seeded with; no uniform palette transitions.
const COLOR_FRAG = /* glsl */`#version 300 es
precision mediump float;
uniform sampler2D u_state;
in  vec2 v_uv;
out vec4 o;

vec3 hsv2rgb(float h, float s, float v){
  float k6 = h * 6.0;
  float r   = clamp(abs(k6 - 3.0) - 1.0, 0.0, 1.0);
  float g   = clamp(2.0 - abs(k6 - 2.0), 0.0, 1.0);
  float b   = clamp(2.0 - abs(k6 - 4.0), 0.0, 1.0);
  return v * mix(vec3(1.0), vec3(r, g, b), s);
}

void main(){
  vec4  s = texture(u_state, v_uv);
  float v = clamp(s.g * 4.0, 0.0, 1.0);
  o = vec4(hsv2rgb(s.b, 0.85, v), 1.0);
}`;

// ─── WebGL helpers ────────────────────────────────────────────────────────────
function mkProg(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("GrayScott shader: " + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error("GrayScott link: " + gl.getProgramInfoLog(p));
  return p;
}

function mkTex(gl: WebGL2RenderingContext, w: number, h: number, data?: Float32Array): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data ?? null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

function mkFBO(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const f = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

// ─── Spot ─────────────────────────────────────────────────────────────────────
// Each colony owns one invisible "spot" that roams the boundary between colonies.
// While roaming it moves along the H-field boundary (tangent to the edge).
// When the boundary ring intersects enemy H, the spot overrides enemy pixels
// inside its 30-px circle with the spot's own colony values.
interface Tentacle {
  // ── Far-end rotation ───────────────────────────────────────────────────────
  endAngle:     number;  // current angle of far end from spot centre (radians)
  rotSpeed:     number;  // rotation speed (rad/s), always positive
  rotDir:       number;  // +1 = CCW, -1 = CW
  rotReverseCd: number;  // countdown to next direction-reversal check (s)

  // ── Control points: current interpolated values ───────────────────────────
  cp1x: number; cp1y: number;  // relative to spot centre (canvas 2D)
  cp2x: number; cp2y: number;

  // ── Wriggle lerp A → B ────────────────────────────────────────────────────
  cp1xA: number; cp1yA: number;  // lerp source
  cp2xA: number; cp2yA: number;
  cp1xB: number; cp1yB: number;  // lerp target
  cp2xB: number; cp2yB: number;
  cpT:   number;  // [0, 1] lerp progress
  cpDur: number;  // lerp duration (s) ≈ 2
}

interface Spot {
  hue:        number;  // colony H value (unique colony ID)
  aniso:      number;  // colony A value
  x:          number;  // canvas 2D x (integer px, x=0 left)
  y:          number;  // canvas 2D y (integer px, y=0 top)
  accX:       number;  // sub-pixel accumulator x
  accY:       number;  // sub-pixel accumulator y
  angle:      number;  // current movement direction (radians)
  speed:      number;  // px / second
  tangentDir: number;  // +1 or -1: which side to traverse along the boundary
  reverseCd:  number;  // countdown to reverse-direction check (s)
  dirCd:      number;  // roaming mode: countdown to random turn (s)
  tentacles:  Tentacle[];
}

// ─── Simulation ───────────────────────────────────────────────────────────────
// Golden-ratio hue sequencer: consecutive hues are maximally far apart
// on the colour wheel (0.618… ≈ 1/φ stepping guarantees that any two
// successive values are ≥ 0.382 apart before wrapping).
const GOLDEN = 0.6180339887498949;

export class GrayScott implements Simulation {
  private gsW: number;
  private gsH: number;
  private gl:       WebGL2RenderingContext;
  private glCanvas: HTMLCanvasElement;
  private cProg:    WebGLProgram;
  private dProg:    WebGLProgram;
  private tex:      WebGLTexture[];
  private fbo:      WebGLFramebuffer[];
  private vao:      WebGLVertexArrayObject;
  private ping = 0;
  private frame = 0;

  // Runtime RD parameters — randomised on right-click without reinitialising state
  private params = {
    F: DEF_F, K: DEF_K,
    DU: DEF_DU, DV: DEF_DV,
    noiseKAmp: DEF_NOISE_K,
  };
  private paramsDirty = true;
  private uFLoc:         WebGLUniformLocation | null = null;
  private uKkLoc:        WebGLUniformLocation | null = null;
  private uDULoc:        WebGLUniformLocation | null = null;
  private uDVLoc:        WebGLUniformLocation | null = null;
  private uNoiseKAmpLoc: WebGLUniformLocation | null = null;

  // H-value debug overlay (shown when M button is open)
  public  showHGrid    = false;
  private hGridPixels: Float32Array | null = null;
  private hGridTimer   = 0;

  private hueSeq = Math.random();
  private nextHue(): number {
    const h = this.hueSeq;
    this.hueSeq = (this.hueSeq + GOLDEN) % 1.0;
    // Map [0,1] → [0.01, 1.0] so 0.0 stays reserved as the "uninitialised" sentinel
    return h * 0.99 + 0.01;
  }

  // Roaming spots — one per colony
  private spots: Spot[] = [];

  private makeSpot(x: number, y: number, hue: number, aniso: number): Spot {
    const angle = Math.random() * Math.PI * 2;
    const tentacles: Tentacle[] = Array.from({ length: 3 }, () => {
      const endAngle = Math.random() * Math.PI * 2;
      const ex = Math.cos(endAngle) * TENT_LEN;
      const ey = Math.sin(endAngle) * TENT_LEN;
      const cp1x = (Math.random() - 0.5) * 120;
      const cp1y = (Math.random() - 0.5) * 120;
      const cp2x = ex + (Math.random() - 0.5) * 80;
      const cp2y = ey + (Math.random() - 0.5) * 80;
      return {
        endAngle,
        rotSpeed:    0.15 + Math.random() * 0.2,   // 0.15–0.35 rad/s (2× slower)
        rotDir:      Math.random() < 0.5 ? 1 : -1,
        rotReverseCd: 1 + Math.random() * 2,       // first check in 1–3 s
        cp1x, cp1y, cp2x, cp2y,
        cp1xA: cp1x, cp1yA: cp1y,
        cp2xA: cp2x, cp2yA: cp2y,
        cp1xB: cp1x, cp1yB: cp1y,
        cp2xB: cp2x, cp2yB: cp2y,
        cpT: 1,    // immediately roll first wriggle target on first update
        cpDur: 2,
      };
    });
    return {
      hue, aniso, x, y,
      angle,
      speed:      10 + Math.random() * 10,  // 10–20 px/s (2× slower)
      accX:       0,
      accY:       0,
      tangentDir: Math.random() < 0.5 ? 1 : -1,
      reverseCd:  1 + Math.random() * 2,    // first reversal in 1–3 s
      dirCd:      1 + Math.random() * 4,    // first roaming turn in 1–5 s
      tentacles,
    };
  }

  constructor(w: number, h: number) {
    this.gsW = w;
    this.gsH = h;

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
    this.glCanvas = canvas;
    this.gl = gl;

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) throw new Error("EXT_color_buffer_float not supported");

    this.cProg = mkProg(gl, VERT, COMPUTE_FRAG);
    this.dProg = mkProg(gl, VERT, COLOR_FRAG);

    const t0 = mkTex(gl, w, h, this.makeSeed(w, h));
    const t1 = mkTex(gl, w, h);
    this.tex = [t0, t1];
    this.fbo = [mkFBO(gl, t0), mkFBO(gl, t1)];

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    gl.useProgram(this.cProg);
    gl.uniform2f(gl.getUniformLocation(this.cProg, "u_res"), w, h);
    gl.uniform1i(gl.getUniformLocation(this.cProg, "u_state"), 0);
    this.uFLoc        = gl.getUniformLocation(this.cProg, "u_F");
    this.uKkLoc       = gl.getUniformLocation(this.cProg, "u_Kk");
    this.uDULoc       = gl.getUniformLocation(this.cProg, "u_DU");
    this.uDVLoc       = gl.getUniformLocation(this.cProg, "u_DV");
    this.uNoiseKAmpLoc= gl.getUniformLocation(this.cProg, "u_noiseKAmp");

    gl.useProgram(this.dProg);
    gl.uniform1i(gl.getUniformLocation(this.dProg, "u_state"), 0);
    gl.useProgram(null);
  }

  // Seed: 3 patches at random positions, each with its own hue (B) and
  // anisotropy angle (A).  Background cells have A=0 (sentinel).
  private makeSeed(w: number, h: number): Float32Array {
    const data = new Float32Array(w * h * 4);
    // U = 1 everywhere (equilibrium); G/B/A stay 0
    for (let i = 0; i < w * h; i++) data[i * 4] = 1.0;

    const margin = Math.min(80, w * 0.15, h * 0.15);
    const rand   = () => margin + Math.random() * (w - 2 * margin);
    const randu  = () => margin + Math.random() * (h - 2 * margin);
    const patches = [
      { cx: rand(), cy: randu(), r: 15 + Math.random() * 10, hue: this.nextHue(), aniso: 0.01 + Math.random() * 0.99 },
      { cx: rand(), cy: randu(), r:  8 + Math.random() *  8, hue: this.nextHue(), aniso: 0.01 + Math.random() * 0.99 },
      { cx: rand(), cy: randu(), r:  8 + Math.random() *  8, hue: this.nextHue(), aniso: 0.01 + Math.random() * 0.99 },
    ];
    for (const p of patches) {
      const cx = Math.round(p.cx), cy = Math.round(p.cy), r = Math.round(p.r);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const i       = y * w + x;
          data[i * 4]   = 0.5  + (Math.random() - 0.5) * 0.1;   // U
          data[i * 4+1] = 0.25 + (Math.random() - 0.5) * 0.05;  // V
          data[i * 4+2] = p.hue;                                  // H
          data[i * 4+3] = p.aniso;                                // A (aniso angle)
        }
      }
      // Spawn a spot at the patch centre.
      // makeSeed uses texture Y coords (y=0 = bottom of screen);
      // canvas 2D Y = h - 1 - texY, so canvas2D_y = h - 1 - p.cy.
      this.spots.push(this.makeSpot(p.cx, h - 1 - p.cy, p.hue, p.aniso));
    }
    return data;
  }

  // Left-click: inject a new colony patch at the cursor position.
  // If an existing colony occupies the click point, clear a circular area first.
  private spawnPatch(cx: number, cy: number) {
    const { gl } = this;
    const w = this.gsW, h = this.gsH;

    // Single-pixel readback to detect existing colony (cheap — 1 pixel only)
    const texX = Math.max(0, Math.min(w - 1, Math.round(cx)));
    const texY = Math.max(0, Math.min(h - 1, h - 1 - Math.round(cy)));
    const pixel = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.ping]);
    gl.readPixels(texX, texY, 1, 1, gl.RGBA, gl.FLOAT, pixel);

    if (pixel[2] > 0.005) {
      // Existing colony — read region back, clear only circle pixels, upload
      const cr = 114, cD = 2 * cr + 1;
      const cx0 = Math.max(0, Math.min(w - cD, Math.round(cx) - cr));
      const cy0 = Math.max(0, Math.min(h - cD, (h - Math.round(cy)) - cr));
      const clearPatch = new Float32Array(cD * cD * 4);
      gl.readPixels(cx0, cy0, cD, cD, gl.RGBA, gl.FLOAT, clearPatch);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      for (let j = 0; j < cD; j++) {
        for (let i = 0; i < cD; i++) {
          const dx = i - cr, dy = j - cr;
          if (dx * dx + dy * dy <= cr * cr) {
            const idx = (j * cD + i) * 4;
            clearPatch[idx]     = 1.0; // U=1 (background equilibrium)
            clearPatch[idx + 1] = 0.0;
            clearPatch[idx + 2] = 0.0;
            clearPatch[idx + 3] = 0.0;
          }
        }
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, cx0, cy0, cD, cD, gl.RGBA, gl.FLOAT, clearPatch);

      // Remove spot belonging to the cleared colony
      const clearedHue = pixel[2];
      this.spots = this.spots.filter(s => Math.abs(s.hue - clearedHue) > 0.005);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
    }

    // Spawn new colony (r=14)
    const r = 14, D = 2 * r + 1;
    const hue = this.nextHue(), aniso = 0.01 + Math.random() * 0.99;
    const patch = new Float32Array(D * D * 4);
    for (let j = 0; j < D; j++) {
      for (let i = 0; i < D; i++) {
        const dx = i - r, dy = j - r;
        const idx = (j * D + i) * 4;
        if (dx * dx + dy * dy <= r * r) {
          patch[idx]     = 0.5  + (Math.random() - 0.5) * 0.1;
          patch[idx + 1] = 0.25 + (Math.random() - 0.5) * 0.05;
          patch[idx + 2] = hue;
          patch[idx + 3] = aniso;
        } else {
          patch[idx] = 1.0;
        }
      }
    }
    const x0 = Math.max(0, Math.min(w - D, Math.round(cx) - r));
    const y0 = Math.max(0, Math.min(h - D, (h - Math.round(cy)) - r));
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, D, D, gl.RGBA, gl.FLOAT, patch);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Spawn spot at the new colony's centre (canvas 2D coords: cx, cy)
    this.spots.push(this.makeSpot(cx, cy, hue, aniso));
  }

  // Move spots along the H-field boundary and claim enemy territory.
  private updateSpots(delta: number) {
    const { gl } = this;
    const w = this.gsW, h = this.gsH;

    for (const sp of this.spots) {
      // ── 1. Sub-pixel accumulation → integer 1-px steps ───────────────────
      sp.accX += Math.cos(sp.angle) * sp.speed * delta;
      sp.accY += Math.sin(sp.angle) * sp.speed * delta;
      const stepX = Math.trunc(sp.accX);
      const stepY = Math.trunc(sp.accY);
      sp.accX -= stepX;
      sp.accY -= stepY;
      if (stepX === 0 && stepY === 0) continue;

      sp.x += stepX;
      sp.y += stepY;

      // ── 2. Wall bounce ─────────────────────────────────────────────────────
      if (sp.x < SPOT_R) {
        sp.x = SPOT_R; sp.accX = 0; sp.angle = Math.PI - sp.angle;
      } else if (sp.x > w - SPOT_R) {
        sp.x = w - SPOT_R; sp.accX = 0; sp.angle = Math.PI - sp.angle;
      }
      if (sp.y < SPOT_R) {
        sp.y = SPOT_R; sp.accY = 0; sp.angle = -sp.angle;
      } else if (sp.y > h - SPOT_R) {
        sp.y = h - SPOT_R; sp.accY = 0; sp.angle = -sp.angle;
      }

      // ── 3. Read bounding box ───────────────────────────────────────────────
      // Canvas 2D y=0 is top; texture y=0 is bottom → flip Y for readPixels.
      const tcx = Math.max(0, Math.min(w - 1, Math.round(sp.x)));
      const tcy = Math.max(0, Math.min(h - 1, h - 1 - Math.round(sp.y)));
      const rx0 = Math.max(0, tcx - SPOT_R);
      const ry0 = Math.max(0, tcy - SPOT_R);
      const rx1 = Math.min(tcx + SPOT_R + 1, w);
      const ry1 = Math.min(tcy + SPOT_R + 1, h);
      const rW  = rx1 - rx0, rH = ry1 - ry0;
      if (rW <= 0 || rH <= 0) continue;

      const region = new Float32Array(rW * rH * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.ping]);
      gl.readPixels(rx0, ry0, rW, rH, gl.RGBA, gl.FLOAT, region);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // ── 4. Boundary ring: compute centroid ────────────────────────────────
      // Ring: (R-2)² ≤ dx²+dy² ≤ R²  (2-px thick inner edge)
      // bCount: any non-own pixel (background H=0 OR enemy) → drives direction
      // eCount: actual rival colony (H>0.005, H≠sp.hue)     → drives override
      const R2   = SPOT_R * SPOT_R;
      const R2in = (SPOT_R - 2) * (SPOT_R - 2);
      let ex = 0, ey = 0, bCount = 0, eCount = 0;
      for (let j = 0; j < rH; j++) {
        for (let i = 0; i < rW; i++) {
          const dx = (rx0 + i) - tcx, dy = (ry0 + j) - tcy;
          const d2 = dx * dx + dy * dy;
          if (d2 < R2in || d2 > R2) continue;
          const hv = region[(j * rW + i) * 4 + 2];
          if (Math.abs(hv - sp.hue) > 0.005) {   // background or enemy
            ex += dx; ey += dy; bCount++;
          }
          if (hv > 0.005 && Math.abs(hv - sp.hue) > 0.005) eCount++;
        }
      }

      // ── 5. Update movement direction ───────────────────────────────────────
      if (bCount > 0) {
        // Boundary mode: move tangent to the normal pointing toward non-own pixels.
        // (ex, ey) in texture space; angle applied in canvas 2D (y-axis flipped).
        // Screen-space tangent = (ny_tex × tangentDir, nx_tex × tangentDir)
        const len = Math.sqrt(ex * ex + ey * ey);
        if (len > 0.5) {
          const nx = ex / len, ny = ey / len;
          sp.angle = Math.atan2(nx * sp.tangentDir, ny * sp.tangentDir);
        }
        // Periodically reverse traversal direction (50 % chance every 1–3 s)
        sp.reverseCd -= delta;
        if (sp.reverseCd <= 0) {
          sp.reverseCd = 1 + Math.random() * 2;
          if (Math.random() < 0.5) sp.tangentDir *= -1;
        }
      } else {
        // Roaming mode: random ±45° turn when spot is fully inside own colony
        sp.dirCd -= delta;
        if (sp.dirCd <= 0) {
          sp.dirCd  = 2 + Math.random() * 2;
          sp.angle += (Math.random() - 0.5) * (Math.PI / 2);
        }
      }

      // ── 6. Override enemy pixels inside the circle ────────────────────────
      if (eCount === 0) continue;
      let changed = false;
      for (let j = 0; j < rH; j++) {
        for (let i = 0; i < rW; i++) {
          const dx = (rx0 + i) - tcx, dy = (ry0 + j) - tcy;
          if (dx * dx + dy * dy > R2) continue;
          const idx = (j * rW + i) * 4;
          const hv  = region[idx + 2];
          if (hv > 0.005 && Math.abs(hv - sp.hue) > 0.005) {
            region[idx]     = 0.5  + (Math.random() - 0.5) * 0.1;  // U
            region[idx + 1] = 0.25 + (Math.random() - 0.5) * 0.05; // V
            region[idx + 2] = sp.hue;                               // H
            region[idx + 3] = sp.aniso;                             // A
            changed = true;
          }
        }
      }
      if (changed) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, rx0, ry0, rW, rH, gl.RGBA, gl.FLOAT, region);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }
  }

  // Advance tentacle animations: rotate end-points + wriggle control points.
  private updateTentacleAnimations(delta: number) {
    for (const sp of this.spots) {
      for (const ten of sp.tentacles) {
        // ── 1. Rotate end-point ─────────────────────────────────────────────
        ten.endAngle += ten.rotSpeed * ten.rotDir * delta;
        ten.rotReverseCd -= delta;
        if (ten.rotReverseCd <= 0) {
          ten.rotReverseCd = 1 + Math.random() * 2;   // recheck in 1–3 s
          if (Math.random() < 0.5) ten.rotDir *= -1;
        }

        // ── 2. Wriggle control points (lerp A → B, roll new B when done) ───
        ten.cpT += delta / ten.cpDur;
        if (ten.cpT >= 1) {
          // Arrived — old target becomes new source, roll fresh target
          ten.cp1xA = ten.cp1xB; ten.cp1yA = ten.cp1yB;
          ten.cp2xA = ten.cp2xB; ten.cp2yA = ten.cp2yB;
          const ex = Math.cos(ten.endAngle) * TENT_LEN;
          const ey = Math.sin(ten.endAngle) * TENT_LEN;
          ten.cp1xB = (Math.random() - 0.5) * 120;
          ten.cp1yB = (Math.random() - 0.5) * 120;
          ten.cp2xB = ex + (Math.random() - 0.5) * 80;
          ten.cp2yB = ey + (Math.random() - 0.5) * 80;
          ten.cpT   = 0;
          ten.cpDur = 2;
        }
        // Smooth-step so motion eases in/out
        const s = ten.cpT * ten.cpT * (3 - 2 * ten.cpT);
        ten.cp1x = ten.cp1xA + (ten.cp1xB - ten.cp1xA) * s;
        ten.cp1y = ten.cp1yA + (ten.cp1yB - ten.cp1yA) * s;
        ten.cp2x = ten.cp2xA + (ten.cp2xB - ten.cp2xA) * s;
        ten.cp2y = ten.cp2yA + (ten.cp2yB - ten.cp2yA) * s;
      }
    }
  }

  // Rasterise each spot's 3 bezier tentacles onto the H field.
  // Any pixel touched by a tentacle that has a different H is overridden.
  private updateTentacles() {
    const { gl } = this;
    const w = this.gsW, h = this.gsH;
    const TR2 = TENT_R * TENT_R;

    for (const sp of this.spots) {
      // ── Bounding box (canvas 2D) covering all 3 tentacles ─────────────────
      let minX = sp.x, maxX = sp.x, minY = sp.y, maxY = sp.y;
      for (const ten of sp.tentacles) {
        for (const [px, py] of [
          [sp.x + ten.cp1x, sp.y + ten.cp1y],
          [sp.x + ten.cp2x, sp.y + ten.cp2y],
          [sp.x + Math.cos(ten.endAngle) * TENT_LEN, sp.y + Math.sin(ten.endAngle) * TENT_LEN],
        ] as [number, number][]) {
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
      }

      // Canvas bbox → texture bbox (flip y: canvas y=0 top ↔ texture y=0 bottom)
      const cx0 = Math.max(0, Math.floor(minX - TENT_R));
      const cx1 = Math.min(w - 1, Math.ceil(maxX + TENT_R));
      const cy0 = Math.max(0, Math.floor(minY - TENT_R));
      const cy1 = Math.min(h - 1, Math.ceil(maxY + TENT_R));
      const tx0 = cx0,  ty0 = h - 1 - cy1;
      const tx1 = cx1,  ty1 = h - 1 - cy0;
      const tW  = tx1 - tx0 + 1, tH = ty1 - ty0 + 1;
      if (tW <= 0 || tH <= 0) continue;

      // ── Read region ────────────────────────────────────────────────────────
      const region = new Float32Array(tW * tH * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.ping]);
      gl.readPixels(tx0, ty0, tW, tH, gl.RGBA, gl.FLOAT, region);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // ── Pre-compute all enemy tentacle sample positions (canvas 2D) ──────────
      // Two tentacles overlap when a sample from each is within 2*TENT_R.
      const OVERLAP_R2 = (2 * TENT_R) * (2 * TENT_R);
      const enemyPts: number[] = [];  // flat [x0, y0, x1, y1, …]
      for (const other of this.spots) {
        if (Math.abs(other.hue - sp.hue) <= 0.005) continue;
        for (const oten of other.tentacles) {
          const op0x = other.x,                op0y = other.y;
          const op1x = other.x + oten.cp1x,   op1y = other.y + oten.cp1y;
          const op2x = other.x + oten.cp2x,   op2y = other.y + oten.cp2y;
          const op3x = other.x + Math.cos(oten.endAngle) * TENT_LEN;
          const op3y = other.y + Math.sin(oten.endAngle) * TENT_LEN;
          for (let ti = 0; ti <= TENT_SAMPLES; ti++) {
            const t = ti / TENT_SAMPLES, u = 1 - t;
            enemyPts.push(
              u*u*u*op0x + 3*u*u*t*op1x + 3*u*t*t*op2x + t*t*t*op3x,
              u*u*u*op0y + 3*u*u*t*op1y + 3*u*t*t*op2y + t*t*t*op3y,
            );
          }
        }
      }

      // ── Sample each tentacle and paint disks ───────────────────────────────
      let changed = false;
      let conflictX = 0, conflictY = 0, conflictCount = 0;

      for (const ten of sp.tentacles) {
        const p0x = sp.x,              p0y = sp.y;
        const p1x = sp.x + ten.cp1x,  p1y = sp.y + ten.cp1y;
        const p2x = sp.x + ten.cp2x,  p2y = sp.y + ten.cp2y;
        const p3x = sp.x + Math.cos(ten.endAngle) * TENT_LEN;
        const p3y = sp.y + Math.sin(ten.endAngle) * TENT_LEN;

        for (let ti = 0; ti <= TENT_SAMPLES; ti++) {
          const t = ti / TENT_SAMPLES;
          const u = 1 - t;
          // Cubic bezier sample in canvas 2D
          const bx = u*u*u*p0x + 3*u*u*t*p1x + 3*u*t*t*p2x + t*t*t*p3x;
          const by = u*u*u*p0y + 3*u*u*t*p1y + 3*u*t*t*p2y + t*t*t*p3y;

          // Check tentacle-vs-tentacle: is this sample within 2*TENT_R of any enemy sample?
          let inEnemyTentacle = false;
          for (let ei = 0; ei < enemyPts.length; ei += 2) {
            const ddx = bx - enemyPts[ei], ddy = by - enemyPts[ei + 1];
            if (ddx * ddx + ddy * ddy <= OVERLAP_R2) { inEnemyTentacle = true; break; }
          }

          if (inEnemyTentacle) {
            // Record conflict direction (canvas 2D offset from spot centre)
            conflictX += bx - sp.x;
            conflictY += by - sp.y;
            conflictCount++;
            continue;  // skip painting this disk
          }

          // Paint disk — override background AND enemy colony body
          const stx = Math.round(bx);
          const sty = h - 1 - Math.round(by);
          for (let dy = -TENT_R; dy <= TENT_R; dy++) {
            for (let dx = -TENT_R; dx <= TENT_R; dx++) {
              if (dx*dx + dy*dy > TR2) continue;
              const px = stx + dx, py = sty + dy;
              if (px < tx0 || px > tx1 || py < ty0 || py > ty1) continue;
              const ri = ((py - ty0) * tW + (px - tx0)) * 4;
              if (Math.abs(region[ri + 2] - sp.hue) > 0.005) {
                // Always update colony identity (H) and anisotropy (A).
                // Claim the pixel: set our identity but zero out V.
                // V=0 means the pixel shows black (brightness = V*4 = 0).
                // Our colony's V diffuses naturally from the bezier path
                // (which is connected to our established colony from P0),
                // filling the claimed area with our own RD pattern —
                // no foreign-coloured pixels at the boundary.
                region[ri]     = 1.0;   // U = substrate
                region[ri + 1] = 0.0;   // V = 0 → let diffusion fill
                region[ri + 2] = sp.hue;
                region[ri + 3] = sp.aniso;
                changed = true;
              }
            }
          }
        }
      }

      // Steer the spot away from the enemy-tentacle contact centroid
      if (conflictCount > 0) {
        const cx = conflictX / conflictCount;
        const cy = conflictY / conflictCount;
        sp.angle = Math.atan2(cy, cx) + Math.PI;
      }

      if (changed) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, tx0, ty0, tW, tH, gl.RGBA, gl.FLOAT, region);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }
  }

  update(delta: number) {
    const { gl, cProg, tex, fbo, vao } = this;
    gl.useProgram(cProg);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, this.gsW, this.gsH);

    if (this.paramsDirty) {
      const p = this.params;
      gl.uniform1f(this.uFLoc,         p.F);
      gl.uniform1f(this.uKkLoc,        p.K);
      gl.uniform1f(this.uDULoc,        p.DU);
      gl.uniform1f(this.uDVLoc,        p.DV);
      gl.uniform1f(this.uNoiseKAmpLoc, p.noiseKAmp);
      this.paramsDirty = false;
    }

    for (let s = 0; s < SUBSTEPS; s++) {
      this.frame++;
      const src = this.ping;
      const dst = 1 - src;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[src]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[dst]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.ping = dst;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);

    // Move spots and claim enemy territory (CPU → GPU write per spot in enemy zone)
    this.updateSpots(delta);
    this.updateTentacleAnimations(delta);
    this.updateTentacles();
  }

  render(ctx: CanvasRenderingContext2D, _w: number, _h: number) {
    const { gl, dProg, tex, vao } = this;
    gl.useProgram(dProg);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[this.ping]);
    gl.viewport(0, 0, this.gsW, this.gsH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // 1:1 pixel blit — no stretching
    ctx.drawImage(this.glCanvas, 0, 0);

    if (this.showHGrid) this.drawHGrid(ctx);
  }

  // Draw H-value labels at a regular grid so colony boundaries are visible.
  // readPixels is rate-limited to once every ~120 frames to avoid GPU stalls.
  private drawHGrid(ctx: CanvasRenderingContext2D) {
    const { gl } = this;
    const w = this.gsW, h = this.gsH;

    // Refresh pixel data at most once every 120 frames (~2 s at 60 fps)
    if (!this.hGridPixels || this.frame - this.hGridTimer > 120) {
      if (!this.hGridPixels) this.hGridPixels = new Float32Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.ping]);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, this.hGridPixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.hGridTimer = this.frame;
    }

    const px = this.hGridPixels;
    const GRID = 80;

    ctx.save();
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3;

    for (let y2d = GRID / 2; y2d < h; y2d += GRID) {
      for (let x2d = GRID / 2; x2d < w; x2d += GRID) {
        // WebGL texture Y=0 is at the BOTTOM; canvas 2D Y=0 is at the TOP → flip
        const texRow = h - 1 - Math.round(y2d);
        const texCol = Math.round(x2d);
        const hVal = px[(texRow * w + texCol) * 4 + 2]; // B channel = H

        if (hVal > 0.005) {
          ctx.fillStyle = `hsl(${(hVal * 360).toFixed(0)}, 90%, 70%)`;
          ctx.fillText(hVal.toFixed(2), x2d, y2d);
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillText("·", x2d, y2d);
        }
      }
    }

    ctx.restore();

    // Draw tentacles (thick bezier curves, one per tentacle)
    for (const sp of this.spots) {
      const hsl = `hsl(${(sp.hue * 360).toFixed(0)}, 100%, 60%)`;
      ctx.save();
      ctx.strokeStyle = hsl;
      ctx.lineWidth   = TENT_R * 2;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.globalAlpha = 0.35;
      for (const ten of sp.tentacles) {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.bezierCurveTo(
          sp.x + ten.cp1x, sp.y + ten.cp1y,
          sp.x + ten.cp2x, sp.y + ten.cp2y,
          sp.x + Math.cos(ten.endAngle) * TENT_LEN, sp.y + Math.sin(ten.endAngle) * TENT_LEN,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw spots: outline circle + centre dot + direction arrow
    for (const sp of this.spots) {
      const hsl = `hsl(${(sp.hue * 360).toFixed(0)}, 100%, 60%)`;
      ctx.save();
      ctx.strokeStyle = hsl;
      ctx.fillStyle   = hsl;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.85;

      // Boundary circle
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, SPOT_R, 0, Math.PI * 2);
      ctx.stroke();

      // Centre dot
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // Direction arrow
      const ax = sp.x + Math.cos(sp.angle) * SPOT_R;
      const ay = sp.y + Math.sin(sp.angle) * SPOT_R;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(ax, ay);
      ctx.stroke();

      ctx.restore();
    }
  }

  getParams(): Record<string, number> {
    return { ...this.params };
  }

  setParam(key: string, value: number): void {
    if (key in this.params) {
      (this.params as Record<string, number>)[key] = value;
      this.paramsDirty = true;
    }
  }

  // Left-click: spawn a new colony. Right-click: randomise RD parameters.
  onPointerDown(x: number, y: number, button: number) {
    if (button === 0) {
      this.spawnPatch(x, y);
    } else if (button === 2) {
      const rnd  = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
      const snap = (v: number, step: number) => +(Math.round(v / step) * step).toFixed(4);
      // Pick 2 of the four params at random (without repeat) and change only those.
      // K is never touched.
      const candidates = ["F", "DU", "DV", "noiseKAmp"];
      const i = Math.floor(Math.random() * 4);
      let j = Math.floor(Math.random() * 3); if (j >= i) j++;
      const p = this.params as Record<string, number>;
      const setVal = (key: string) => {
        if      (key === "F")         p["F"]         = snap(rnd(0.034, 0.057), 0.001);
        else if (key === "DU")        p["DU"]        = snap(rnd(0.18,  0.22),  0.005);
        else if (key === "DV")        p["DV"]        = snap(rnd(0.09,  0.12),  0.005);
        else                          p["noiseKAmp"] = snap(rnd(0.004, 0.014), 0.001);
      };
      setVal(candidates[i]);
      setVal(candidates[j]);
      this.paramsDirty = true;
    }
  }

  resize(w: number, h: number) {
    const { gl } = this;
    const oldW = this.gsW, oldH = this.gsH;

    // Read current state (U, V, H) back from GPU
    const oldData = new Float32Array(oldW * oldH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.ping]);
    gl.readPixels(0, 0, oldW, oldH, gl.RGBA, gl.FLOAT, oldData);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.gsW = w;
    this.gsH = h;
    this.glCanvas.width  = w;
    this.glCanvas.height = h;

    // New data: equilibrium U=1, A=0 in expanded areas
    const newData = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) newData[i * 4] = 1.0;

    // Copy overlapping region top-left aligned (preserves U, V, H, A)
    const cpW = Math.min(oldW, w);
    const cpH = Math.min(oldH, h);
    for (let y = 0; y < cpH; y++) {
      for (let x = 0; x < cpW; x++) {
        const src = (y * oldW + x) * 4;
        const dst = (y * w + x) * 4;
        newData[dst]     = oldData[src];     // U
        newData[dst + 1] = oldData[src + 1]; // V
        newData[dst + 2] = oldData[src + 2]; // H
        newData[dst + 3] = oldData[src + 3]; // A (aniso angle)
      }
    }

    this.tex.forEach(t => gl.deleteTexture(t));
    this.fbo.forEach(f => gl.deleteFramebuffer(f));
    const t0 = mkTex(gl, w, h, newData);
    const t1 = mkTex(gl, w, h);
    this.tex = [t0, t1];
    this.fbo = [mkFBO(gl, t0), mkFBO(gl, t1)];
    this.ping = 0;

    gl.useProgram(this.cProg);
    gl.uniform2f(gl.getUniformLocation(this.cProg, "u_res"), w, h);
    gl.useProgram(null);

    // Clamp spot positions to stay within the new canvas bounds
    for (const sp of this.spots) {
      sp.x = Math.max(SPOT_R, Math.min(w - SPOT_R, sp.x));
      sp.y = Math.max(SPOT_R, Math.min(h - SPOT_R, sp.y));
    }
  }

  destroy() {
    const { gl, tex, fbo } = this;
    tex.forEach(t => gl.deleteTexture(t));
    fbo.forEach(f => gl.deleteFramebuffer(f));
    gl.deleteProgram(this.cProg);
    gl.deleteProgram(this.dProg);
    gl.deleteVertexArray(this.vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
