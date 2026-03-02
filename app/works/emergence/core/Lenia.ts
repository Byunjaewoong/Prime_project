// app/works/emergence/core/Lenia.ts
import { Simulation } from "./types";

const MAX_K   = 128;  // outer kernel max samples
const MAX_K_I =  64;  // inner kernel max samples (expanded mode)

// ─── Per-instance randomised parameters ──────────────────────────────────────
interface LeniaParams {
  R:         number;  // outer kernel radius    (12–15)
  SIGMA_K:   number;  // outer kernel width     (0.08–0.13)
  MU:        number;  // growth center [standard] (0.13–0.17)
  SIGMA_G:   number;  // growth width  [standard] (0.05–0.08)
  DT:        number;  // time step               (0.08–0.12)
  // Expanded mode
  R_I:       number;  // inner kernel radius    (4–8)
  SIGMA_K_I: number;  // inner kernel width     (0.10–0.22)
  UO_LO1:   number;  // Uo lower bound when Ui ≥ UI_THR
  UO_HI1:   number;  // Uo upper bound when Ui ≥ UI_THR
  UO_LO2:   number;  // Uo lower bound when Ui < UI_THR
  UO_HI2:   number;  // Uo upper bound when Ui < UI_THR
  UI_THR:   number;  // Ui split threshold      (~0.5)
}

function randParams(): LeniaParams {
  const MU = 0.13 + Math.random() * 0.04;
  const R  = 12 + Math.floor(Math.random() * 4);
  const ctr1 = 0.28 + Math.random() * 0.12; const w1 = 0.12 + Math.random() * 0.14;
  const ctr2 = 0.27 + Math.random() * 0.10; const w2 = 0.06 + Math.random() * 0.10;
  return {
    R, MU,
    SIGMA_K:   0.08 + Math.random() * 0.05,
    SIGMA_G:   0.05 + Math.random() * 0.03,
    DT:        0.08 + Math.random() * 0.04,
    R_I:       Math.max(3, Math.floor(R / 2) + Math.floor(Math.random() * 3) - 1),
    SIGMA_K_I: 0.10 + Math.random() * 0.12,
    UO_LO1: Math.max(0.05, ctr1 - w1 / 2),
    UO_HI1: Math.min(0.90, ctr1 + w1 / 2),
    UO_LO2: Math.max(0.05, ctr2 - w2 / 2),
    UO_HI2: Math.min(0.90, ctr2 + w2 / 2),
    UI_THR: 0.40 + Math.random() * 0.20,
  };
}

// ─── Kernel builder (shared for outer & inner) ────────────────────────────────
function buildRingKernel(R: number, sigmaK: number, maxK: number) {
  const HALF = Math.ceil(R * 1.6);
  const dx: number[] = [], dy: number[] = [], w: number[] = [];
  let wSum = 0;
  for (let j = -HALF; j <= HALF; j++) {
    for (let i = -HALF; i <= HALF; i++) {
      const r = Math.sqrt(i * i + j * j);
      if (r < 0.5) continue;
      const d   = r / R - 1.0;
      const raw = Math.exp(-(d * d) / (2 * sigmaK * sigmaK));
      if (raw > 0.8) { dx.push(i); dy.push(j); w.push(raw); wSum += raw; }
    }
  }
  const K   = Math.min(dx.length, maxK);
  const fw  = new Float32Array(maxK);
  const fdx = new Float32Array(maxK);
  const fdy = new Float32Array(maxK);
  for (let i = 0; i < K; i++) { fw[i] = w[i] / wSum; fdx[i] = dx[i]; fdy[i] = dy[i]; }
  return { K, fw, fdx, fdy };
}

// ─── Shader sources ───────────────────────────────────────────────────────────
const SAMPLE_W = 64, SAMPLE_H = 64;  // census downsampled resolution

