import { DEFAULT_COLOR, DEFAULT_LIGHT_DIRECTION, DEFAULT_NOISE, type LightDirection, type NoiseParams } from "../../Painted/core/PaintedRenderer";
import { PAINTED_PERLIN_GLSL } from "../../Painted/core/paintedNoise";

export type FootPrintShape = "circle" | "square" | "triangle";

type Stamp = { x: number; y: number; shape: FootPrintShape; size: number; depth: number };
const MAX_STAMPS = 120;
export const DEFAULT_INSIDE_NOISE: NoiseParams = { ...DEFAULT_NOISE, scale: 10 };

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform float uRatio;
uniform vec2 uViewport;
uniform sampler2D uStampData;
uniform int uCount;
uniform vec3 uLight;
uniform vec3 uColor;
uniform float uShadowDepth;
uniform float uScale;
uniform int uOctaves;
uniform float uRoughness;
uniform float uRelief;
uniform float uSeed;
out vec4 outColor;

${PAINTED_PERLIN_GLSL}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 edge = b - a;
  return length(p - a - edge * clamp(dot(p - a, edge) / dot(edge, edge), 0.0, 1.0));
}

float shapeDistance(vec2 pixel, vec4 stamp) {
  vec2 p = pixel - stamp.xy;
  float size = stamp.z;
  int shape = int(floor(stamp.w / 32.0 + 0.0001));
  if (shape == 0) return length(p) - size;
  if (shape == 1) {
    vec2 q = abs(p) - vec2(size * 0.86);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }
  vec2 a = vec2(0.0, -size);
  vec2 b = vec2(-0.8660254 * size, 0.5 * size);
  vec2 c = vec2(0.8660254 * size, 0.5 * size);
  float d = min(segmentDistance(p, a, b), min(segmentDistance(p, b, c), segmentDistance(p, c, a)));
  float ab = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  float bc = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  float ca = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
  bool inside = (ab >= 0.0 && bc >= 0.0 && ca >= 0.0) || (ab <= 0.0 && bc <= 0.0 && ca <= 0.0);
  return inside ? -d : d;
}

float smoothMin(float a, float b, float softness) {
  float blend = max(softness - abs(a - b), 0.0) / softness;
  return min(a, b) - blend * blend * softness * 0.25;
}

vec3 unionField(vec2 pixel) {
  vec2 world = (pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5;
  float fineEdge = perlin(world / 6.0 + vec2(41.3));
  float broadEdge = perlin(world / 17.0 + vec2(7.1));
  float edgeWarp = fineEdge * 2.2 + broadEdge * 3.8;
  float distanceToEdge = 100000.0;
  float depthSum = 0.0;
  float wallSum = 0.0;
  float weightSum = 0.0;
  for (int index = 0; index < ${MAX_STAMPS}; index++) {
    if (index >= uCount) break;
    vec4 stamp = texelFetch(uStampData, ivec2(index, 0), 0);
    float distance = shapeDistance(pixel, stamp) + edgeWarp;
    distanceToEdge = index == 0 ? distance : smoothMin(distanceToEdge, distance, 7.0);
    float weight = 1.0 - smoothstep(-4.0, 8.0, distance);
    int shape = int(floor(stamp.w / 32.0 + 0.0001));
    depthSum += (stamp.w - float(shape) * 32.0) * weight;
    wallSum += clamp(stamp.z * 0.22, 5.0, 12.0) * weight;
    weightSum += weight;
  }
  float wallWidth = wallSum / max(weightSum, 0.0001);
  wallWidth *= clamp(1.0 + fineEdge * 0.32 + broadEdge * 0.42, 0.7, 1.3);
  return vec3(distanceToEdge, depthSum / max(weightSum, 0.0001), wallWidth);
}

float wallHeight(vec2 pixel) {
  vec3 field = unionField(pixel);
  float wallWidth = max(field.z, 5.0);
  return -field.y * (1.0 - smoothstep(-wallWidth, 2.0, field.x));
}

float interiorNoise(vec2 pixel) {
  // The same Painted Perlin controls are exposed independently for the inside.
  vec2 world = (pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5;
  float frequency = 1.0;
  float amplitude = 1.0;
  float height = 0.0;
  float total = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= uOctaves || uScale / frequency < 2.5 / uRatio) break;
    height += amplitude * perlin(world * frequency / uScale + vec2(float(octave) * 29.7));
    total += amplitude;
    frequency *= 2.0;
    amplitude *= uRoughness;
  }
  return height / max(total, 0.001);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x / uRatio, uViewport.y - gl_FragCoord.y / uRatio);
  vec3 field = unionField(pixel);
  float distanceToEdge = field.x;
  float wallWidth = max(field.z, 5.0);
  float bottom = 1.0 - smoothstep(-wallWidth * 1.5, -wallWidth * 0.45, distanceToEdge);
  float texturedSurface = 1.0 - smoothstep(-wallWidth * 2.0, 2.0, distanceToEdge);
  float grain = interiorNoise(pixel);
  float height = -field.y * (1.0 - smoothstep(-wallWidth, 2.0, distanceToEdge))
    + grain * uRelief * 0.5 * texturedSurface;
  vec3 normal = normalize(vec3(-dFdx(height) * uRatio, -dFdy(height) * uRatio, 1.0));
  if (distanceToEdge > 4.0) discard;
  vec3 light = normalize(uLight);

  // A ray toward the light rises above the floor; a higher wall sample occludes it.
  vec2 lightTravel = normalize(vec2(light.x, -light.y) + vec2(0.00001));
  float lightRise = max(light.z, 0.03) / max(length(light.xy), 0.03);
  float wallShadow = 0.0;
  for (int sampleIndex = 1; sampleIndex <= 10; sampleIndex++) {
    float travel = float(sampleIndex) * 4.0;
    float obstruction = wallHeight(pixel + lightTravel * travel) - (height + travel * lightRise);
    wallShadow = max(wallShadow, smoothstep(0.2, 2.0, obstruction) * (1.0 - travel / 70.0));
  }

  float wall = smoothstep(-wallWidth, 2.0, distanceToEdge);
  vec3 snow = uColor * mix(0.82 + grain * 0.18, 0.98, wall * 0.72);
  float diffuse = mix(1.0, 0.28 + 0.72 * max(dot(normal, light), 0.0), uShadowDepth);
  vec3 color = snow * diffuse * (1.0 - 0.72 * min(uShadowDepth, 1.0) * wallShadow * bottom);
  float alpha = 1.0 - smoothstep(-3.0, 4.5, distanceToEdge);
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

