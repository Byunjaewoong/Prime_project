import { DEFAULT_COLOR, DEFAULT_LIGHT_DIRECTION, DEFAULT_NOISE, type LightDirection, type NoiseParams } from "../../Painted/core/PaintedRenderer";
import { PAINTED_PERLIN_GLSL } from "../../Painted/core/paintedNoise";

export type FootPrintShape = "circle" | "square" | "triangle";
export type ImpressionLayer = "layer1" | "layer2" | "layer3";
export const IMPRESSION_LAYERS: ImpressionLayer[] = ["layer1", "layer2", "layer3"];
export const DEFAULT_LAYER_DEPTH: Record<ImpressionLayer, number> = { layer1: 4, layer2: 10, layer3: 20 };
export const DEFAULT_LAYER_SHADOW: Record<ImpressionLayer, number> = { layer1: 0.25, layer2: 0.5, layer3: 0.8 };

type Stamp = { x: number; y: number; shape: FootPrintShape; size: number; depth: number; layer: ImpressionLayer };
type SurfaceSettings = { noise: NoiseParams; color: string; shadowDepth: number };
const MAX_STAMPS = 120;
export const DEFAULT_INSIDE_NOISE: NoiseParams = { ...DEFAULT_NOISE, scale: 28, roughness: 0.6 };
export const DEFAULT_LAYER2_NOISE: NoiseParams = { ...DEFAULT_INSIDE_NOISE, scale: 20, seed: 73 };
export const DEFAULT_LAYER3_NOISE: NoiseParams = { ...DEFAULT_INSIDE_NOISE, scale: 40, seed: 19 };

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
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uShadowDepth1;
uniform float uShadowDepth2;
uniform float uShadowDepth3;
uniform float uScale1;
uniform float uScale2;
uniform float uScale3;
uniform int uOctaves1;
uniform int uOctaves2;
uniform int uOctaves3;
uniform float uRoughness1;
uniform float uRoughness2;
uniform float uRoughness3;
uniform float uRelief1;
uniform float uRelief2;
uniform float uRelief3;
uniform float uSeed1;
uniform float uSeed2;
uniform float uSeed3;
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
  int shape = int(floor(stamp.w / 32.0 + 0.0001)) % 3;
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

struct ImpressionField {
  float distanceToEdge;
  float depth;
  float wallWidth;
  float layer2Mix;
  float layer3Mix;
};

ImpressionField unionField(vec2 pixel) {
  vec2 world = (pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5;
  float fineEdge = perlin(world / 6.0 + vec2(41.3));
  float broadEdge = perlin(world / 17.0 + vec2(7.1));
  float edgeWarp = fineEdge * 2.2 + broadEdge * 3.8;
  float distanceToEdge = 100000.0;
  float depthSum = 0.0;
  float wallSum = 0.0;
  float weightSum = 0.0;
  float layer2Sum = 0.0;
  float layer3Sum = 0.0;
  for (int index = 0; index < ${MAX_STAMPS}; index++) {
    if (index >= uCount) break;
    vec4 stamp = texelFetch(uStampData, ivec2(index, 0), 0);
    float distance = shapeDistance(pixel, stamp) + edgeWarp;
    distanceToEdge = index == 0 ? distance : smoothMin(distanceToEdge, distance, 7.0);
    float weight = 1.0 - smoothstep(-4.0, 8.0, distance);
    int code = int(floor(stamp.w / 32.0 + 0.0001));
    depthSum += (stamp.w - float(code) * 32.0) * weight;
    wallSum += clamp(stamp.z * 0.22, 5.0, 12.0) * weight;
    weightSum += weight;
    layer2Sum += float(code >= 3 && code < 6) * weight;
    layer3Sum += float(code >= 6) * weight;
  }
  float wallWidth = wallSum / max(weightSum, 0.0001);
  wallWidth *= clamp(1.0 + fineEdge * 0.32 + broadEdge * 0.42, 0.7, 1.3);
  return ImpressionField(distanceToEdge, depthSum / max(weightSum, 0.0001), wallWidth,
    layer2Sum / max(weightSum, 0.0001), layer3Sum / max(weightSum, 0.0001));
}

float wallHeight(vec2 pixel) {
  ImpressionField field = unionField(pixel);
  float wallWidth = max(field.wallWidth, 5.0);
  return -field.depth * (1.0 - smoothstep(-wallWidth, 2.0, field.distanceToEdge));
}

float interiorNoise(vec2 pixel, float scale, int octaves, float roughness, float seed) {
  // Each impression samples the same Painted Perlin field with its own controls.
  vec2 world = (pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5;
  float frequency = 1.0;
  float amplitude = 1.0;
  float height = 0.0;
  float total = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= octaves || scale / frequency < 2.5 / uRatio) break;
    height += amplitude * perlinSeeded(world * frequency / scale + vec2(float(octave) * 29.7), seed);
    total += amplitude;
    frequency *= 2.0;
    amplitude *= roughness;
  }
  return height / max(total, 0.001);
}

