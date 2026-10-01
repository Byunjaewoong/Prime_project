import { DEFAULT_LIGHT_DIRECTION, DEFAULT_NOISE, type LightDirection } from "../../Painted/core/PaintedRenderer";
import { PAINTED_PERLIN_GLSL } from "../../Painted/core/paintedNoise";

export type FootPrintShape = "circle" | "square" | "triangle";

type Stamp = { x: number; y: number; shape: FootPrintShape; size: number; depth: number };

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform float uRatio;
uniform vec2 uViewport;
uniform vec2 uCenter;
uniform float uSize;
uniform float uDepth;
uniform int uShape;
uniform vec3 uLight;
uniform float uSeed;
out vec4 outColor;

${PAINTED_PERLIN_GLSL}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 edge = b - a;
  return length(p - a - edge * clamp(dot(p - a, edge) / dot(edge, edge), 0.0, 1.0));
}

float shapeDistance(vec2 p) {
  if (uShape == 0) return length(p) - uSize;
  if (uShape == 1) {
    vec2 q = abs(p) - vec2(uSize * 0.86);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }
  vec2 a = vec2(0.0, -uSize);
  vec2 b = vec2(-0.8660254 * uSize, 0.5 * uSize);
  vec2 c = vec2(0.8660254 * uSize, 0.5 * uSize);
  float d = min(segmentDistance(p, a, b), min(segmentDistance(p, b, c), segmentDistance(p, c, a)));
  float ab = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  float bc = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  float ca = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
  bool inside = (ab >= 0.0 && bc >= 0.0 && ca >= 0.0) || (ab <= 0.0 && bc <= 0.0 && ca <= 0.0);
  return inside ? -d : d;
}

float wallHeight(vec2 local) {
  float wallWidth = clamp(uSize * 0.22, 5.0, 12.0);
  return -uDepth * (1.0 - smoothstep(-wallWidth, 0.8, shapeDistance(local)));
}

