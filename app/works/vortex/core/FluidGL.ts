// app/works/vortex/core/FluidGL.ts
// WebGL2 GPU-based Stable Fluids simulation

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
  float div = 0.5 * (R - L + T - B);
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
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
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
void main(){
  vec3 c = texture(uTexture, vUv).rgb;
  // boost saturation: shift away from gray
  float gray = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(gray), c, 1.6);
  // brightness boost + gentle tone curve
  c *= 1.3;
  c = pow(clamp(c, 0.0, 1.0), vec3(0.75));
  fragColor = vec4(c, 1.0);
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
  private divergenceProg!: Program;
  private pressureProg!: Program;
  private gradSubProg!: Program;
  private curlProg!: Program;
  private vorticityProg!: Program;
  private displayProg!: Program;
  private clearProg!: Program;

  // simulation resolution
  private simW = 0;
  private simH = 0;
  private dyeW = 0;
  private dyeH = 0;

  // params
  simResolution = 512;
  dyeResolution = 512;
  pressureIterations = 20;
  curl = 12.0;
  densityDissipation = 0.985;
  velocityDissipation = 0.99;

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
    this.divergenceProg = this.createProgram(baseVert, divergenceFrag);
    this.pressureProg = this.createProgram(baseVert, pressureFrag);
    this.gradSubProg = this.createProgram(baseVert, gradSubFrag);
    this.curlProg = this.createProgram(baseVert, curlFrag);
    this.vorticityProg = this.createProgram(baseVert, vorticityFrag);
    this.displayProg = this.createProgram(baseVert, displayFrag);
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

    this.velocity = this.createDoubleFBO(simW, simH, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);
    this.pressure = this.createDoubleFBO(simW, simH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.divergenceFBO = this.createFBO(simW, simH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.curlFBO = this.createFBO(simW, simH, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.dye = this.createDoubleFBO(dyeW, dyeH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  }

  step(dt: number): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);

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
    gl.uniform1f(this.vorticityProg.uniforms.dt, 0.1); // fixed dt like CPU
    this.blit(this.velocity.write);
    this.velocity.swap();

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
    gl.uniform1f(this.clearProg.uniforms.value, 0.0); // CPU resets pressure to 0 each step
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
    gl.uniform1f(this.advectionProg.uniforms.dt, 0.1); // fixed dt like CPU
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
    gl.uniform1f(this.splatProg.uniforms.radius, 0.001); // larger to match CPU radius=4 cells
    this.blit(this.velocity.write);
    this.velocity.swap();

    // dye splat
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform3f(this.splatProg.uniforms.color, color[0], color[1], color[2]);
    gl.uniform1f(this.splatProg.uniforms.radius, 0.002);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  render(): void {
    const gl = this.gl;
    this.useProg(this.displayProg);
    gl.uniform2f(this.displayProg.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(this.displayProg.uniforms.uTexture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    this.blit(null);
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