void main() {
  vec2 pixel = vec2(gl_FragCoord.x / uRatio, uViewport.y - gl_FragCoord.y / uRatio);
  ImpressionField field = unionField(pixel);
  float distanceToEdge = field.distanceToEdge;
  float layer2Mix = clamp(field.layer2Mix, 0.0, 1.0);
  float layer3Mix = clamp(field.layer3Mix, 0.0, 1.0);
  float layer1Mix = max(0.0, 1.0 - layer2Mix - layer3Mix);
  vec3 layerWeights = vec3(layer1Mix, layer2Mix, layer3Mix);
  layerWeights /= max(dot(layerWeights, vec3(1.0)), 0.0001);
  layer1Mix = layerWeights.x;
  layer2Mix = layerWeights.y;
  layer3Mix = layerWeights.z;
  float wallWidth = max(field.wallWidth, 5.0);
  float bottom = 1.0 - smoothstep(-wallWidth * 1.5, -wallWidth * 0.45, distanceToEdge);
  float texturedSurface = 1.0 - smoothstep(-wallWidth * 2.0, 2.0, distanceToEdge);
  float grain = 0.0;
  if (layer1Mix > 0.001) grain += layer1Mix * interiorNoise(pixel, uScale1, uOctaves1, uRoughness1, uSeed1);
  if (layer2Mix > 0.001) grain += layer2Mix * interiorNoise(pixel, uScale2, uOctaves2, uRoughness2, uSeed2);
  if (layer3Mix > 0.001) grain += layer3Mix * interiorNoise(pixel, uScale3, uOctaves3, uRoughness3, uSeed3);
  float relief = dot(layerWeights, vec3(uRelief1, uRelief2, uRelief3));
  float shadowDepth = dot(layerWeights, vec3(uShadowDepth1, uShadowDepth2, uShadowDepth3));
  float height = -field.depth * (1.0 - smoothstep(-wallWidth, 2.0, distanceToEdge))
    + grain * relief * 0.5 * texturedSurface;
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
  vec3 snow = (uColor1 * layer1Mix + uColor2 * layer2Mix + uColor3 * layer3Mix)
    * mix(0.82 + grain * 0.18, 0.98, wall * 0.72);
  float diffuse = mix(1.0, 0.28 + 0.72 * max(dot(normal, light), 0.0), shadowDepth);
  vec3 color = snow * diffuse * (1.0 - 0.72 * min(shadowDepth, 1.0) * wallShadow * bottom);
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
  private readonly surfaces: Record<ImpressionLayer, SurfaceSettings> = {
    layer1: { noise: { ...DEFAULT_INSIDE_NOISE }, color: DEFAULT_COLOR, shadowDepth: DEFAULT_LAYER_SHADOW.layer1 },
    layer2: { noise: { ...DEFAULT_LAYER2_NOISE }, color: DEFAULT_COLOR, shadowDepth: DEFAULT_LAYER_SHADOW.layer2 },
    layer3: { noise: { ...DEFAULT_LAYER3_NOISE }, color: DEFAULT_COLOR, shadowDepth: DEFAULT_LAYER_SHADOW.layer3 },
  };
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

  stamp(x: number, y: number, shape: FootPrintShape, size: number, depth: number, layer: ImpressionLayer) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.stamps.push({ x: x / width, y: y / height, shape, size, depth, layer });
    if (this.stamps.length > MAX_STAMPS) this.stamps.shift();
    this.renderAll();
  }

  setLightDirection(direction: LightDirection) {
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length < 0.001) return;
    this.lightDirection = direction.map(component => component / length) as LightDirection;
    this.renderAll();
  }

  setNoise(layer: ImpressionLayer, next: Partial<NoiseParams>) {
    this.surfaces[layer].noise = { ...this.surfaces[layer].noise, ...next };
    this.renderAll();
  }

  setColor(layer: ImpressionLayer, hex: string) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    this.surfaces[layer].color = hex;
    this.renderAll();
  }

  setShadowDepth(layer: ImpressionLayer, value: number) {
    this.surfaces[layer].shadowDepth = Math.max(0, Math.min(2, value));
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
      // Keep the impression edge stable while each interior layer varies independently.
      gl.uniform1f(gl.getUniformLocation(program, "uSeed"), DEFAULT_INSIDE_NOISE.seed);
      for (const [layer, suffix] of [["layer1", "1"], ["layer2", "2"], ["layer3", "3"]] as const) {
        const { noise, color, shadowDepth } = this.surfaces[layer];
        gl.uniform3f(gl.getUniformLocation(program, `uColor${suffix}`), ...colorChannels(color));
        gl.uniform1f(gl.getUniformLocation(program, `uShadowDepth${suffix}`), shadowDepth);
        gl.uniform1f(gl.getUniformLocation(program, `uScale${suffix}`), noise.scale);
        gl.uniform1i(gl.getUniformLocation(program, `uOctaves${suffix}`), noise.octaves);
        gl.uniform1f(gl.getUniformLocation(program, `uRoughness${suffix}`), noise.roughness);
        gl.uniform1f(gl.getUniformLocation(program, `uRelief${suffix}`), noise.relief);
        gl.uniform1f(gl.getUniformLocation(program, `uSeed${suffix}`), noise.seed);
      }
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
      const shapeIndex = stamp.shape === "circle" ? 0 : stamp.shape === "square" ? 1 : 2;
      const layerIndex = IMPRESSION_LAYERS.indexOf(stamp.layer);
      // Depth stays below 32; the remaining bands retain shape and texture per stamp.
      data.set([x, y, stamp.size, stamp.depth + (shapeIndex + layerIndex * 3) * 32], index * 4);
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
    for (const group of this.overlappingGroups(this.canvas.clientWidth, this.canvas.clientHeight)) {
      for (const layer of IMPRESSION_LAYERS) {
        const layerStamps = group.filter(stamp => stamp.layer === layer);
        if (!layerStamps.length) continue;
        const { color, shadowDepth } = this.surfaces[layer];
        const channels = colorChannels(color);
        const tint = (brightness: number) => `rgb(${channels.map(channel => Math.round(channel * brightness * 255)).join(",")})`;
        const path = new Path2D();
        let x = 0;
        let y = 0;
        let size = 0;
        let depth = 0;
        for (const stamp of layerStamps) {
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
        x /= layerStamps.length;
        y /= layerStamps.length;
        const lightX = this.lightDirection[0];
        const lightY = -this.lightDirection[1];
        const gradient = context.createLinearGradient(
          x + lightX * size, y + lightY * size,
          x - lightX * size, y - lightY * size,
        );
        gradient.addColorStop(0, tint(Math.max(0.15, 1 - shadowDepth * 0.77)));
        gradient.addColorStop(0.4, tint(Math.max(0.2, 1 - shadowDepth * 0.52)));
        gradient.addColorStop(1, tint(Math.max(0.25, 1 - shadowDepth * 0.32)));
        context.save();
        context.shadowColor = `rgba(36,40,43,${Math.min(shadowDepth * 0.65, 0.85)})`;
        context.shadowBlur = depth * ratio * 0.7;
        context.fillStyle = gradient;
        context.fill(path);
        context.restore();
      }
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
