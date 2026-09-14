import type { FluidSolver } from "./FluidSolver";

const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// CPU arrays include one ghost cell on every side. Fetch explicitly so RGBA32F
// input textures do not require float-linear filtering support.
const sampleGrid = `
vec4 gridSample(sampler2D field, vec2 position) {
  vec2 p = position * grid + 0.5;
  ivec2 a = ivec2(floor(p));
  vec2 t = fract(p);
  return mix(mix(texelFetch(field, a, 0), texelFetch(field, a + ivec2(1, 0), 0), t.x),
             mix(texelFetch(field, a + ivec2(0, 1), 0), texelFetch(field, a + ivec2(1, 1), 0), t.x), t.y);
}`;

const transport = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D previousDye;
uniform sampler2D velocity;
uniform sampler2D sources;
uniform sampler2D referenceDye;
uniform vec2 grid;
uniform float dt;
uniform float decay;
uniform float hasSource;
${sampleGrid}
void main() {
  vec2 flow = gridSample(velocity, uv).xy;
  vec2 upstream = clamp(uv - dt * max(grid.x, grid.y) * flow / grid, 0.0, 1.0);
  vec3 dye = texture(previousDye, upstream).rgb;
  dye += dt * hasSource * gridSample(sources, upstream).rgb;
  dye *= decay;
  // Retain the CPU field's broad shape and lifetime while the finer grid reduces
  // repeated interpolation blur. This is a presentation layer, not a new solver.
  dye = mix(dye, gridSample(referenceDye, uv).rgb, 0.25);
  color = vec4(max(dye, 0.0), 1.0);
}`;

const display = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D dye;
uniform float saturation;
uniform float brightness;
void main() {
  // Uploaded CPU rows run from top to bottom; invert only for final display.
  vec3 c = texture(dye, vec2(uv.x, 1.0 - uv.y)).rgb;
  float gray = dot(c, vec3(0.299, 0.587, 0.114));
  c = (vec3(gray) + (c - gray) * saturation) * brightness;
  c = floor(255.0 * pow(clamp(c, 0.0, 1.0), vec3(0.75))) / 255.0;
  color = vec4(c, 1.0);
}`;

interface Target { texture: WebGLTexture; framebuffer: WebGLFramebuffer }
interface Program { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> }

