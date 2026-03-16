// app/works/Fluid_sim_gpu/core/FluidGL.ts
// WebGL2 GPU-based Stable Fluids simulation — ported from CPU FluidSim parameters

// ── GLSL Shaders ──────────────────────────────────────────────────────────────

const baseVert = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
uniform vec2 texelSize;
void main(){
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const splatFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main(){
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p,p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`;

const advectionFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main(){
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - dt * vel * texelSize;
  vec3 result = dissipation * texture(uSource, coord).xyz;
  fragColor = vec4(result, 1.0);
}`;

const diffuseFrag = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float alpha;
uniform float rBeta;
void main(){
  vec2 L = texture(uVelocity, vL).xy;
  vec2 R = texture(uVelocity, vR).xy;
  vec2 T = texture(uVelocity, vT).xy;
  vec2 B = texture(uVelocity, vB).xy;
  vec2 center = texture(uSource, vUv).xy;
  vec2 result = (center + alpha * (L + R + T + B)) * rBeta;
  fragColor = vec4(result, 0.0, 1.0);
}`;

const divergenceFrag = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  float div = 0.5 * ((R - L) + (T - B));
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const pressureFrag = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main(){
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - div) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const gradSubFrag = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main(){
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= vec2(R - L, T - B) * 0.5;
  fragColor = vec4(vel, 0.0, 1.0);
}`;

const curlFrag = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

const vorticityFrag = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main(){
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(L) - abs(R));
  float len = length(force) + 1e-5;
  force = force / len * curl * C;
  vec2 vel = texture(uVelocity, vUv).xy + force * dt;
  fragColor = vec4(vel, 0.0, 1.0);
}`;

const displayFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float saturation;
uniform float brightness;
uniform float uTime;

// pseudo-random hash
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  vec3 c = texture(uTexture, vUv).rgb;

  // ── saturation & brightness ──
  float gray = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(gray), c, saturation);
  c *= brightness;

  // ── smoke/fog: subtle haze that lifts blacks ──
  float smoke = 0.012 + 0.008 * sin(vUv.y * 6.0 + uTime * 0.3);
  c += smoke * vec3(0.7, 0.75, 0.8);

  // ── film grain ──
  float grain = hash(vUv * 1000.0 + fract(uTime * 7.13)) - 0.5;
  float coarseGrain = hash(vUv * 200.0 + fract(uTime * 3.71)) - 0.5;
  c += grain * 0.18 + coarseGrain * 0.08;

  // ── vignette ──
  vec2 vig = vUv * (1.0 - vUv);
  float v = pow(vig.x * vig.y * 16.0, 0.3);
  c *= mix(0.45, 1.0, v);

  // ── tone curve (film-like S-curve with lifted blacks) ──
  c = clamp(c, 0.0, 1.0);
  c = c * c * (3.0 - 2.0 * c);              // smoothstep S-curve
  c = mix(c, pow(c, vec3(0.85)), 0.5);      // slight highlight lift
  c = max(c, vec3(0.015, 0.013, 0.018));    // lifted blacks (never pure black)

  fragColor = vec4(c, 1.0);
}`;

const vectorFieldFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform vec2 texelSize;
uniform float gridSize;     // number of vector cells across larger axis (~40)
uniform float maxVel;       // velocity normalization cap

vec3 speedColor(float t) {
  // blue → cyan → green → yellow → red
  t = clamp(t, 0.0, 1.0);
  if (t < 0.25) return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t / 0.25);
  if (t < 0.50) return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.25) / 0.25);
  if (t < 0.75) return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.50) / 0.25);
  return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) / 0.25);
}

