export type NoiseParams = {
  scale: number;
  octaves: number;
  roughness: number;
  relief: number;
  seed: number;
};

export const DEFAULT_NOISE: NoiseParams = { scale: 11, octaves: 4, roughness: 0.5, relief: 6, seed: 17 };

export const DEFAULT_COLOR = "#4d7b95";
export const DEFAULT_SHADOW_DEPTH = 1;
const LIGHT: [number, number, number] = [-0.42, 0.46, 0.78];

function colorChannels(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform vec3 uLight;
uniform float uPixelRatio;
uniform float uScale;
uniform int uOctaves;
uniform float uRoughness;
uniform float uRelief;
uniform float uSeed;
uniform float uShadowDepth;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

vec2 gradient(vec2 lattice) {
  vec2 offset = vec2(uSeed * 13.17, uSeed * 7.31);
  vec2 direction = vec2(
    hash21(lattice + offset),
    hash21(lattice + offset + vec2(37.19, 91.73))
  ) * 2.0 - 1.0;
  return normalize(direction + vec2(0.0001));
}

float perlin(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 fade = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  float lower = mix(
    dot(gradient(cell), local),
    dot(gradient(cell + vec2(1.0, 0.0)), local - vec2(1.0, 0.0)),
    fade.x
  );
  float upper = mix(
    dot(gradient(cell + vec2(0.0, 1.0)), local - vec2(0.0, 1.0)),
    dot(gradient(cell + vec2(1.0, 1.0)), local - vec2(1.0, 1.0)),
    fade.x
  );
  return mix(lower, upper, fade.y);
}

float heightAt(vec2 pixel) {
  float frequency = 1.0;
  float amplitude = 1.0;
  float height = 0.0;
  float totalAmplitude = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= uOctaves || uScale / frequency < 1.5 / uPixelRatio) break;
    height += amplitude * perlin(pixel * frequency / uScale + vec2(float(octave) * 29.7));
    totalAmplitude += amplitude;
    frequency *= 2.0;
    amplitude *= uRoughness;
  }
  return height / max(totalAmplitude, 0.001);
}