/** GPU dye transport driven and anchored by the original CPU simulation. */
export class DyeRenderer {
  private textures: WebGLTexture[] = [];
  private framebuffers: WebGLFramebuffer[] = [];
  private programs: WebGLProgram[] = [];
  private transport!: Program;
  private display!: Program;
  private velocity!: WebGLTexture;
  private sources!: WebGLTexture;
  private reference!: WebGLTexture;
  private read!: Target;
  private write!: Target;
  private sourceData = new Float32Array(0);
  private velocityData = new Float32Array(0);
  private referenceData = new Float32Array(0);
  private gridW = 0;
  private gridH = 0;
  private hasSource = false;
  private active = true;
  private dyeW = 0;
  private dyeH = 0;
  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.active = false;
    this.canvas.style.display = "none";
  };

  private constructor(private canvas: HTMLCanvasElement, private gl: WebGL2RenderingContext) {}

  static create(canvas: HTMLCanvasElement): DyeRenderer | null {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
    const renderer = new DyeRenderer(canvas, gl);
    try {
      renderer.transport = renderer.program(vertex, transport, ["previousDye", "velocity", "sources", "referenceDye", "grid", "dt", "decay", "hasSource"]);
      renderer.display = renderer.program(vertex, display, ["dye", "saturation", "brightness"]);
      renderer.velocity = renderer.texture(gl.NEAREST);
      renderer.sources = renderer.texture(gl.NEAREST);
      renderer.reference = renderer.texture(gl.NEAREST);
      canvas.addEventListener("webglcontextlost", renderer.onContextLost);
      return renderer;
    } catch {
      renderer.destroy();
      return null;
    }
  }

  get available(): boolean { return this.active && !this.gl.isContextLost(); }
  get resolution() { return { width: this.dyeW, height: this.dyeH }; }

  resize(solver: FluidSolver, width: number, height: number): boolean {
    if (!this.available) return false;
    const gl = this.gl;
    this.canvas.width = width;
    this.canvas.height = height;
    const areaScale = Math.min(1, Math.sqrt((2048 * 1152) / (width * height)));
    const longEdge = Math.max(width, height) > 1920 ? 2048 : 1024;
    const scale = Math.min(1, longEdge / Math.max(width, height), areaScale,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) / Math.max(width, height));
    this.dyeW = Math.max(1, Math.round(width * scale));
    this.dyeH = Math.max(1, Math.round(height * scale));
    this.gridW = solver.W;
    this.gridH = solver.H;
    const length = solver.size * 4;
    this.sourceData = new Float32Array(length);
    this.velocityData = new Float32Array(length);
    this.referenceData = new Float32Array(length);
    for (const texture of [this.velocity, this.sources, this.reference]) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, solver.W + 2, solver.H + 2, 0, gl.RGBA, gl.FLOAT, null);
    }
    this.releaseTargets();
    try {
      this.read = this.target();
      this.write = this.target();
      this.hasSource = false;
      this.canvas.style.display = "block";
      return true;
    } catch {
      this.canvas.style.display = "none";
      this.destroy();
      return false;
    }
  }

  captureSources(solver: FluidSolver): void {
    if (!this.available) return;
    this.hasSource = false;
    for (let i = 0; i < solver.size; i++) {
      const offset = i * 4;
      const r = solver.dR0[i], g = solver.dG0[i], b = solver.dB0[i];
      this.sourceData[offset] = r;
      this.sourceData[offset + 1] = g;
      this.sourceData[offset + 2] = b;
      if (r || g || b) this.hasSource = true;
    }
    if (this.hasSource) this.upload(this.sources, this.sourceData);
  }

  render(solver: FluidSolver, saturation: number, brightness: number): boolean {
    if (!this.available) return false;
    const gl = this.gl;
    // CPU dye advection uses velocity before the final drag multiplication.
    const drag = solver.velocityDecay < 1 ? solver.velocityDecay : 1;
    for (let i = 0; i < solver.size; i++) {
      const offset = i * 4;
      this.velocityData[offset] = drag > 0 ? solver.u[i] / drag : 0;
      this.velocityData[offset + 1] = drag > 0 ? solver.v[i] / drag : 0;
      this.referenceData[offset] = solver.dR[i];
      this.referenceData[offset + 1] = solver.dG[i];
      this.referenceData[offset + 2] = solver.dB[i];
    }
    this.upload(this.velocity, this.velocityData);
    this.upload(this.reference, this.referenceData);
    gl.useProgram(this.transport.program);
    this.bind(this.transport, "previousDye", this.read.texture, 0);
    this.bind(this.transport, "velocity", this.velocity, 1);
    this.bind(this.transport, "sources", this.sources, 2);
    this.bind(this.transport, "referenceDye", this.reference, 3);
    gl.uniform2f(this.transport.uniforms.grid, this.gridW, this.gridH);
    gl.uniform1f(this.transport.uniforms.dt, solver.dt);
    gl.uniform1f(this.transport.uniforms.decay, solver.dyeDecay);
    gl.uniform1f(this.transport.uniforms.hasSource, this.hasSource ? 1 : 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.write.framebuffer);
    gl.viewport(0, 0, this.dyeW, this.dyeH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const previous = this.read;
    this.read = this.write;
    this.write = previous;
    gl.useProgram(this.display.program);
    this.bind(this.display, "dye", this.read.texture, 0);
    gl.uniform1f(this.display.uniforms.saturation, saturation);
    gl.uniform1f(this.display.uniforms.brightness, brightness);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  reset(): void {
    if (!this.available) return;
    const gl = this.gl;
    for (const target of [this.read, this.write]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.hasSource = false;
  }

  destroy(): void {
    this.active = false;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.releaseTargets();
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    this.programs.forEach(program => this.gl.deleteProgram(program));
    this.textures = [];
    this.programs = [];
  }

  private releaseTargets(): void {
    this.framebuffers.forEach(framebuffer => this.gl.deleteFramebuffer(framebuffer));
    this.framebuffers = [];
    for (const target of [this.read, this.write]) {
      if (!target) continue;
      this.gl.deleteTexture(target.texture);
      this.textures = this.textures.filter(texture => texture !== target.texture);
    }
  }

  private upload(texture: WebGLTexture, data: Float32Array): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gridW + 2, this.gridH + 2, gl.RGBA, gl.FLOAT, data);
  }

  private bind(program: Program, name: string, texture: WebGLTexture, unit: number): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.uniform1i(program.uniforms[name], unit);
  }

  private texture(filter: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate dye texture");
    this.textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private target(): Target {
    const gl = this.gl;
    const texture = this.texture(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.dyeW, this.dyeH, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Unable to allocate dye framebuffer");
    this.framebuffers.push(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Unsupported dye framebuffer");
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer };
  }

  private program(vertexSource: string, fragmentSource: string, uniforms: string[]): Program {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to allocate dye program");
    this.programs.push(program);
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to allocate dye shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error ?? "Unable to compile dye shader");
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link dye program");
    return { program, uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, name)])) };
  }
}