float interiorNoise(vec2 pixel) {
  // Painted's six-octave gradient Perlin field, with only its scale changed to 10.
  vec2 world = (pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5;
  float frequency = 1.0;
  float amplitude = 1.0;
  float height = 0.0;
  float total = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    height += amplitude * perlin(world * frequency / 10.0 + vec2(float(octave) * 29.7));
    total += amplitude;
    frequency *= 2.0;
    amplitude *= 0.45;
  }
  return height / total;
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x / uRatio, uViewport.y - gl_FragCoord.y / uRatio);
  vec2 local = pixel - uCenter;
  float distanceToEdge = shapeDistance(local);

  float wallWidth = clamp(uSize * 0.22, 5.0, 12.0);
  float bottom = 1.0 - smoothstep(-wallWidth * 1.5, -wallWidth * 0.45, distanceToEdge);
  float grain = interiorNoise(pixel);
  float height = wallHeight(local) + grain * ${(DEFAULT_NOISE.relief / 2).toFixed(1)} * bottom;
  vec3 normal = normalize(vec3(-dFdx(height) * uRatio, -dFdy(height) * uRatio, 1.0));
  if (distanceToEdge > 1.2) discard;
  vec3 light = normalize(uLight);

  // A ray toward the light rises above the floor; a higher wall sample occludes it.
  vec2 lightTravel = normalize(vec2(light.x, -light.y) + vec2(0.00001));
  float lightRise = max(light.z, 0.03) / max(length(light.xy), 0.03);
  float wallShadow = 0.0;
  for (int sampleIndex = 1; sampleIndex <= 10; sampleIndex++) {
    float travel = float(sampleIndex) * 4.0;
    float obstruction = wallHeight(local + lightTravel * travel) - (height + travel * lightRise);
    wallShadow = max(wallShadow, smoothstep(0.2, 2.0, obstruction) * (1.0 - travel / 70.0));
  }

  float wall = smoothstep(-wallWidth, 0.8, distanceToEdge);
  vec3 snow = vec3(mix(0.82 + grain * 0.18, 0.98, wall * 0.72));
  float diffuse = 0.28 + 0.72 * max(dot(normal, light), 0.0);
  vec3 color = snow * diffuse * (1.0 - 0.72 * wallShadow * bottom);
  float alpha = 1.0 - smoothstep(-0.5, 1.2, distanceToEdge);
  outColor = vec4(color * alpha, alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create Foot print shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Foot print shader compilation failed: ${message}`);
  }
  return shader;
}

export class FootPrintRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly fallback: CanvasRenderingContext2D | null;
  private readonly program: WebGLProgram | null = null;
  private readonly vertexShader: WebGLShader | null = null;
  private readonly fragmentShader: WebGLShader | null = null;
  private readonly buffer: WebGLBuffer | null = null;
  private readonly stamps: Stamp[] = [];
  private lightDirection: LightDirection = [...DEFAULT_LIGHT_DIRECTION];
  private readonly onResize = () => this.renderAll();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
    this.fallback = this.gl ? null : canvas.getContext("2d");
    if (this.gl) {
      const gl = this.gl;
      const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      const program = gl.createProgram();
      if (!program) throw new Error("Could not create Foot print program");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Foot print program link failed: ${gl.getProgramInfoLog(program)}`);
      }
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Could not create Foot print geometry");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.program = program;
      this.vertexShader = vertex;
      this.fragmentShader = fragment;
      this.buffer = buffer;
    }
    window.addEventListener("resize", this.onResize, { passive: true });
    this.renderAll();
  }

  stamp(x: number, y: number, shape: FootPrintShape, size: number, depth: number) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.stamps.push({ x: x / width, y: y / height, shape, size, depth });
    if (this.stamps.length > 120) this.stamps.shift();
    this.renderAll();
  }

  setLightDirection(direction: LightDirection) {
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length < 0.001) return;
    this.lightDirection = direction.map(component => component / length) as LightDirection;
    this.renderAll();
  }

  clear() {
    this.stamps.length = 0;
    this.renderAll();
  }

  private renderAll() {
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;
    if (!cssWidth || !cssHeight) return;
    const area = Math.max(1, cssWidth * cssHeight);
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3, Math.sqrt(12_000_000 / area));
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (this.gl && this.program) {
      const gl = this.gl;
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.program);
      for (const stamp of this.stamps) this.drawStamp(stamp, ratio);
      gl.disable(gl.BLEND);
    } else if (this.fallback) {
      this.renderFallback();
    }
  }

  private drawStamp(stamp: Stamp, ratio: number) {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) return;
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;
    const x = stamp.x * cssWidth;
    const y = stamp.y * cssHeight;
    const bound = stamp.size * 1.1 + 3;
    const left = Math.max(0, Math.floor((x - bound) * ratio));
    const bottom = Math.max(0, Math.floor((cssHeight - y - bound) * ratio));
    const right = Math.min(this.canvas.width, Math.ceil((x + bound) * ratio));
    const top = Math.min(this.canvas.height, Math.ceil((cssHeight - y + bound) * ratio));
    if (right <= left || top <= bottom) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, bottom, right - left, top - bottom);
    gl.uniform1f(gl.getUniformLocation(program, "uRatio"), ratio);
    gl.uniform2f(gl.getUniformLocation(program, "uViewport"), cssWidth, cssHeight);
    gl.uniform2f(gl.getUniformLocation(program, "uCenter"), x, y);
    gl.uniform1f(gl.getUniformLocation(program, "uSize"), stamp.size);
    gl.uniform1f(gl.getUniformLocation(program, "uDepth"), stamp.depth);
    gl.uniform1i(gl.getUniformLocation(program, "uShape"), stamp.shape === "circle" ? 0 : stamp.shape === "square" ? 1 : 2);
    gl.uniform3f(gl.getUniformLocation(program, "uLight"), ...this.lightDirection);
    gl.uniform1f(gl.getUniformLocation(program, "uSeed"), DEFAULT_NOISE.seed);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
  }

  private renderFallback() {
    const context = this.fallback;
    if (!context) return;
    const ratio = this.canvas.width / this.canvas.clientWidth;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const stamp of this.stamps) {
      const x = stamp.x * this.canvas.width;
      const y = stamp.y * this.canvas.height;
      const size = stamp.size * ratio;
      const path = new Path2D();
      if (stamp.shape === "circle") path.arc(x, y, size, 0, Math.PI * 2);
      else if (stamp.shape === "square") path.rect(x - size * 0.86, y - size * 0.86, size * 1.72, size * 1.72);
      else {
        path.moveTo(x, y - size);
        path.lineTo(x - size * 0.866, y + size * 0.5);
        path.lineTo(x + size * 0.866, y + size * 0.5);
        path.closePath();
      }
      const lightX = this.lightDirection[0];
      const lightY = -this.lightDirection[1];
      const gradient = context.createLinearGradient(
        x + lightX * size, y + lightY * size,
        x - lightX * size, y - lightY * size,
      );
      gradient.addColorStop(0, "#393c3e");
      gradient.addColorStop(0.4, "#777b7d");
      gradient.addColorStop(1, "#a6a9aa");
      context.save();
      context.shadowColor = "rgba(36,40,43,.65)";
      context.shadowBlur = stamp.depth * ratio * 0.7;
      context.fillStyle = gradient;
      context.fill(path);
      context.restore();
    }
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    if (this.gl) {
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader);
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader);
    }
  }
}
