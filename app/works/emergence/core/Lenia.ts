// app/works/emergence/core/Lenia.ts
import { Simulation } from "./types";

const MAX_K  = 128;

// ─── Per-instance randomised parameters ──────────────────────────────────────
interface LeniaParams {
  R:       number;  // kernel radius  (12-15)
  BETA:    number;  // ring position  (fixed 1.0)
  SIGMA_K: number;  // kernel width   (0.08-0.13)
  MU:      number;  // growth center  (0.13-0.17)
  SIGMA_G: number;  // growth width   (0.05-0.08)
  DT:      number;  // time step      (0.08-0.12)
}

function randParams(): LeniaParams {
  const MU = 0.13 + Math.random() * 0.04;   // 0.13-0.17
  return {
    R:       12 + Math.floor(Math.random() * 4),   // 12-15
    BETA:    1.0,
    SIGMA_K: 0.08 + Math.random() * 0.05,          // 0.08-0.13
    MU,
    SIGMA_G: 0.05 + Math.random() * 0.03,          // 0.05-0.08
    DT:      0.08 + Math.random() * 0.04,          // 0.08-0.12
  };
}

// ─── Kernel (per-instance) ────────────────────────────────────────────────────
function buildKernel(p: LeniaParams) {
  const HALF = Math.ceil(p.R * 1.6);
  const dx: number[] = [], dy: number[] = [], w: number[] = [];
  let wSum = 0;
  for (let j = -HALF; j <= HALF; j++) {
    for (let i = -HALF; i <= HALF; i++) {
      const r = Math.sqrt(i * i + j * j);
      if (r < 0.5) continue;
      const d   = r / p.R - p.BETA;
      const raw = Math.exp(-(d * d) / (2 * p.SIGMA_K * p.SIGMA_K));
      if (raw > 0.8) { dx.push(i); dy.push(j); w.push(raw); wSum += raw; }
    }
  }
  const K   = Math.min(dx.length, MAX_K);
  const fw  = new Float32Array(MAX_K);
  const fdx = new Float32Array(MAX_K);
  const fdy = new Float32Array(MAX_K);
  for (let i = 0; i < K; i++) { fw[i] = w[i] / wSum; fdx[i] = dx[i]; fdy[i] = dy[i]; }
  return { K, fw, fdx, fdy };
}

// ─── Shader sources ───────────────────────────────────────────────────────────
const VERT = /* glsl */`#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

function makeComputeFrag(p: LeniaParams): string {
  const sig2 = 2 * p.SIGMA_G * p.SIGMA_G;
  return /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float     u_kw[${MAX_K}];
uniform float     u_kdx[${MAX_K}];
uniform float     u_kdy[${MAX_K}];
uniform vec2      u_res;
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
}

// Colormap: hue-shift + hue-scale are uniforms → smooth random colour transitions
const COLOR_FRAG = /* glsl */`#version 300 es
precision mediump float;
uniform sampler2D u_state;
uniform float     u_hue_shift;  // rotates the entire colour wheel [0,1)
uniform float     u_hue_scale;  // span of hue spectrum used [0.3,1.0]
in  vec2 v_uv;
out vec4 o;

vec3 hsv2rgb(float h){
  float k6 = h * 6.0;
  float r   = clamp(abs(k6 - 3.0) - 1.0, 0.0, 1.0);
  float g   = clamp(2.0 - abs(k6 - 2.0), 0.0, 1.0);
  float b   = clamp(2.0 - abs(k6 - 4.0), 0.0, 1.0);
  return vec3(r, g, b);
}