void main(){
  // dye background
  vec3 bg = texture(uDye, vUv).rgb;

  // aspect-corrected pixel coord in [0, gridSize] space
  float aspect = texelSize.y / texelSize.x;  // w/h
  float cellsX = gridSize * aspect;
  float cellsY = gridSize;

  vec2 cellCoord = vec2(vUv.x * cellsX, vUv.y * cellsY);
  vec2 cellCenter = floor(cellCoord) + 0.5;

  // sample velocity at cell center
  vec2 sampleUv = vec2(cellCenter.x / cellsX, cellCenter.y / cellsY);
  vec2 vel = texture(uVelocity, sampleUv).xy;
  float speed = length(vel);
  float norm = clamp(speed / maxVel, 0.0, 1.0);

  // vector endpoint: cell center + velocity direction * half cell
  vec2 dir = speed > 0.001 ? vel / speed : vec2(0.0);
  float lineLen = norm * 0.45; // max half-cell length
  vec2 endPt = cellCenter + dir * lineLen;

  // distance from pixel to line segment (cellCenter → endPt)
  vec2 p = cellCoord;
  vec2 a = cellCenter;
  vec2 b = endPt;
  vec2 ab = b - a;
  float segLen = length(ab);

  float alpha = 0.0;

  if (segLen > 0.01 && norm > 0.02) {
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    vec2 closest = a + t * ab;
    float dist = length(p - closest);

    // line thickness (in cell units)
    float thickness = 0.08;
    alpha = smoothstep(thickness, thickness * 0.4, dist);

    // arrowhead at endpoint
    float tipDist = length(p - b);
    vec2 perp = vec2(-dir.y, dir.x);
    float arrowBack = dot(p - b, -dir);
    float arrowSide = abs(dot(p - b, perp));
    if (arrowBack > 0.0 && arrowBack < 0.18 && arrowSide < arrowBack * 0.6) {
      alpha = max(alpha, smoothstep(0.18, 0.08, arrowBack));
    }

    // dot at cell center
    float centerDist = length(p - a);
    alpha = max(alpha, smoothstep(0.12, 0.06, centerDist));
  }

  vec3 vecColor = speedColor(norm);
  vec3 result = mix(bg, vecColor, alpha * 0.85);
  fragColor = vec4(result, 1.0);
}`;

const boundaryFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 texelSize;
void main(){
  vec2 vel = texture(uVelocity, vUv).xy;

  // wall thickness in UV space (1 texel from each edge)
  float bx = texelSize.x;
  float by = texelSize.y;

  // left/right walls: zero out horizontal velocity
  if (vUv.x < bx)          vel.x = max(vel.x, 0.0);  // left wall: no leftward flow
  if (vUv.x > 1.0 - bx)   vel.x = min(vel.x, 0.0);  // right wall: no rightward flow

  // bottom/top walls: zero out vertical velocity
  if (vUv.y < by)          vel.y = max(vel.y, 0.0);  // bottom wall: no downward flow
  if (vUv.y > 1.0 - by)   vel.y = min(vel.y, 0.0);  // top wall: no upward flow

  // corners & edge: full zero within half-texel of border
  float halfX = bx * 0.5;
  float halfY = by * 0.5;
  if (vUv.x < halfX || vUv.x > 1.0 - halfX || vUv.y < halfY || vUv.y > 1.0 - halfY) {
    vel = vec2(0.0);
  }

  fragColor = vec4(vel, 0.0, 1.0);
}`;

const clearFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float value;
void main(){
  fragColor = value * texture(uTexture, vUv);
}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap(): void;
}

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}

// ── FluidGL Class ─────────────────────────────────────────────────────────────

export class FluidGL {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  // simulation textures
  private velocity!: DoubleFBO;
  private pressure!: DoubleFBO;
  private dye!: DoubleFBO;
  private divergenceFBO!: FBO;
  private curlFBO!: FBO;

  // programs
  private splatProg!: Program;
  private advectionProg!: Program;
  private diffuseProg!: Program;
  private divergenceProg!: Program;
  private pressureProg!: Program;
  private gradSubProg!: Program;
  private curlProg!: Program;
  private vorticityProg!: Program;
  private displayProg!: Program;
  private vectorFieldProg!: Program;
  private boundaryProg!: Program;
  private clearProg!: Program;

  // simulation resolution
  private simW = 0;
  private simH = 0;
  private dyeW = 0;
  private dyeH = 0;