function colorChannels(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

export class FootPrintRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly fallback: CanvasRenderingContext2D | null;
  private readonly program: WebGLProgram | null = null;
  private readonly vertexShader: WebGLShader | null = null;
  private readonly fragmentShader: WebGLShader | null = null;
  private readonly buffer: WebGLBuffer | null = null;
  private readonly stampTexture: WebGLTexture | null = null;
  private readonly stamps: Stamp[] = [];
  private noise: NoiseParams = { ...DEFAULT_INSIDE_NOISE };
  private color = DEFAULT_COLOR;
  private shadowDepth = 1;
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
      const stampTexture = gl.createTexture();
      if (!stampTexture) throw new Error("Could not create Foot print stamp data");
      gl.bindTexture(gl.TEXTURE_2D, stampTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_STAMPS, 1, 0, gl.RGBA, gl.FLOAT, null);
      this.program = program;
      this.vertexShader = vertex;
      this.fragmentShader = fragment;
      this.buffer = buffer;
      this.stampTexture = stampTexture;
    }
    window.addEventListener("resize", this.onResize, { passive: true });
    this.renderAll();
  }

  stamp(x: number, y: number, shape: FootPrintShape, size: number, depth: number) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.stamps.push({ x: x / width, y: y / height, shape, size, depth });
    if (this.stamps.length > MAX_STAMPS) this.stamps.shift();
    this.renderAll();
  }

  setLightDirection(direction: LightDirection) {
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length < 0.001) return;
    this.lightDirection = direction.map(component => component / length) as LightDirection;
    this.renderAll();
  }

  setNoise(next: Partial<NoiseParams>) {
    this.noise = { ...this.noise, ...next };
    this.renderAll();
  }

  setColor(hex: string) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    this.color = hex;
    this.renderAll();
  }

  setShadowDepth(value: number) {
    this.shadowDepth = Math.max(0, Math.min(2, value));
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
    if (this.gl && this.program && this.stampTexture) {
      const gl = this.gl;
      const program = this.program;
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.stampTexture);
      gl.uniform1i(gl.getUniformLocation(program, "uStampData"), 0);
      gl.uniform1f(gl.getUniformLocation(program, "uRatio"), ratio);
      gl.uniform2f(gl.getUniformLocation(program, "uViewport"), cssWidth, cssHeight);
      gl.uniform3f(gl.getUniformLocation(program, "uLight"), ...this.lightDirection);
      gl.uniform3f(gl.getUniformLocation(program, "uColor"), ...colorChannels(this.color));
      gl.uniform1f(gl.getUniformLocation(program, "uShadowDepth"), this.shadowDepth);
      gl.uniform1f(gl.getUniformLocation(program, "uScale"), this.noise.scale);
      gl.uniform1i(gl.getUniformLocation(program, "uOctaves"), this.noise.octaves);
      gl.uniform1f(gl.getUniformLocation(program, "uRoughness"), this.noise.roughness);
      gl.uniform1f(gl.getUniformLocation(program, "uRelief"), this.noise.relief);
      gl.uniform1f(gl.getUniformLocation(program, "uSeed"), this.noise.seed);
      for (const group of this.overlappingGroups(cssWidth, cssHeight)) this.drawGroup(group, ratio);
      gl.disable(gl.BLEND);
    } else if (this.fallback) {
      this.renderFallback();
    }
  }

  private overlappingGroups(width: number, height: number): Stamp[][] {
    const groups: Stamp[][] = [];
    const touches = (a: Stamp, b: Stamp) =>
      Math.abs(a.x * width - b.x * width) < a.size + b.size + 18
      && Math.abs(a.y * height - b.y * height) < a.size + b.size + 18;
    for (const stamp of this.stamps) {
      const merged = [stamp];
      for (let index = 0; index < groups.length;) {
        if (merged.some(item => groups[index].some(other => touches(item, other)))) {
          merged.push(...groups[index]);
          groups.splice(index, 1);
          index = 0;
        } else index++;
      }
      groups.push(merged);
    }
    return groups;
  }

  private drawGroup(group: Stamp[], ratio: number) {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) return;
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;
    const data = new Float32Array(group.length * 4);
    let minX = cssWidth;
    let minY = cssHeight;
    let maxX = 0;
    let maxY = 0;
    group.forEach((stamp, index) => {
      const x = stamp.x * cssWidth;
      const y = stamp.y * cssHeight;
      const bound = stamp.size + 18;
      data.set([x, y, stamp.size,
        stamp.depth + (stamp.shape === "circle" ? 0 : stamp.shape === "square" ? 32 : 64)], index * 4);
      minX = Math.min(minX, x - bound);
      minY = Math.min(minY, y - bound);
      maxX = Math.max(maxX, x + bound);
      maxY = Math.max(maxY, y + bound);
    });
    const left = Math.max(0, Math.floor(minX * ratio));
    const bottom = Math.max(0, Math.floor((cssHeight - maxY) * ratio));
    const right = Math.min(this.canvas.width, Math.ceil(maxX * ratio));
    const top = Math.min(this.canvas.height, Math.ceil((cssHeight - minY) * ratio));
    if (right <= left || top <= bottom) return;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, group.length, 1, gl.RGBA, gl.FLOAT, data);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left, bottom, right - left, top - bottom);
    gl.uniform1i(gl.getUniformLocation(program, "uCount"), group.length);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
  }

  private renderFallback() {
    const context = this.fallback;
    if (!context) return;
    const ratio = this.canvas.width / this.canvas.clientWidth;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const channels = colorChannels(this.color);
    const tint = (brightness: number) => `rgb(${channels.map(channel => Math.round(channel * brightness * 255)).join(",")})`;
    for (const group of this.overlappingGroups(this.canvas.clientWidth, this.canvas.clientHeight)) {
      const path = new Path2D();
      let x = 0;
      let y = 0;
      let size = 0;
      let depth = 0;
      for (const stamp of group) {
        const stampX = stamp.x * this.canvas.width;
        const stampY = stamp.y * this.canvas.height;
        const stampSize = stamp.size * ratio;
        x += stampX;
        y += stampY;
        size = Math.max(size, stampSize);
        depth = Math.max(depth, stamp.depth);
        if (stamp.shape === "circle") path.moveTo(stampX + stampSize, stampY);
        if (stamp.shape === "circle") path.arc(stampX, stampY, stampSize, 0, Math.PI * 2);
        else if (stamp.shape === "square") path.rect(stampX - stampSize * 0.86, stampY - stampSize * 0.86, stampSize * 1.72, stampSize * 1.72);
        else {
          path.moveTo(stampX, stampY - stampSize);
          path.lineTo(stampX - stampSize * 0.866, stampY + stampSize * 0.5);
          path.lineTo(stampX + stampSize * 0.866, stampY + stampSize * 0.5);
          path.closePath();
        }
      }
      x /= group.length;
      y /= group.length;
      const lightX = this.lightDirection[0];
      const lightY = -this.lightDirection[1];
      const gradient = context.createLinearGradient(
        x + lightX * size, y + lightY * size,
        x - lightX * size, y - lightY * size,
      );
      gradient.addColorStop(0, tint(Math.max(0.15, 1 - this.shadowDepth * 0.77)));
      gradient.addColorStop(0.4, tint(Math.max(0.2, 1 - this.shadowDepth * 0.52)));
      gradient.addColorStop(1, tint(Math.max(0.25, 1 - this.shadowDepth * 0.32)));
      context.save();
      context.shadowColor = `rgba(36,40,43,${Math.min(this.shadowDepth * 0.65, 0.85)})`;
      context.shadowBlur = depth * ratio * 0.7;
      context.fillStyle = gradient;
      context.fill(path);
      context.restore();
    }
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    if (this.gl) {
      if (this.stampTexture) this.gl.deleteTexture(this.stampTexture);
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.vertexShader) this.gl.deleteShader(this.vertexShader);
      if (this.fragmentShader) this.gl.deleteShader(this.fragmentShader);
    }
  }
}
