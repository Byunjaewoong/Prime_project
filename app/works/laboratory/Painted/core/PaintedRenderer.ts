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
export const DEFAULT_PEAK_HOLD = 0.25;
export type LightDirection = [number, number, number];
export const DEFAULT_LIGHT_DIRECTION: LightDirection = [-0.42, 0.46, Math.sqrt(1 - 0.42 ** 2 - 0.46 ** 2)];
const FIELD_ZOOM = 2; // Twice the span on each axis: four times the visible field area.
// Pairwise-coprime transition lengths; their alignment takes 8 * 11 * 13 seconds at 1x.
const CYCLES = [
  { seconds: 8, weight: 0.62, spatialScale: 1, resolution: 1 },
  { seconds: 11, weight: 0.25, spatialScale: 1.8, resolution: 0.5 },
  { seconds: 13, weight: 0.13, spatialScale: 3.2, resolution: 0.375 },
] as const;

function colorChannels(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const NORMAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform float uPixelRatio;
uniform vec2 uViewportSize;
uniform float uFieldZoom;
uniform float uScale;
uniform int uOctaves;
uniform float uRoughness;
uniform float uRelief;
uniform float uSeed;
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
    if (octave >= uOctaves || uScale / frequency < 1.25 * uFieldZoom / uPixelRatio) break;
    height += amplitude * perlin(pixel * frequency / uScale + vec2(float(octave) * 29.7));
    totalAmplitude += amplitude;
    frequency *= 2.0;
    amplitude *= uRoughness;
  }
  return height / max(totalAmplitude, 0.001);
}

void main() {
  vec2 screenPixel = gl_FragCoord.xy / uPixelRatio;
  vec2 pixel = (screenPixel - uViewportSize * 0.5) * uFieldZoom + uViewportSize * 0.5;
  float height = heightAt(pixel);
  // z = height(x, y); the screen-space slopes define its 3D surface normal.
  vec3 normal = normalize(vec3(
    -dFdx(height) * uPixelRatio * uRelief / uFieldZoom,
    -dFdy(height) * uPixelRatio * uRelief / uFieldZoom,
    1.0
  ));
  outColor = vec4(normal * 0.5 + 0.5, clamp(height * 0.5 + 0.5, 0.0, 1.0));
}
`;

const DISPLAY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uNormalsA0;
uniform sampler2D uNormalsB0;
uniform sampler2D uNormalsA1;
uniform sampler2D uNormalsB1;
uniform sampler2D uNormalsA2;
uniform sampler2D uNormalsB2;
uniform vec3 uBlends;
uniform float uPeakHold;
uniform vec3 uColor;
uniform vec3 uLight;
uniform float uShadowDepth;
out vec4 outColor;

vec2 slopeAt(vec4 source, vec4 target, float blend) {
  float sourcePeak = smoothstep(0.04, 0.22, source.a * 2.0 - 1.0);
  float targetPeak = smoothstep(0.04, 0.22, target.a * 2.0 - 1.0);
  float departure = uPeakHold * sourcePeak;
  float arrival = 1.0 - uPeakHold * targetPeak;
  float center = clamp((departure + arrival) * 0.5, 0.01, 0.99);
  float span = max(arrival - departure, 0.02);
  float localBlend = clamp((blend - center) / span + 0.5, 0.0, 1.0);
  vec3 normalA = source.rgb * 2.0 - 1.0;
  vec3 normalB = target.rgb * 2.0 - 1.0;
  vec2 slopeA = normalA.xy / max(normalA.z, 0.05);
  vec2 slopeB = normalB.xy / max(normalB.z, 0.05);
  // Mixing independent slopes loses contrast near the midpoint. Preserve its RMS energy.
  float energy = inversesqrt(max((1.0 - localBlend) * (1.0 - localBlend) + localBlend * localBlend, 0.5));
  return mix(slopeA, slopeB, localBlend) * energy;
}

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uNormalsA0, 0));
  vec2 slope =
    0.62 * slopeAt(texture(uNormalsA0, uv), texture(uNormalsB0, uv), uBlends.x) +
    0.25 * slopeAt(texture(uNormalsA1, uv), texture(uNormalsB1, uv), uBlends.y) +
    0.13 * slopeAt(texture(uNormalsA2, uv), texture(uNormalsB2, uv), uBlends.z);
  vec3 normal = normalize(vec3(slope, 1.0));
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

function linkProgram(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader) {
  const program = gl.createProgram();
  if (!program) throw new Error("Could not create Painted program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Painted program link failed: ${message}`);
  }
  return program;
}