const VERT = /* glsl */`#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// Simple passthrough — hardware bilinear downsampling does the work
const SAMPLE_FRAG = /* glsl */`#version 300 es
precision mediump float;
uniform sampler2D u_state;
in  vec2 v_uv;
out vec4 o;
void main(){ o = texture(u_state, v_uv); }`;

function makeComputeFrag(p: LeniaParams, mode: "standard" | "expanded"): string {
  if (mode === "standard") {
    const sig2 = 2 * p.SIGMA_G * p.SIGMA_G;
    return /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float u_kw[${MAX_K}];
uniform float u_kdx[${MAX_K}];
uniform float u_kdy[${MAX_K}];
uniform vec2  u_res;
in  vec2 v_uv;
out vec4 o;
void main(){
  vec2  px = 1.0 / u_res;
  float u  = 0.0;
  for(int i = 0; i < ${MAX_K}; i++){
    vec2 uv = fract(v_uv + vec2(u_kdx[i], u_kdy[i]) * px);
    u += texture(u_state, uv).r * u_kw[i];
  }
  float c = texture(u_state, v_uv).r;
  float d = u - ${p.MU};
  float g = 2.0 * exp(-(d * d) / ${sig2}) - 1.0;
  o = vec4(clamp(c + ${p.DT} * g, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;
  } else {
    // Expanded: outer + inner kernels → 2D box growth function G(Uo, Ui)
    return /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float u_kw[${MAX_K}];
uniform float u_kdx[${MAX_K}];
uniform float u_kdy[${MAX_K}];
uniform float u_kw_i[${MAX_K_I}];
uniform float u_kdx_i[${MAX_K_I}];
uniform float u_kdy_i[${MAX_K_I}];
uniform vec2  u_res;
in  vec2 v_uv;
out vec4 o;
void main(){
  vec2  px = 1.0 / u_res;
  float uo = 0.0;
  for(int i = 0; i < ${MAX_K}; i++){
    vec2 uv = fract(v_uv + vec2(u_kdx[i], u_kdy[i]) * px);
    uo += texture(u_state, uv).r * u_kw[i];
  }
  float ui = 0.0;
  for(int i = 0; i < ${MAX_K_I}; i++){
    vec2 uv = fract(v_uv + vec2(u_kdx_i[i], u_kdy_i[i]) * px);
    ui += texture(u_state, uv).r * u_kw_i[i];
  }
  float c = texture(u_state, v_uv).r;
  float alive;
  if(ui >= ${p.UI_THR}){
    alive = (uo >= ${p.UO_LO1} && uo <= ${p.UO_HI1}) ? 1.0 : 0.0;
  } else {
    alive = (uo >= ${p.UO_LO2} && uo <= ${p.UO_HI2}) ? 1.0 : 0.0;
  }
  float g = 2.0 * alive - 1.0;
  o = vec4(clamp(c + ${p.DT} * g, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;
  }
}

// Colormap: hue-shift + hue-scale are uniforms → smooth random colour transitions
const COLOR_FRAG = /* glsl */`#version 300 es
precision mediump float;
uniform sampler2D u_state;
uniform float     u_hue_shift;
uniform float     u_hue_scale;
in  vec2 v_uv;
out vec4 o;

vec3 ramp(float t, float hueRot){
  vec3 c0 = vec3(0.0);
  vec3 c1 = vec3(0.85, 0.25, 0.05);
  vec3 c2 = vec3(0.05, 0.45, 0.55);
  vec3 c3 = vec3(0.15, 0.65, 0.85);
  vec3 c4 = vec3(1.0,  0.92, 0.80);

  float hr = hueRot * 6.2832;
  float cs = cos(hr), sn = sin(hr);
  mat3 rot = mat3(
    0.333+0.667*cs+0.167*sn, 0.333-0.333*cs-0.5*sn,   0.333-0.333*cs+0.833*sn,
    0.333-0.333*cs+0.167*sn, 0.333+0.667*cs+0.5*sn,    0.333-0.333*cs-0.167*sn,
    0.333-0.333*cs-0.833*sn, 0.333-0.333*cs+0.5*sn,    0.333+0.667*cs-0.167*sn
  );

  vec3 c;
  if      (t < 0.12) c = mix(c0, c1, t / 0.12);
  else if (t < 0.30) c = mix(c1, c2, (t - 0.12) / 0.18);
  else if (t < 0.55) c = mix(c2, c3, (t - 0.30) / 0.25);
  else               c = mix(c3, c4, (t - 0.55) / 0.45);

  return rot * c;
}