  // params (CPU-matched defaults)
  simResolution = 256;
  dyeResolution = 1024;
  pressureIterations = 20;
  diffuseIterations = 4;
  curl = 9.0;
  densityDissipation = 0.996;
  velocityDissipation = 0.995;
  diffusion = 0.00001;
  saturation = 1.3;
  brightness = 0.6;
  showVectors = false;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false })!;
    this.gl = gl;

    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");

    this.initPrograms();
    this.initQuad();
    this.initFBOs();
  }

  private initPrograms(): void {
    this.splatProg = this.createProgram(baseVert, splatFrag);
    this.advectionProg = this.createProgram(baseVert, advectionFrag);
    this.diffuseProg = this.createProgram(baseVert, diffuseFrag);
    this.divergenceProg = this.createProgram(baseVert, divergenceFrag);
    this.pressureProg = this.createProgram(baseVert, pressureFrag);
    this.gradSubProg = this.createProgram(baseVert, gradSubFrag);
    this.curlProg = this.createProgram(baseVert, curlFrag);
    this.vorticityProg = this.createProgram(baseVert, vorticityFrag);
    this.displayProg = this.createProgram(baseVert, displayFrag);
    this.vectorFieldProg = this.createProgram(baseVert, vectorFieldFrag);
    this.boundaryProg = this.createProgram(baseVert, boundaryFrag);
    this.clearProg = this.createProgram(baseVert, clearFrag);
  }

  private initQuad(): void {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
      gl.STATIC_DRAW
    );
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
  }

  initFBOs(): void {
    const gl = this.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const aspect = w / h;

    const simH = this.simResolution;
    const simW = Math.round(simH * aspect);
    this.simW = simW;
    this.simH = simH;

    const dyeH = Math.min(this.dyeResolution, h);
    const dyeW = Math.round(dyeH * aspect);
    this.dyeW = dyeW;
    this.dyeH = dyeH;

    this.velocity = this.createDoubleFBO(simW, simH, gl.RG32F, gl.RG, gl.FLOAT, gl.LINEAR);
    this.pressure = this.createDoubleFBO(simW, simH, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST);
    this.divergenceFBO = this.createFBO(simW, simH, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST);
    this.curlFBO = this.createFBO(simW, simH, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST);
    this.dye = this.createDoubleFBO(dyeW, dyeH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  }

  step(dt: number): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    this.time += dt;

    // curl
    this.useProg(this.curlProg);
    gl.uniform2f(this.curlProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.curlProg.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this.blit(this.curlFBO);

    // vorticity confinement
    this.useProg(this.vorticityProg);
    gl.uniform2f(this.vorticityProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.vorticityProg.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.vorticityProg.uniforms.uCurl, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curlFBO.texture);
    gl.uniform1f(this.vorticityProg.uniforms.curl, this.curl);
    gl.uniform1f(this.vorticityProg.uniforms.dt, 0.1);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // diffuse velocity (Jacobi iteration)
    const a = this.diffusion * this.simW * this.simH;
    if (a > 0) {
      this.useProg(this.diffuseProg);
      gl.uniform2f(this.diffuseProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
      gl.uniform1f(this.diffuseProg.uniforms.alpha, a);
      gl.uniform1f(this.diffuseProg.uniforms.rBeta, 1.0 / (1.0 + 4.0 * a));
      for (let i = 0; i < this.diffuseIterations; i++) {
        gl.uniform1i(this.diffuseProg.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        gl.uniform1i(this.diffuseProg.uniforms.uSource, 1);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
        this.blit(this.velocity.write);
        this.velocity.swap();
      }
    }

    // divergence
    this.useProg(this.divergenceProg);
    gl.uniform2f(this.divergenceProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.divergenceProg.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this.blit(this.divergenceFBO);

    // clear pressure
    this.useProg(this.clearProg);
    gl.uniform2f(this.clearProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.clearProg.uniforms.uTexture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.uniform1f(this.clearProg.uniforms.value, 0.0);
    this.blit(this.pressure.write);
    this.pressure.swap();

    // pressure solve (Jacobi)
    this.useProg(this.pressureProg);
    gl.uniform2f(this.pressureProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.pressureProg.uniforms.uDivergence, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divergenceFBO.texture);
    for (let i = 0; i < this.pressureIterations; i++) {
      gl.uniform1i(this.pressureProg.uniforms.uPressure, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    // gradient subtraction
    this.useProg(this.gradSubProg);
    gl.uniform2f(this.gradSubProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.gradSubProg.uniforms.uPressure, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressure.read.texture);
    gl.uniform1i(this.gradSubProg.uniforms.uVelocity, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // advect velocity
    this.useProg(this.advectionProg);
    gl.uniform2f(this.advectionProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.advectionProg.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.advectionProg.uniforms.uSource, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1f(this.advectionProg.uniforms.dt, 0.1);
    gl.uniform1f(this.advectionProg.uniforms.dissipation, this.velocityDissipation);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // advect dye
    gl.uniform2f(this.advectionProg.uniforms.texelSize, 1 / this.dyeW, 1 / this.dyeH);
    gl.uniform1i(this.advectionProg.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1i(this.advectionProg.uniforms.uSource, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform1f(this.advectionProg.uniforms.dissipation, this.densityDissipation);
    this.blit(this.dye.write);
    this.dye.swap();

    // enforce wall boundaries on velocity
    this.useProg(this.boundaryProg);
    gl.uniform2f(this.boundaryProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.boundaryProg.uniforms.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    this.blit(this.velocity.write);
    this.velocity.swap();
  }

  splat(x: number, y: number, dx: number, dy: number, color: [number, number, number]): void {
    const gl = this.gl;
    const aspect = this.canvas.width / this.canvas.height;

    // velocity splat
    this.useProg(this.splatProg);
    gl.uniform2f(this.splatProg.uniforms.texelSize, 1 / this.simW, 1 / this.simH);
    gl.uniform1i(this.splatProg.uniforms.uTarget, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
    gl.uniform1f(this.splatProg.uniforms.aspectRatio, aspect);
    gl.uniform2f(this.splatProg.uniforms.point, x, y);
    gl.uniform3f(this.splatProg.uniforms.color, dx, dy, 0);
    gl.uniform1f(this.splatProg.uniforms.radius, 0.001);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // dye splat
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform3f(this.splatProg.uniforms.color, color[0], color[1], color[2]);
    gl.uniform1f(this.splatProg.uniforms.radius, 0.0003);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  render(): void {
    const gl = this.gl;

    // display pass (dye + film effects)
    this.useProg(this.displayProg);
    gl.uniform2f(this.displayProg.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(this.displayProg.uniforms.uTexture, 0);
    gl.uniform1f(this.displayProg.uniforms.saturation, this.saturation);
    gl.uniform1f(this.displayProg.uniforms.brightness, this.brightness);
    gl.uniform1f(this.displayProg.uniforms.uTime, this.time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    this.blit(null);

    if (this.showVectors) {
      // overlay vector field with blending
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      this.useProg(this.vectorFieldProg);
      gl.uniform2f(this.vectorFieldProg.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
      gl.uniform1f(this.vectorFieldProg.uniforms.gridSize, 40.0);
      gl.uniform1f(this.vectorFieldProg.uniforms.maxVel, 30.0);
      gl.uniform1i(this.vectorFieldProg.uniforms.uVelocity, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocity.read.texture);
      gl.uniform1i(this.vectorFieldProg.uniforms.uDye, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
      this.blit(null);

      gl.disable(gl.BLEND);
    }
  }

  reset(): void {
    const gl = this.gl;
    const clearColor = (fbo: DoubleFBO) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.read.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.write.fbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };
    clearColor(this.velocity);
    clearColor(this.pressure);
    clearColor(this.dye);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize(): void {
    const gl = this.gl;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.initFBOs();
  }

  destroy(): void {
    // WebGL resources are released when canvas is removed from DOM
  }

  // ── GL Helpers ──────────────────────────────────────────────────────────────

  private createProgram(vertSrc: string, fragSrc: string): Program {
    const gl = this.gl;
    const vs = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPosition");
    gl.linkProgram(prog);

    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(prog, i)!;
      uniforms[info.name] = gl.getUniformLocation(prog, info.name)!;
    }
    return { program: prog, uniforms };
  }

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  private createFBO(
    w: number, h: number,
    internalFormat: number, format: number, type: number,
    filter: number
  ): FBO {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture: tex, fbo, w, h };
  }

  private createDoubleFBO(
    w: number, h: number,
    internalFormat: number, format: number, type: number,
    filter: number
  ): DoubleFBO {
    let read = this.createFBO(w, h, internalFormat, format, type, filter);
    let write = this.createFBO(w, h, internalFormat, format, type, filter);
    return {
      get read() { return read; },
      get write() { return write; },
      swap() { const t = read; read = write; write = t; },
    };
  }

  private useProg(p: Program): void {
    this.gl.useProgram(p.program);
  }

  private blit(target: FBO | null): void {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }
}
