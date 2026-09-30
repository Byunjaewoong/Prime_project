export type GrainParams = {
  size: number;
  density: number;
  contrast: number;
  flow: number;
};

export const DEFAULT_GRAIN: GrainParams = { size: 1, density: 1, contrast: 1.4, flow: 1.05 };

const COLORS = [
  "#4d7b95", "#7d917d", "#987e72", "#817b96", "#718998", "#9a8b78",
  "#708a83", "#987881", "#788097", "#929173", "#888b86",
];

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uPixelRatio;
uniform float uSeed;
uniform float uSize;
uniform float uDensity;
uniform float uContrast;
uniform float uFlow;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x), f.y);
}

void main() {
  vec2 p = gl_FragCoord.xy / uPixelRatio;
  vec2 seed = vec2(uSeed, uSeed * 1.71);
  float broad = (noise2(p * 0.0048 + seed) - 0.5) * 0.078;
  float middle = (noise2(p * 0.027 + seed * 1.93) - 0.5) * 0.044;
  float clustered = (noise2(p * 0.19 + seed * 3.7) - 0.5) * 0.052;
  vec2 warp = vec2(noise2(p * 0.011 + seed * 2.3),
                   noise2(p * 0.011 + seed * 2.3 + vec2(19.7, 43.1))) - 0.5;
  vec2 grainP = p + warp * (3.4 * uSize);
  float flow = (noise2(p * 0.009 + seed * 0.7) - 0.5) * uFlow * 1.8;
  float spacing = 6.8 * uSize / sqrt(uDensity);
  vec2 grid = floor(grainP / spacing);
  float fibers = 0.0;

  // Sparse, oriented Gaussian-windowed ridge pairs: a Gabor-style grain.
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = grid + vec2(float(x), float(y));
      float a = hash21(cell + seed * 3.1);
      float b = hash21(cell + seed * 3.1 + vec2(17.3, 4.7));
      float c = hash21(cell + seed * 3.1 + vec2(3.9, 29.2));
      vec2 center = (cell + vec2(a, b) * 0.74 + 0.13) * spacing;
      vec2 direction = normalize(vec2(flow + (c - 0.5) * 0.95, 1.0));
      vec2 delta = grainP - center;
      float along = dot(delta, direction) / (uSize * (2.8 + a * 2.4));
      float across = dot(delta, vec2(direction.y, -direction.x)) / (uSize * (0.55 + b * 0.27));
      float envelope = exp(-2.1 * along * along - 0.85 * across * across);
      fibers += envelope * sin(across * 1.85) * (0.55 + c * 0.45);
    }
  }

  float fine = (hash21(floor(gl_FragCoord.xy) + seed * 71.0) - 0.5) * 0.023;
  float value = broad + middle + clustered + fibers * uContrast * 0.115 + fine;
  outColor = vec4(clamp(uColor + vec3(value), 0.0, 1.0), 1.0);
}
`;

function rgbFromHex(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create Painted shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Painted shader compilation failed: ${message}`);
  }
  return shader;
}

export class PaintedRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly fallback: CanvasRenderingContext2D | null;
  private readonly program: WebGLProgram | null = null;
  private readonly vertexShader: WebGLShader | null = null;
  private readonly fragmentShader: WebGLShader | null = null;
  private readonly buffer: WebGLBuffer | null = null;
  private readonly seed = Math.random() * 1000;
  private params: GrainParams = { ...DEFAULT_GRAIN };
  private colorIndex = 0;
  private frame: number | null = null;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    this.fallback = this.gl ? null : canvas.getContext("2d", { alpha: false });

    if (this.gl) {
      const gl = this.gl;
      const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      const program = gl.createProgram();
      if (!program) throw new Error("Could not create Painted program");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Painted program link failed: ${gl.getProgramInfoLog(program)}`);
      }
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Could not create Painted geometry");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.program = program;
      this.vertexShader = vertex;
      this.fragmentShader = fragment;
      this.buffer = buffer;
    }

    this.scheduleRender = this.scheduleRender.bind(this);
    window.addEventListener("resize", this.scheduleRender, { passive: true });
    this.scheduleRender();
  }

  changeColor() {
    const previous = this.colorIndex;
    do {
      this.colorIndex = Math.floor(Math.random() * COLORS.length);
    } while (this.colorIndex === previous);
    this.scheduleRender();
  }

  setGrain(next: Partial<GrainParams>) {
    this.params = { ...this.params, ...next };
    this.scheduleRender();
  }

  private scheduleRender() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (!this.destroyed) this.render();
    });
  }

  private render() {
    const area = Math.max(1, this.canvas.clientWidth * this.canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / area));
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const color = rgbFromHex(COLORS[this.colorIndex]);
    const gl = this.gl;
    if (!gl || !this.program) {
      this.renderFallback(color, ratio);
      return;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform3f(gl.getUniformLocation(this.program, "uColor"), ...color);
    gl.uniform1f(gl.getUniformLocation(this.program, "uPixelRatio"), ratio);
    gl.uniform1f(gl.getUniformLocation(this.program, "uSeed"), this.seed);
    gl.uniform1f(gl.getUniformLocation(this.program, "uSize"), this.params.size);
    gl.uniform1f(gl.getUniformLocation(this.program, "uDensity"), this.params.density);
    gl.uniform1f(gl.getUniformLocation(this.program, "uContrast"), this.params.contrast);
    gl.uniform1f(gl.getUniformLocation(this.program, "uFlow"), this.params.flow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private renderFallback(color: [number, number, number], ratio: number) {
    const context = this.fallback;
    if (!context) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = `rgb(${color.map(channel => Math.round(channel * 255)).join(",")})`;
    context.fillRect(0, 0, width, height);
    let state = Math.floor(this.seed * 1000000) || 1;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      return (state >>> 0) / 4294967296;
    };
    const spacing = 6.8 * this.params.size / Math.sqrt(this.params.density);
    const count = Math.ceil(width * height / (spacing * spacing));
    context.lineCap = "round";
    for (let index = 0; index < count; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const length = (2.5 + random() * 4) * this.params.size;
      const tilt = (random() - 0.5) * (0.7 + this.params.flow);
      const alpha = (0.025 + random() * 0.09) * this.params.contrast;
      context.strokeStyle = random() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      context.lineWidth = (0.45 + random() * 0.7) * this.params.size;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + tilt * length, y + length);
      context.stroke();
    }
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.scheduleRender);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.gl) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader);
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader);
    }
  }
}