void main(){
  float v = texture(u_state, v_uv).r;
  float t = smoothstep(0.0, 0.05, v) * clamp(v * 1.4, 0.0, 1.0);
  vec3  c = ramp(t, u_hue_shift);
  o = vec4(c, 1.0);
}`;

// ─── WebGL helpers ────────────────────────────────────────────────────────────
function mkProg(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("Lenia shader: " + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error("Lenia link: " + gl.getProgramInfoLog(p));
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
export class Lenia implements Simulation {
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
  private p:        LeniaParams;
  private mode:     "standard" | "expanded" = "expanded";

  // ── Census (alive %) ──────────────────────────────────────────────────────
  private sampleProg: WebGLProgram;
  private sampleFBO:  WebGLFramebuffer;
  private sampleTex:  WebGLTexture;
  private sampleBuf = new Float32Array(SAMPLE_W * SAMPLE_H * 4);
  private alivePct  = 0;
  private computeSteps = 0;

  // ── Delta system: periodic randomise + rescue spawns ─────────────────────
  private deltaActive = true;
  private deltaLastAction = 0;      // timestamp of last delta action
  private deltaRecovery = false;    // true = in 0.5s rescue check loop

  // ── Colour interpolation state ────────────────────────────────────────────
  private stepAcc = 0;
  private hueShiftCur = 0.0;
  private hueShiftSrc = 0.0;
  private hueShiftTgt = 0.0;
  private hueScaleCur = 5.0 / 6.0;
  private hueScaleSrc = 5.0 / 6.0;
  private hueScaleTgt = 5.0 / 6.0;
  private colorT   = 1.0;
  private colorDur = 1.5;

  private uHueShiftLoc: WebGLUniformLocation | null = null;
  private uHueScaleLoc: WebGLUniformLocation | null = null;

  constructor(w: number, h: number) {
    this.gsW = w;
    this.gsH = h;
    this.p = randParams();

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
    this.glCanvas = canvas;
    this.gl = gl;

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) throw new Error("EXT_color_buffer_float not supported");

    this.cProg = mkProg(gl, VERT, makeComputeFrag(this.p, this.mode));
    this.dProg = mkProg(gl, VERT, COLOR_FRAG);

    const t0 = mkTex(gl, w, h, this.makeSeed());
    const t1 = mkTex(gl, w, h);
    this.tex = [t0, t1];
    this.fbo = [mkFBO(gl, t0), mkFBO(gl, t1)];

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;

    const outer = buildRingKernel(this.p.R, this.p.SIGMA_K, MAX_K);
    gl.useProgram(this.cProg);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kw"),  outer.fw);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdx"), outer.fdx);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdy"), outer.fdy);
    if (this.mode === "expanded") {
      const inner = buildRingKernel(this.p.R_I, this.p.SIGMA_K_I, MAX_K_I);
      gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kw_i"),  inner.fw);
      gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdx_i"), inner.fdx);
      gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdy_i"), inner.fdy);
    }
    gl.uniform2f (gl.getUniformLocation(this.cProg, "u_res"), w, h);
    gl.uniform1i (gl.getUniformLocation(this.cProg, "u_state"), 0);

    gl.useProgram(this.dProg);
    gl.uniform1i(gl.getUniformLocation(this.dProg, "u_state"), 0);
    this.uHueShiftLoc = gl.getUniformLocation(this.dProg, "u_hue_shift");
    this.uHueScaleLoc = gl.getUniformLocation(this.dProg, "u_hue_scale");
    gl.uniform1f(this.uHueShiftLoc, this.hueShiftCur);
    gl.uniform1f(this.uHueScaleLoc, this.hueScaleCur);

    // ── Census FBO (64×64 downsampled state for alive-% readback) ──────────
    this.sampleProg = mkProg(gl, VERT, SAMPLE_FRAG);
    this.sampleTex  = mkTex(gl, SAMPLE_W, SAMPLE_H);
    this.sampleFBO  = mkFBO(gl, this.sampleTex);
    gl.useProgram(this.sampleProg);
    gl.uniform1i(gl.getUniformLocation(this.sampleProg, "u_state"), 0);
    gl.useProgram(null);
  }

  private makeSeed(): Float32Array {
    const { gsW, gsH } = this;
    const freq = Math.PI / this.p.R;
    const phaseX = Math.random() * Math.PI * 2;
    const phaseY = Math.random() * Math.PI * 2;

    // Mode-aware seed amplitude: center of the growth alive zone
    let ctr: number;
    if (this.mode === "standard") {
      ctr = this.p.MU;
    } else {
      const lo = Math.min(this.p.UO_LO1, this.p.UO_LO2);
      const hi = Math.max(this.p.UO_HI1, this.p.UO_HI2);
      ctr = (lo + hi) / 2;
    }
    const amp = ctr * 2.0;

    const data = new Float32Array(gsW * gsH * 4);
    const cx = gsW / 2, cy = gsH / 2, R2 = 300 * 300;
    for (let y = 0; y < gsH; y++) {
      for (let x = 0; x < gsW; x++) {
        const p = (y * gsW + x) * 4;
        data[p + 3] = 1;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > R2) continue;
        const wave = (Math.sin(freq * x + phaseX) * Math.cos(freq * y + phaseY) + 1) * 0.5;
        data[p] = Math.max(0, Math.min(1, wave * amp + (Math.random() - 0.5) * 0.04));
      }
    }
    return data;
  }

  update(delta: number) {
    const { gl, cProg, tex, fbo, vao } = this;

    this.stepAcc += delta;
    if (this.stepAcc >= 1 / 40) {
      this.stepAcc -= 1 / 40;
      const src = this.ping, dst = 1 - src;
      gl.useProgram(cProg);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[src]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[dst]);
      gl.viewport(0, 0, this.gsW, this.gsH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.ping = dst;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);

      // ── Census: every 20 compute steps, downsample → readPixels → count ──
      this.computeSteps++;
      if (this.computeSteps % 20 === 0) {
        gl.useProgram(this.sampleProg);
        gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex[this.ping]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sampleFBO);
        gl.viewport(0, 0, SAMPLE_W, SAMPLE_H);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.readPixels(0, 0, SAMPLE_W, SAMPLE_H, gl.RGBA, gl.FLOAT, this.sampleBuf);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
        let alive = 0;
        for (let i = 0; i < SAMPLE_W * SAMPLE_H; i++) {
          if (this.sampleBuf[i * 4] > 0.05) alive++;
        }
        this.alivePct = (alive / (SAMPLE_W * SAMPLE_H)) * 100;

        // ── Delta feedback: adjust params to keep alive% in target range ──
        if (this.deltaActive) this.runDeltaStep();
      }
    }

    if (this.colorT < 1) {
      this.colorT = Math.min(1, this.colorT + delta / this.colorDur);
      const s = this.colorT * this.colorT * (3 - 2 * this.colorT);
      let diff = this.hueShiftTgt - this.hueShiftSrc;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      this.hueShiftCur = ((this.hueShiftSrc + diff * s) % 1 + 1) % 1;
      this.hueScaleCur = this.hueScaleSrc + (this.hueScaleTgt - this.hueScaleSrc) * s;
    }
  }

  render(ctx: CanvasRenderingContext2D, _w: number, _h: number) {
    const { gl, dProg, tex, vao } = this;

    gl.useProgram(dProg);
    if (this.uHueShiftLoc) gl.uniform1f(this.uHueShiftLoc, this.hueShiftCur);
    if (this.uHueScaleLoc) gl.uniform1f(this.uHueScaleLoc, this.hueScaleCur);

    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex[this.ping]);
    gl.viewport(0, 0, this.gsW, this.gsH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
    ctx.drawImage(this.glCanvas, 0, 0);
  }

  // ── Left-click / drag: spawn a 100px alive circle ──
  // Uses mode-aware center value + smooth radial falloff so convolution
  // result lands inside the growth function's alive zone.
  private spawnCircle(cx: number, cy: number, radius = 100) {
    const { gl } = this;
    const R = radius;
    const w = this.gsW, h = this.gsH;
    const texCX = Math.round(cx);
    const texCY = h - 1 - Math.round(cy);
    const x0 = Math.max(0, texCX - R);
    const y0 = Math.max(0, texCY - R);
    const x1 = Math.min(w - 1, texCX + R);
    const y1 = Math.min(h - 1, texCY + R);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const buf = new Float32Array(bw * bh * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.ping]);
    gl.readPixels(x0, y0, bw, bh, gl.RGBA, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Target value: center of the growth function's alive zone
    let ctr: number;
    if (this.mode === "standard") {
      ctr = this.p.MU;  // Gaussian growth center
    } else {
      // Expanded: midpoint of the Uo alive range (use the wider band)
      const lo = Math.min(this.p.UO_LO1, this.p.UO_LO2);
      const hi = Math.max(this.p.UO_HI1, this.p.UO_HI2);
      ctr = (lo + hi) / 2;
    }

    const R2 = R * R;
    const fadeStart = R * 0.6;  // smooth falloff starts at 60% radius
    for (let row = 0; row < bh; row++) {
      for (let col = 0; col < bw; col++) {
        const dx = (x0 + col) - texCX;
        const dy = (y0 + row) - texCY;
        const d2 = dx * dx + dy * dy;
        if (d2 <= R2) {
          const i = (row * bw + col) * 4;
          const dist = Math.sqrt(d2);
          // Smooth radial falloff: 1.0 at center → 0.0 at edge
          const fade = dist < fadeStart ? 1.0
            : 1.0 - (dist - fadeStart) / (R - fadeStart);
          const noise = (Math.random() - 0.5) * 0.06;
          buf[i]     = Math.max(0, Math.min(1, (ctr + noise) * fade));
          buf[i + 3] = 1.0;
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.ping]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, bw, bh, gl.RGBA, gl.FLOAT, buf);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  onPointerMove(x: number, y: number, buttons: number) {
    if (buttons & 1) this.spawnCircle(x, y);
  }

  // ── Rebuild compute shader from current this.p + this.mode ───────────────
  private rebuildCompute() {
    const { gl } = this;
    const outer = buildRingKernel(this.p.R, this.p.SIGMA_K, MAX_K);
    gl.deleteProgram(this.cProg);
    this.cProg = mkProg(gl, VERT, makeComputeFrag(this.p, this.mode));
    gl.useProgram(this.cProg);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kw"),  outer.fw);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdx"), outer.fdx);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdy"), outer.fdy);
    if (this.mode === "expanded") {
      const inner = buildRingKernel(this.p.R_I, this.p.SIGMA_K_I, MAX_K_I);
      gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kw_i"),  inner.fw);
      gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdx_i"), inner.fdx);
      gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdy_i"), inner.fdy);
    }
    gl.uniform2f(gl.getUniformLocation(this.cProg, "u_res"), this.gsW, this.gsH);
    gl.uniform1i(gl.getUniformLocation(this.cProg, "u_state"), 0);
    gl.useProgram(null);
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────
  toggleMode() {
    this.mode = this.mode === "standard" ? "expanded" : "standard";
    this.rebuildCompute();
  }

  // ── Expose params for HUD ─────────────────────────────────────────────────
  getParams(): Record<string, number> {
    const base = { _mode: this.mode === "expanded" ? 1 : 0, _alivePct: this.alivePct, _deltaActive: this.deltaActive ? 1 : 0, R: this.p.R, SIGMA_K: this.p.SIGMA_K, DT: this.p.DT };
    if (this.mode === "standard") {
      return { ...base, MU: this.p.MU, SIGMA_G: this.p.SIGMA_G };
    } else {
      return { ...base,
        R_I: this.p.R_I, SIGMA_K_I: this.p.SIGMA_K_I,
        UO_LO1: this.p.UO_LO1, UO_HI1: this.p.UO_HI1,
        UO_LO2: this.p.UO_LO2, UO_HI2: this.p.UO_HI2,
        UI_THR: this.p.UI_THR,
      };
    }
  }

  setParam(key: string, value: number) {
    if (key === "R" || key === "R_I") value = Math.round(value);
    (this.p as unknown as Record<string, number>)[key] = value;
    this.rebuildCompute();
  }

  // ── Delta system ────────────────────────────────────────────────────────
  toggleDelta() {
    this.deltaActive = !this.deltaActive;
    if (this.deltaActive) {
      this.deltaLastAction = performance.now() / 1000;
      this.deltaRecovery = false;
    }
  }

  /** Randomise params + start colour transition (same as right-click) */
  randomiseParams() {
    this.p = randParams();
    this.rebuildCompute();
    this.hueShiftSrc = this.hueShiftCur;
    this.hueScaleSrc = this.hueScaleCur;
    this.hueShiftTgt = Math.random();
    this.hueScaleTgt = 0.3 + Math.random() * 0.7;
    this.colorT = 0;
  }

  /** Spawn N circles at random positions with random size (1×–3× base) */
  private deltaSpawnRescue() {
    const count = 5 + Math.floor(Math.random() * 3); // 5–7
    for (let i = 0; i < count; i++) {
      const rx = Math.random() * this.gsW;
      const ry = Math.random() * this.gsH;
      const r = Math.round(100 * (1 + Math.random() * 2)); // 100–300 px
      this.spawnCircle(rx, ry, r);
    }
  }

  private runDeltaStep() {
    const now = performance.now() / 1000;
    const elapsed = now - this.deltaLastAction;

    if (this.deltaRecovery) {
      // Recovery mode: check every 0.5s
      if (elapsed < 0.5) return;
      this.deltaLastAction = now;
      if (this.alivePct <= 5) {
        // Still dying → re-randomise + spawn again
        this.randomiseParams();
        this.deltaSpawnRescue();
        return;  // stay in recovery, check again in 0.5s
      }
      // Alive > 5% → recovered, back to normal 3s cycle
      this.deltaRecovery = false;
      return;
    }

    // Normal mode: act every 3s
    if (elapsed < 3) return;
    this.deltaLastAction = now;

    // Randomise parameters
    this.randomiseParams();

    // Check if rescue needed
    if (this.alivePct <= 5) {
      this.deltaSpawnRescue();
      this.deltaRecovery = true;  // enter 0.5s rescue loop
    }
  }

  // ── Right-click: randomise parameters + start colour transition (no reset) ──
  onPointerDown(x: number, y: number, button: number) {
    if (button === 0) { this.spawnCircle(x, y); return; }
    if (button !== 2) return;
    this.randomiseParams();
  }

  resize(w: number, h: number) {
    const { gl } = this;
    const oldW = this.gsW, oldH = this.gsH;

    const oldData = new Float32Array(oldW * oldH * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.ping]);
    gl.readPixels(0, 0, oldW, oldH, gl.RGBA, gl.FLOAT, oldData);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.gsW = w;
    this.gsH = h;
    this.glCanvas.width  = w;
    this.glCanvas.height = h;

    const newData = new Float32Array(w * h * 4);
    const cpW = Math.min(oldW, w);
    const cpH = Math.min(oldH, h);
    for (let y = 0; y < cpH; y++) {
      for (let x = 0; x < cpW; x++) {
        const src = (y * oldW + x) * 4;
        const dst = (y * w + x) * 4;
        newData[dst]     = oldData[src];
        newData[dst + 3] = 1.0;
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
    gl.deleteTexture(this.sampleTex);
    gl.deleteFramebuffer(this.sampleFBO);
    gl.deleteProgram(this.cProg);
    gl.deleteProgram(this.dProg);
    gl.deleteProgram(this.sampleProg);
    gl.deleteVertexArray(this.vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