void main() {
  vec2 pixel = gl_FragCoord.xy / uPixelRatio;
  float height = heightAt(pixel);
  // z = height(x, y); the screen-space slopes define its 3D surface normal.
  vec3 normal = normalize(vec3(
    -dFdx(height) * uPixelRatio * uRelief,
    -dFdy(height) * uPixelRatio * uRelief,
    1.0
  ));
  float illumination = max(dot(normal, normalize(uLight)), 0.0);
  float shade = mix(1.0, 0.24 + 0.96 * illumination, uShadowDepth);
  outColor = vec4(clamp(uColor * shade, 0.0, 1.0), 1.0);
}
`;

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

const CPU_GRADIENTS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

function cpuPerlin(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fx = x - cellX;
  const fy = y - cellY;
  const fade = (value: number) => value ** 3 * (value * (value * 6 - 15) + 10);
  const dot = (dx: number, dy: number) => {
    let hash = Math.imul(cellX + dx, 374761393) + Math.imul(cellY + dy, 668265263) + Math.imul(seed, 1442695041);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const [gx, gy] = CPU_GRADIENTS[hash & 7];
    return gx * (fx - dx) + gy * (fy - dy);
  };
  const lower = dot(0, 0) + fade(fx) * (dot(1, 0) - dot(0, 0));
  const upper = dot(0, 1) + fade(fx) * (dot(1, 1) - dot(0, 1));
  return lower + fade(fy) * (upper - lower);
}

export class PaintedRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly fallback: CanvasRenderingContext2D | null;
  private readonly program: WebGLProgram | null = null;
  private readonly vertexShader: WebGLShader | null = null;
  private readonly fragmentShader: WebGLShader | null = null;
  private readonly buffer: WebGLBuffer | null = null;
  private params: NoiseParams = { ...DEFAULT_NOISE };
  private color = DEFAULT_COLOR;
  private shadowDepth = DEFAULT_SHADOW_DEPTH;
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

  setNoise(next: Partial<NoiseParams>) {
    this.params = { ...this.params, ...next };
    this.scheduleRender();
  }

  setColor(hex: string) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    this.color = hex;
    this.scheduleRender();
  }

  setShadowDepth(value: number) {
    this.shadowDepth = Math.max(0, Math.min(2, value));
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
    const gl = this.gl;
    if (!gl || !this.program) {
      this.renderFallback();
      return;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.uniform3f(gl.getUniformLocation(this.program, "uColor"), ...colorChannels(this.color));
    gl.uniform3f(gl.getUniformLocation(this.program, "uLight"), ...LIGHT);
    gl.uniform1f(gl.getUniformLocation(this.program, "uPixelRatio"), ratio);
    gl.uniform1f(gl.getUniformLocation(this.program, "uScale"), this.params.scale);
    gl.uniform1i(gl.getUniformLocation(this.program, "uOctaves"), this.params.octaves);
    gl.uniform1f(gl.getUniformLocation(this.program, "uRoughness"), this.params.roughness);
    gl.uniform1f(gl.getUniformLocation(this.program, "uRelief"), this.params.relief);
    gl.uniform1f(gl.getUniformLocation(this.program, "uSeed"), this.params.seed);
    gl.uniform1f(gl.getUniformLocation(this.program, "uShadowDepth"), this.shadowDepth);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private renderFallback() {
    const context = this.fallback;
    if (!context) return;
    const color = colorChannels(this.color);
    const { width, height } = this.canvas;
    const downsample = Math.min(1, Math.sqrt(350_000 / (width * height)));
    const sampleWidth = Math.max(1, Math.round(width * downsample));
    const sampleHeight = Math.max(1, Math.round(height * downsample));
    const cssStep = this.canvas.clientWidth / sampleWidth;
    const heights = new Float32Array(sampleWidth * sampleHeight);
    const seed = Math.round(this.params.seed);
    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        let frequency = 1;
        let amplitude = 1;
        let value = 0;
        let totalAmplitude = 0;
        for (let octave = 0; octave < this.params.octaves; octave++) {
          if (this.params.scale / frequency < cssStep * 1.5) break;
          const px = x * cssStep * frequency / this.params.scale + octave * 29.7;
          const py = y * cssStep * frequency / this.params.scale + octave * 29.7;
          value += amplitude * cpuPerlin(px, py, seed);
          totalAmplitude += amplitude;
          frequency *= 2;
          amplitude *= this.params.roughness;
        }
        heights[y * sampleWidth + x] = value / (totalAmplitude || 1);
      }
    }
    const image = context.createImageData(sampleWidth, sampleHeight);
    const lightLength = Math.hypot(...LIGHT);
    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const index = y * sampleWidth + x;
        const left = heights[y * sampleWidth + Math.max(0, x - 1)];
        const right = heights[y * sampleWidth + Math.min(sampleWidth - 1, x + 1)];
        const above = heights[Math.max(0, y - 1) * sampleWidth + x];
        const below = heights[Math.min(sampleHeight - 1, y + 1) * sampleWidth + x];
        const nx = -(right - left) * this.params.relief / (2 * cssStep);
        const ny = (below - above) * this.params.relief / (2 * cssStep);
        const dot = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / (Math.hypot(nx, ny, 1) * lightLength));
        const shade = 1 + this.shadowDepth * (0.24 + 0.96 * dot - 1);
        for (let channel = 0; channel < 3; channel++) image.data[index * 4 + channel] = Math.round(color[channel] * shade * 255);
        image.data[index * 4 + 3] = 255;
      }
    }
    const tile = document.createElement("canvas");
    tile.width = sampleWidth;
    tile.height = sampleHeight;
    tile.getContext("2d")?.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(tile, 0, 0, width, height);
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