void main(){
  float v = texture(u_state, v_uv).r;
  vec3  c = hsv2rgb(fract(v * u_hue_scale + u_hue_shift));
  c *= smoothstep(0.0, 0.06, v);
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

  // ── Colour interpolation state ────────────────────────────────────────────
  // hue_shift rotates the hue wheel; hue_scale controls the span used.
  // On left-click, src→tgt are set and colorT counts from 0→1 over colorDur s.
  private hueShiftCur = 0.0;
  private hueShiftSrc = 0.0;
  private hueShiftTgt = 0.0;
  private hueScaleCur = 5.0 / 6.0;  // initial: full ROYGBIV
  private hueScaleSrc = 5.0 / 6.0;
  private hueScaleTgt = 5.0 / 6.0;
  private colorT   = 1.0;   // 1 = at target (no transition in progress)
  private colorDur = 1.5;   // transition duration (seconds)

  // Cached uniform locations for the display program
  private uHueShiftLoc: WebGLUniformLocation | null = null;
  private uHueScaleLoc: WebGLUniformLocation | null = null;

  constructor(w: number, h: number) {
    this.gsW = w;
    this.gsH = h;
    this.p = randParams();
    const kernel = buildKernel(this.p);

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
    this.glCanvas = canvas;
    this.gl = gl;

    const ext = gl.getExtension("EXT_color_buffer_float");
    if (!ext) throw new Error("EXT_color_buffer_float not supported");

    this.cProg = mkProg(gl, VERT, makeComputeFrag(this.p));
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

    gl.useProgram(this.cProg);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kw"),  kernel.fw);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdx"), kernel.fdx);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdy"), kernel.fdy);
    gl.uniform2f (gl.getUniformLocation(this.cProg, "u_res"), w, h);
    gl.uniform1i (gl.getUniformLocation(this.cProg, "u_state"), 0);

    gl.useProgram(this.dProg);
    gl.uniform1i(gl.getUniformLocation(this.dProg, "u_state"), 0);
    // Cache and set initial colour uniforms
    this.uHueShiftLoc = gl.getUniformLocation(this.dProg, "u_hue_shift");
    this.uHueScaleLoc = gl.getUniformLocation(this.dProg, "u_hue_scale");
    gl.uniform1f(this.uHueShiftLoc, this.hueShiftCur);
    gl.uniform1f(this.uHueScaleLoc, this.hueScaleCur);
    gl.useProgram(null);
  }

  private makeSeed(): Float32Array {
    const { gsW, gsH } = this;
    const freq = Math.PI / this.p.R;
    const phaseX = Math.random() * Math.PI * 2;
    const phaseY = Math.random() * Math.PI * 2;
    const amp    = this.p.MU * 2.0;
    const data   = new Float32Array(gsW * gsH * 4);
    for (let y = 0; y < gsH; y++) {
      for (let x = 0; x < gsW; x++) {
        const wave = (Math.sin(freq * x + phaseX) * Math.cos(freq * y + phaseY) + 1) * 0.5;
        const val  = Math.max(0, Math.min(1, wave * amp + (Math.random() - 0.5) * 0.04));
        const p    = (y * gsW + x) * 4;
        data[p] = val; data[p + 3] = 1;
      }
    }
    return data;
  }

  update(delta: number) {
    const { gl, cProg, tex, fbo, vao } = this;
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

    // ── Smooth colour transition ──────────────────────────────────────────────
    if (this.colorT < 1) {
      this.colorT = Math.min(1, this.colorT + delta / this.colorDur);
      // Smoothstep easing
      const s = this.colorT * this.colorT * (3 - 2 * this.colorT);
      // Circular interpolation for hue shift (shortest arc)
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
    // Update colour uniforms (only changes during a transition, but cheap to set)
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

  // ── Right-click: randomise parameters + start colour transition (no reset) ──
  onPointerDown(_x: number, _y: number, button: number) {
    if (button !== 2) return;
    const { gl } = this;

    // New random simulation parameters
    this.p = randParams();
    const kernel = buildKernel(this.p);

    // Rebuild compute shader with new embedded params — GPU state untouched
    gl.deleteProgram(this.cProg);
    this.cProg = mkProg(gl, VERT, makeComputeFrag(this.p));

    gl.useProgram(this.cProg);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kw"),  kernel.fw);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdx"), kernel.fdx);
    gl.uniform1fv(gl.getUniformLocation(this.cProg, "u_kdy"), kernel.fdy);
    gl.uniform2f (gl.getUniformLocation(this.cProg, "u_res"), this.gsW, this.gsH);
    gl.uniform1i (gl.getUniformLocation(this.cProg, "u_state"), 0);
    gl.useProgram(null);

    // Start smooth colour transition to a new random scheme
    this.hueShiftSrc = this.hueShiftCur;
    this.hueScaleSrc = this.hueScaleCur;
    this.hueShiftTgt = Math.random();
    this.hueScaleTgt = 0.3 + Math.random() * 0.7;
    this.colorT = 0;
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
    gl.deleteProgram(this.cProg);
    gl.deleteProgram(this.dProg);
    gl.deleteVertexArray(this.vao);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