type NormalTarget = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number; dirty: boolean; rowsRendered: number };
type NoiseCycle = {
  sourceSeed: number;
  nextSeed: number | null;
  queuedSeed: number | null;
  progress: number;
  sourceTarget: NormalTarget | null;
  nextTarget: NormalTarget | null;
  queuedTarget: NormalTarget | null;
  cpuHeights: Float32Array | null;
  cpuNextHeights: Float32Array | null;
  cpuQueuedHeights: Float32Array | null;
};

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
  private readonly normalProgram: WebGLProgram | null = null;
  private readonly displayProgram: WebGLProgram | null = null;
  private readonly vertexShader: WebGLShader | null = null;
  private readonly normalShader: WebGLShader | null = null;
  private readonly displayShader: WebGLShader | null = null;
  private readonly buffer: WebGLBuffer | null = null;
  private cycles: NoiseCycle[] = CYCLES.map((_, index) => ({
    sourceSeed: (DEFAULT_NOISE.seed + index * 31) % 101,
    nextSeed: null,
    queuedSeed: null,
    progress: 0,
    sourceTarget: null,
    nextTarget: null,
    queuedTarget: null,
    cpuHeights: null,
    cpuNextHeights: null,
    cpuQueuedHeights: null,
  }));
  private cpuSampleWidth = 0;
  private cpuSampleHeight = 0;
  private params: NoiseParams = { ...DEFAULT_NOISE };
  private morphSpeed = 1;
  private peakHold = DEFAULT_PEAK_HOLD;
  private playing = false;
  private lastFrameTime: number | null = null;
  private color = DEFAULT_COLOR;
  private shadowDepth = DEFAULT_SHADOW_DEPTH;
  private lightDirection: LightDirection = [...DEFAULT_LIGHT_DIRECTION];
  private frame: number | null = null;
  private destroyed = false;
  private readonly onSeedReached?: (seed: number) => void;

  constructor(canvas: HTMLCanvasElement, onSeedReached?: (seed: number) => void) {
    this.canvas = canvas;
    this.onSeedReached = onSeedReached;
    this.gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    this.fallback = this.gl ? null : canvas.getContext("2d", { alpha: false });

    if (this.gl) {
      const gl = this.gl;
      const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const normalShader = compileShader(gl, gl.FRAGMENT_SHADER, NORMAL_FRAGMENT_SHADER);
      const displayShader = compileShader(gl, gl.FRAGMENT_SHADER, DISPLAY_FRAGMENT_SHADER);
      const normalProgram = linkProgram(gl, vertex, normalShader);
      const displayProgram = linkProgram(gl, vertex, displayShader);
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Could not create Painted geometry");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.normalProgram = normalProgram;
      this.displayProgram = displayProgram;
      this.vertexShader = vertex;
      this.normalShader = normalShader;
      this.displayShader = displayShader;
      this.buffer = buffer;
    }

    this.scheduleRender = this.scheduleRender.bind(this);
    window.addEventListener("resize", this.scheduleRender, { passive: true });
    this.scheduleRender();
  }

  setNoise(next: Partial<NoiseParams>) {
    this.params = { ...this.params, ...next };
    if (next.seed !== undefined) {
      const seed = next.seed;
      this.cycles.forEach((cycle, index) => {
        cycle.sourceSeed = (seed + index * 31) % 101;
        cycle.nextSeed = this.playing ? this.randomSeedExcluding(cycle.sourceSeed) : null;
        cycle.queuedSeed = this.playing && cycle.nextSeed !== null
          ? this.randomSeedExcluding(cycle.sourceSeed, cycle.nextSeed) : null;
        cycle.progress = 0;
      });
      this.lastFrameTime = null;
    }
    for (const cycle of this.cycles) {
      for (const target of [cycle.sourceTarget, cycle.nextTarget, cycle.queuedTarget]) {
        if (!target) continue;
        target.dirty = true;
        target.rowsRendered = 0;
      }
      cycle.cpuHeights = null;
      cycle.cpuNextHeights = null;
      cycle.cpuQueuedHeights = null;
    }
    this.scheduleRender();
  }

  setPlaying(playing: boolean) {
    if (this.playing === playing) return;
    this.playing = playing;
    this.lastFrameTime = null;
    for (const cycle of this.cycles) {
      if (playing && cycle.nextSeed === null) cycle.nextSeed = this.randomSeedExcluding(cycle.sourceSeed);
      if (playing && cycle.queuedSeed === null && cycle.nextSeed !== null) {
        cycle.queuedSeed = this.randomSeedExcluding(cycle.sourceSeed, cycle.nextSeed);
      }
    }
    this.scheduleRender();
  }

  setMorphSpeed(value: number) {
    this.morphSpeed = Math.max(0.1, Math.min(6, value));
  }

  setPeakHold(value: number) {
    this.peakHold = Math.max(0, Math.min(1, value));
    this.scheduleRender();
  }

  private randomSeedExcluding(...excluded: number[]) {
    const start = Math.floor(Math.random() * 101);
    for (let offset = 0; offset < 101; offset++) {
      const candidate = (start + offset) % 101;
      if (!excluded.includes(candidate)) return candidate;
    }
    return start;
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

  setLightDirection(direction: LightDirection) {
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length < 0.001) return;
    this.lightDirection = direction.map(component => component / length) as LightDirection;
    this.scheduleRender();
  }

  private scheduleRender() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(now => {
      this.frame = null;
      if (!this.destroyed) {
        this.render(now);
        if (this.playing) this.scheduleRender();
      }
    });
  }

  private createNormalTarget(width: number, height: number): NormalTarget {
    const gl = this.gl;
    if (!gl) throw new Error("Painted WebGL context unavailable");
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Could not create Painted normal target");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw new Error(`Painted normal target incomplete: ${status}`);
    }
    return { texture, framebuffer, width, height, dirty: true, rowsRendered: 0 };
  }

  private deleteNormalTarget(target: NormalTarget | null) {
    if (!target || !this.gl) return;
    this.gl.deleteTexture(target.texture);
    this.gl.deleteFramebuffer(target.framebuffer);
  }

  private renderNormalTarget(target: NormalTarget, seed: number, spatialScale: number, rowBudget = target.height) {
    const gl = this.gl;
    const program = this.normalProgram;
    if (!gl || !program || !target.dirty) return;
    const rows = Math.min(rowBudget, target.height - target.rowsRendered);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.useProgram(program);
    gl.viewport(0, 0, target.width, target.height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, target.rowsRendered, target.width, rows);
    gl.uniform1f(gl.getUniformLocation(program, "uPixelRatio"), target.width / this.canvas.clientWidth);
    gl.uniform2f(gl.getUniformLocation(program, "uViewportSize"), this.canvas.clientWidth, this.canvas.clientHeight);
    gl.uniform1f(gl.getUniformLocation(program, "uFieldZoom"), FIELD_ZOOM);
    gl.uniform1f(gl.getUniformLocation(program, "uScale"), this.params.scale * spatialScale);
    gl.uniform1i(gl.getUniformLocation(program, "uOctaves"), this.params.octaves);
    gl.uniform1f(gl.getUniformLocation(program, "uRoughness"), this.params.roughness);
    gl.uniform1f(gl.getUniformLocation(program, "uRelief"), this.params.relief * spatialScale);
    gl.uniform1f(gl.getUniformLocation(program, "uSeed"), seed);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    target.rowsRendered += rows;
    target.dirty = target.rowsRendered < target.height;
  }

  private render(now: number) {
    if (this.playing) {
      if (this.lastFrameTime !== null) {
        const elapsed = Math.min(now - this.lastFrameTime, 100) * this.morphSpeed / 1000;
        this.cycles.forEach((cycle, index) => {
          cycle.progress += elapsed / CYCLES[index].seconds;
          if (cycle.progress >= 1 && cycle.nextSeed !== null && cycle.queuedSeed !== null) {
            if (cycle.queuedTarget?.dirty) {
              this.renderNormalTarget(cycle.queuedTarget, cycle.queuedSeed, CYCLES[index].spatialScale);
            }
            cycle.progress -= 1;
            [cycle.sourceTarget, cycle.nextTarget, cycle.queuedTarget] =
              [cycle.nextTarget, cycle.queuedTarget, cycle.sourceTarget];
            [cycle.cpuHeights, cycle.cpuNextHeights, cycle.cpuQueuedHeights] =
              [cycle.cpuNextHeights, cycle.cpuQueuedHeights, cycle.cpuHeights];
            cycle.sourceSeed = cycle.nextSeed;
            cycle.nextSeed = cycle.queuedSeed;
            cycle.queuedSeed = this.randomSeedExcluding(cycle.sourceSeed, cycle.nextSeed);
            if (index === 0) {
              this.params.seed = cycle.sourceSeed;
              this.onSeedReached?.(cycle.sourceSeed);
            }
            if (cycle.queuedTarget) {
              cycle.queuedTarget.dirty = true;
              cycle.queuedTarget.rowsRendered = 0;
            }
            cycle.cpuQueuedHeights = null;
          }
        });
      }
      this.lastFrameTime = now;
    }
    const area = Math.max(1, this.canvas.clientWidth * this.canvas.clientHeight);
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3, Math.sqrt(12_000_000 / area));
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      for (const cycle of this.cycles) {
        cycle.cpuHeights = null;
        cycle.cpuNextHeights = null;
        cycle.cpuQueuedHeights = null;
        this.deleteNormalTarget(cycle.sourceTarget);
        this.deleteNormalTarget(cycle.nextTarget);
        this.deleteNormalTarget(cycle.queuedTarget);
        cycle.sourceTarget = null;
        cycle.nextTarget = null;
        cycle.queuedTarget = null;
      }
    }
    const gl = this.gl;
    if (!gl || !this.normalProgram || !this.displayProgram) {
      this.renderFallback();
      return;
    }
    const displayProgram = this.displayProgram;
    this.cycles.forEach((cycle, index) => {
      const config = CYCLES[index];
      const targetWidth = Math.max(1, Math.round(width * config.resolution));
      const targetHeight = Math.max(1, Math.round(height * config.resolution));
      cycle.sourceTarget ??= this.createNormalTarget(targetWidth, targetHeight);
      if (cycle.nextSeed !== null) cycle.nextTarget ??= this.createNormalTarget(targetWidth, targetHeight);
      if (cycle.queuedSeed !== null) cycle.queuedTarget ??= this.createNormalTarget(targetWidth, targetHeight);
      this.renderNormalTarget(cycle.sourceTarget, cycle.sourceSeed, config.spatialScale);
      if (cycle.nextSeed !== null && cycle.nextTarget) {
        this.renderNormalTarget(cycle.nextTarget, cycle.nextSeed, config.spatialScale);
      }
      if (this.playing && cycle.queuedSeed !== null && cycle.queuedTarget) {
        const prepFrames = Math.max(8, Math.min(48, Math.ceil(24 / this.morphSpeed)));
        this.renderNormalTarget(cycle.queuedTarget, cycle.queuedSeed, config.spatialScale,
          Math.ceil(targetHeight / prepFrames));
      }
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(displayProgram);
    gl.viewport(0, 0, width, height);
    this.cycles.forEach((cycle, index) => {
      if (!cycle.sourceTarget) return;
      gl.activeTexture(gl.TEXTURE0 + index * 2);
      gl.bindTexture(gl.TEXTURE_2D, cycle.sourceTarget.texture);
      gl.uniform1i(gl.getUniformLocation(displayProgram, `uNormalsA${index}`), index * 2);
      gl.activeTexture(gl.TEXTURE0 + index * 2 + 1);
      gl.bindTexture(gl.TEXTURE_2D, cycle.nextTarget?.texture ?? cycle.sourceTarget.texture);
      gl.uniform1i(gl.getUniformLocation(displayProgram, `uNormalsB${index}`), index * 2 + 1);
    });
    gl.uniform3f(gl.getUniformLocation(displayProgram, "uBlends"),
      ...this.cycles.map(cycle => cycle.nextSeed === null ? 0 : cycle.progress) as [number, number, number]);
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, "uPeakHold"), this.peakHold);
    gl.uniform3f(gl.getUniformLocation(this.displayProgram, "uColor"), ...colorChannels(this.color));
    gl.uniform3f(gl.getUniformLocation(this.displayProgram, "uLight"), ...this.lightDirection);
    gl.uniform1f(gl.getUniformLocation(this.displayProgram, "uShadowDepth"), this.shadowDepth);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private renderFallback() {
    const context = this.fallback;
    if (!context) return;
    const color = colorChannels(this.color);
    const { width, height } = this.canvas;
    const downsample = Math.min(1, Math.sqrt(750_000 / (width * height)));
    const sampleWidth = Math.max(1, Math.round(width * downsample));
    const sampleHeight = Math.max(1, Math.round(height * downsample));
    const cssStepX = this.canvas.clientWidth / sampleWidth;
    const cssStepY = this.canvas.clientHeight / sampleHeight;
    const worldStepX = cssStepX * FIELD_ZOOM;
    const worldStepY = cssStepY * FIELD_ZOOM;
    if (this.cpuSampleWidth !== sampleWidth || this.cpuSampleHeight !== sampleHeight) {
      for (const cycle of this.cycles) {
        cycle.cpuHeights = null;
        cycle.cpuNextHeights = null;
        cycle.cpuQueuedHeights = null;
      }
      this.cpuSampleWidth = sampleWidth;
      this.cpuSampleHeight = sampleHeight;
    }
    const computeHeights = (seedValue: number, spatialScale: number) => {
      const heights = new Float32Array(sampleWidth * sampleHeight);
      const seed = Math.round(seedValue);
      for (let y = 0; y < sampleHeight; y++) {
        for (let x = 0; x < sampleWidth; x++) {
          const worldX = (x * cssStepX - this.canvas.clientWidth * 0.5) * FIELD_ZOOM + this.canvas.clientWidth * 0.5;
          const worldY = (y * cssStepY - this.canvas.clientHeight * 0.5) * FIELD_ZOOM + this.canvas.clientHeight * 0.5;
          let frequency = 1;
          let amplitude = 1;
          let value = 0;
          let totalAmplitude = 0;
          for (let octave = 0; octave < this.params.octaves; octave++) {
            const scale = this.params.scale * spatialScale;
            if (scale / frequency < Math.max(worldStepX, worldStepY) * 1.25) break;
            const px = worldX * frequency / scale + octave * 29.7;
            const py = worldY * frequency / scale + octave * 29.7;
            value += amplitude * cpuPerlin(px, py, seed);
            totalAmplitude += amplitude;
            frequency *= 2;
            amplitude *= this.params.roughness;
          }
          heights[y * sampleWidth + x] = value / (totalAmplitude || 1);
        }
      }
      return heights;
    };
    this.cycles.forEach((cycle, index) => {
      const spatialScale = CYCLES[index].spatialScale;
      cycle.cpuHeights ??= computeHeights(cycle.sourceSeed, spatialScale);
      if (cycle.nextSeed !== null) cycle.cpuNextHeights ??= computeHeights(cycle.nextSeed, spatialScale);
      if (this.playing && cycle.queuedSeed !== null && !cycle.cpuQueuedHeights && cycle.progress > 0.1) {
        cycle.cpuQueuedHeights = computeHeights(cycle.queuedSeed, spatialScale);
      }
    });
    const peakWeight = (height: number) => {
      const level = Math.max(0, Math.min(1, (height - 0.04) / 0.18));
      return level * level * (3 - 2 * level);
    };
    const heightAt = (index: number) => {
      let total = 0;
      this.cycles.forEach((cycle, cycleIndex) => {
        const source = cycle.cpuHeights![index];
        const target = cycle.cpuNextHeights?.[index] ?? source;
        const departure = this.peakHold * peakWeight(source);
        const arrival = 1 - this.peakHold * peakWeight(target);
        const center = Math.max(0.01, Math.min(0.99, (departure + arrival) * 0.5));
        const span = Math.max(arrival - departure, 0.02);
        const localBlend = Math.max(0, Math.min(1, (cycle.progress - center) / span + 0.5));
        total += CYCLES[cycleIndex].weight * CYCLES[cycleIndex].spatialScale
          * (source + (target - source) * localBlend);
      });
      return total;
    };
    const image = context.createImageData(sampleWidth, sampleHeight);
    const lightLength = Math.hypot(...this.lightDirection);
    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const index = y * sampleWidth + x;
        const left = heightAt(y * sampleWidth + Math.max(0, x - 1));
        const right = heightAt(y * sampleWidth + Math.min(sampleWidth - 1, x + 1));
        const above = heightAt(Math.max(0, y - 1) * sampleWidth + x);
        const below = heightAt(Math.min(sampleHeight - 1, y + 1) * sampleWidth + x);
        const nx = -(right - left) * this.params.relief / (2 * worldStepX);
        const ny = (below - above) * this.params.relief / (2 * worldStepY);
        const dot = Math.max(0, (nx * this.lightDirection[0] + ny * this.lightDirection[1] + this.lightDirection[2]) / (Math.hypot(nx, ny, 1) * lightLength));
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
      for (const cycle of this.cycles) {
        this.deleteNormalTarget(cycle.sourceTarget);
        this.deleteNormalTarget(cycle.nextTarget);
        this.deleteNormalTarget(cycle.queuedTarget);
      }
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.normalProgram) this.gl.deleteProgram(this.normalProgram);
      if (this.displayProgram) this.gl.deleteProgram(this.displayProgram);
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader);
      if (this.normalShader) this.gl.deleteShader(this.normalShader);
      if (this.displayShader) this.gl.deleteShader(this.displayShader);
    }
  }
}
