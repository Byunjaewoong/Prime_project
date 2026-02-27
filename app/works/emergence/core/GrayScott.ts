// app/works/emergence/core/GrayScott.ts
import { Simulation } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────
const SUBSTEPS = 16;

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

// Low-cost spatial+temporal hash for stochastic extinction
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

  // ── Hue + anisotropy propagation ───────────────────────────────────────────
  float newH;
  float newA;
  if (H > 0.005) {
    newH = H; newA = A;
  } else if (newV > 0.02) {
    // Inherit hue AND anisotropy angle from the highest-V neighbour
    float mV = max(max(lft.g, rgt.g), max(up.g, dn.g));
    if      (lft.g >= mV - 0.001) { newH = lft.b; newA = lft.a; }
    else if (rgt.g >= mV - 0.001) { newH = rgt.b; newA = rgt.a; }
    else if (up.g  >= mV - 0.001) { newH = up.b;  newA = up.a;  }
    else                          { newH = dn.b;  newA = dn.a;  }
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

  // Shared hue sequencer — used for both seed patches and user-spawned patches.
  // Starting offset is randomised so each session looks different.
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
  }

  update(delta: number) {
    void delta;
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
