import {
  DEFAULT_INSIDE_NOISE, DEFAULT_LAYER2_NOISE, DEFAULT_LAYER3_NOISE,
  DEFAULT_LAYER_DEPTH, DEFAULT_LAYER_SHADOW, type FootPrintShape, type ImpressionLayer,
} from "../../Foot-print/core/FootPrintRenderer";
import { DEFAULT_COLOR, DEFAULT_LIGHT_DIRECTION, type LightDirection, type NoiseParams } from "../../Painted/core/PaintedRenderer";
import { PAINTED_PERLIN_GLSL } from "../../Painted/core/paintedNoise";
import { generateSole, SOLE_OUTLINE } from "../../sole/core/generateSole";
import type { ProductTread } from "../../sole/core/productTreads";
import type { StepContact } from "../../to-step-on/core/StepPrints";

type ScreenPrint = NonNullable<StepContact["screen"]>;
export type TraceShape = "shoe" | FootPrintShape;
type Print = {
  screen: ScreenPrint; product: ProductTread; seed: number; width: number; height: number;
  shape: TraceShape; size: number; edgeLayer3: boolean;
};
const SOLE_WIDTH = 420, SOLE_HEIGHT = 1000, SCALE = 2, PAD = 56;
const FIELD_WIDTH = SOLE_WIDTH * SCALE + PAD * 2;
const FIELD_HEIGHT = SOLE_HEIGHT * SCALE + PAD * 2;
const VERTEX = `#version 300 es
layout(location = 0) in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform float uRatio, uDistanceScale, uImpressionScale, uSeed;
uniform vec2 uViewport, uCenter, uSide, uHeel;
uniform vec3 uDepth, uShadow, uScale, uRoughness, uRelief, uSeeds;
uniform ivec3 uOctaves;
uniform vec3 uLight, uColor1, uColor2, uColor3;
uniform int uShape;
uniform float uEdgeLayer3;
uniform sampler2D uOutline, uTread;
out vec4 outColor;
${PAINTED_PERLIN_GLSL}
vec2 soleUv(vec2 pixel) {
  vec2 p = pixel - uCenter;
  float det = uSide.x * uHeel.y - uSide.y * uHeel.x;
  return vec2(0.5 + (p.x * uHeel.y - p.y * uHeel.x) / det,
              0.5 + (uSide.x * p.y - uSide.y * p.x) / det);
}
struct Field { float distanceToEdge; float wallWidth; float black; float depth; };
Field impressionField(vec2 pixel) {
  vec2 uv = soleUv(pixel);
  vec2 fieldUv = (uv * vec2(${SOLE_WIDTH * SCALE}.0, ${SOLE_HEIGHT * SCALE}.0)
    + vec2(${PAD}.0)) / vec2(${FIELD_WIDTH}.0, ${FIELD_HEIGHT}.0);
  // All wall and shadow distances below are in a 400 px reference sole.
  float base = (texture(uOutline, fieldUv).r - 0.5) * 128.0 * uDistanceScale / uImpressionScale;
  vec2 world = ((pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5) / uImpressionScale;
  float fine = perlin(world / 6.0 + vec2(41.3));
  float broad = perlin(world / 17.0 + vec2(7.1));
  float shapeDistance = base;
  if (uShape != 0) {
    vec2 p = (pixel - uCenter) / uImpressionScale;
    float radius = min(length(uSide), length(uHeel)) * 0.48 / uImpressionScale;
    if (uShape == 1) shapeDistance = length(p) - radius;
    else if (uShape == 2) {
      vec2 q = abs(p) - vec2(radius * 0.86);
      shapeDistance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    } else {
      vec2 a = vec2(0.0, -radius);
      vec2 b = vec2(-0.8660254 * radius, 0.5 * radius);
      vec2 c = vec2(0.8660254 * radius, 0.5 * radius);
      vec2 ab = b - a, bc = c - b, ca = a - c;
      float da = length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
      float db = length(p - b - bc * clamp(dot(p - b, bc) / dot(bc, bc), 0.0, 1.0));
      float dc = length(p - c - ca * clamp(dot(p - c, ca) / dot(ca, ca), 0.0, 1.0));
      float s1 = ab.x * (p.y - a.y) - ab.y * (p.x - a.x);
      float s2 = bc.x * (p.y - b.y) - bc.y * (p.x - b.x);
      float s3 = ca.x * (p.y - c.y) - ca.y * (p.x - c.x);
      bool inside = (s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0)
        || (s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0);
      shapeDistance = (inside ? -1.0 : 1.0) * min(da, min(db, dc));
    }
  }
  float d = shapeDistance + fine * 2.2 + broad * 3.8;
  float wall = clamp(min(length(uSide), length(uHeel)) * 0.11 / uImpressionScale, 5.0, 12.0)
    * clamp(1.0 + fine * 0.32 + broad * 0.42, 0.7, 1.3);
  vec4 tread = texture(uTread, uv);
  float black = clamp((1.0 - tread.r) * tread.a, 0.0, 1.0);
  float edge3 = uEdgeLayer3 * smoothstep(-wall * 1.25, -wall * 0.25, d);
  return Field(d, wall, black, mix(mix(uDepth.x, uDepth.y, black), uDepth.z, edge3));
}
float interiorNoise(vec2 pixel, float scale, int octaves, float roughness, float seed) {
  vec2 world = (pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5;
  float frequency = 1.0, amplitude = 1.0, height = 0.0, total = 0.0;
  for (int octave = 0; octave < 6; octave++) {
    if (octave >= octaves || scale / frequency < 2.5 / uRatio) break;
    height += amplitude * perlinSeeded(world * frequency / scale + vec2(float(octave) * 29.7), seed);
    total += amplitude;
    frequency *= 2.0;
    amplitude *= roughness;
  }
  return height / max(total, 0.001);
}
float wallHeight(vec2 pixel) {
  Field f = impressionField(pixel);
  return -f.depth * (1.0 - smoothstep(-f.wallWidth, 2.0, f.distanceToEdge));
}
void main() {
  vec2 pixel = vec2(gl_FragCoord.x / uRatio, uViewport.y - gl_FragCoord.y / uRatio);
  Field f = impressionField(pixel);
  float d = f.distanceToEdge, wallWidth = f.wallWidth;
  if (d > 4.0) discard;
  float edge3 = uEdgeLayer3 * smoothstep(-wallWidth * 1.25, -wallWidth * 0.25, d);
  vec3 weights = vec3((1.0 - f.black) * (1.0 - edge3), f.black * (1.0 - edge3), edge3);
  float grain = 0.0;
  if (weights.x > 0.001) grain += weights.x * interiorNoise(pixel, uScale.x, uOctaves.x, uRoughness.x, uSeeds.x);
  if (weights.y > 0.001) grain += weights.y * interiorNoise(pixel, uScale.y, uOctaves.y, uRoughness.y, uSeeds.y);
  if (weights.z > 0.001) grain += weights.z * interiorNoise(pixel, uScale.z, uOctaves.z, uRoughness.z, uSeeds.z);
  float texturedSurface = 1.0 - smoothstep(-wallWidth * 2.0, 2.0, d);
  float wallSurface = -f.depth * (1.0 - smoothstep(-wallWidth, 2.0, d));
  float grainSurface = grain * dot(weights, uRelief) * 0.5 * texturedSurface;
  float height = wallSurface + grainSurface;
  // The indentation is model-sized, while the shared snow grain stays in CSS pixels.
  vec3 normal = normalize(vec3(
    -(dFdx(wallSurface) * uImpressionScale + dFdx(grainSurface)) * uRatio,
    -(dFdy(wallSurface) * uImpressionScale + dFdy(grainSurface)) * uRatio, 1.0));
  vec3 light = normalize(uLight);
  vec2 travelDirection = normalize(vec2(light.x, -light.y) + vec2(0.00001));
  float lightRise = max(light.z, 0.03) / max(length(light.xy), 0.03);
  float wallShadow = 0.0;
  if (d > -40.0) for (int i = 1; i <= 10; i++) {
    float travel = float(i) * 4.0;
    float obstruction = wallHeight(pixel + travelDirection * travel * uImpressionScale)
      - (height + travel * lightRise);
    wallShadow = max(wallShadow, smoothstep(0.2, 2.0, obstruction) * (1.0 - travel / 70.0));
  }
  float shadowDepth = dot(weights, uShadow);
  float bottom = 1.0 - smoothstep(-wallWidth * 1.5, -wallWidth * 0.45, d);
  float wall = smoothstep(-wallWidth, 2.0, d);
  vec3 snow = (uColor1 * weights.x + uColor2 * weights.y + uColor3 * weights.z)
    * mix(0.82 + grain * 0.18, 0.98, wall * 0.72);
  float diffuse = mix(1.0, 0.28 + 0.72 * max(dot(normal, light), 0.0), shadowDepth);
  vec3 color = snow * diffuse * (1.0 - 0.72 * min(shadowDepth, 1.0) * wallShadow * bottom);
  float alpha = 1.0 - smoothstep(-3.0, 4.5, d);
  outColor = vec4(color * alpha, alpha);
}`;

function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const result = gl.createShader(type);
  if (!result) throw new Error("Trace shader allocation failed");
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(`Trace shader: ${gl.getShaderInfoLog(result)}`);
  return result;
}

function distanceTo(inside: Uint8Array, targetInside: boolean) {
  const distance = new Float32Array(inside.length);
  for (let i = 0; i < distance.length; i++) distance[i] = Boolean(inside[i]) === targetInside ? 0 : 10000;
  for (let y = 1; y < FIELD_HEIGHT; y++) for (let x = 1; x < FIELD_WIDTH - 1; x++) {
    const i = y * FIELD_WIDTH + x;
    distance[i] = Math.min(distance[i], distance[i - 1] + 1, distance[i - FIELD_WIDTH] + 1,
      distance[i - FIELD_WIDTH - 1] + 1.414, distance[i - FIELD_WIDTH + 1] + 1.414);
  }
  for (let y = FIELD_HEIGHT - 2; y >= 0; y--) for (let x = FIELD_WIDTH - 2; x > 0; x--) {
    const i = y * FIELD_WIDTH + x;
    distance[i] = Math.min(distance[i], distance[i + 1] + 1, distance[i + FIELD_WIDTH] + 1,
      distance[i + FIELD_WIDTH + 1] + 1.414, distance[i + FIELD_WIDTH - 1] + 1.414);
  }
  return distance;
}

function outlinePixels(silhouette?: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_WIDTH; canvas.height = FIELD_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.translate(PAD, PAD);
  context.scale(SCALE, SCALE);
  if (silhouette) {
    // StepPrints maps texture X opposite the shoe's local X. Trace's lateral
    // screen basis is reversed, so mirror that same OBJ-derived mask once here.
    context.translate(SOLE_WIDTH, 0);
    context.scale(-1, 1);
    context.drawImage(silhouette, 0, 0, SOLE_WIDTH, SOLE_HEIGHT);
  } else context.fill(new Path2D(SOLE_OUTLINE));
  const image = context.getImageData(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  const inside = new Uint8Array(FIELD_WIDTH * FIELD_HEIGHT);
  for (let i = 0; i < inside.length; i++) inside[i] = image.data[i * 4 + 3] >= 128 ? 1 : 0;
  const outside = distanceTo(inside, false), insideDistance = distanceTo(inside, true);
  const pixels = new Uint8Array(inside.length);
  for (let i = 0; i < pixels.length; i++) {
    const d = inside[i] ? -outside[i] : insideDistance[i];
    pixels[i] = Math.round(Math.max(0, Math.min(255, 128 + d * 2)));
  }
  return pixels;
}

function paintProduct(product: ProductTread, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = SOLE_WIDTH; canvas.height = SOLE_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SOLE_WIDTH, SOLE_HEIGHT);
  for (const mark of generateSole(seed, product)) {
    ctx.save();
    if (mark.transform) {
      const values = mark.transform.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      if (values?.length === 3) {
        ctx.translate(values[1], values[2]);
        ctx.rotate(values[0] * Math.PI / 180);
        ctx.translate(-values[1], -values[2]);
      }
    }
    ctx.fillStyle = ctx.strokeStyle = mark.tone === "ink" ? "#111" : "#fff";
    const path = new Path2D(mark.d);
    if (mark.strokeWidth) {
      ctx.lineWidth = mark.strokeWidth; ctx.lineCap = ctx.lineJoin = "round"; ctx.stroke(path);
    } else ctx.fill(path);
    ctx.restore();
  }
  return canvas;
}

export class TracePrintRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertex: WebGLShader;
  private readonly fragment: WebGLShader;
  private readonly buffer: WebGLBuffer;
  private readonly outline: WebGLTexture;
  private modelOutline: WebGLTexture | null = null;
  private readonly products = new Map<string, WebGLTexture>();
  private readonly prints: Print[] = [];
  private readonly depth = { ...DEFAULT_LAYER_DEPTH };
  private readonly shadow = { ...DEFAULT_LAYER_SHADOW };
  private readonly noise: Record<ImpressionLayer, NoiseParams> = {
    layer1: { ...DEFAULT_INSIDE_NOISE },
    layer2: { ...DEFAULT_LAYER2_NOISE },
    layer3: { ...DEFAULT_LAYER3_NOISE },
  };
  private readonly colors: Record<ImpressionLayer, string> = {
    layer1: DEFAULT_COLOR, layer2: DEFAULT_COLOR, layer3: DEFAULT_COLOR,
  };
  private lightDirection: LightDirection = [...DEFAULT_LIGHT_DIRECTION];
  private readonly observer: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error("Trace requires WebGL2 for full-resolution snow impressions");
    this.gl = gl;
    this.vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
    this.fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!program) throw new Error("Trace program allocation failed");
    gl.attachShader(program, this.vertex); gl.attachShader(program, this.fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Trace link: ${gl.getProgramInfoLog(program)}`);
    this.program = program;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Trace geometry allocation failed");
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const outline = gl.createTexture();
    if (!outline) throw new Error("Trace outline allocation failed");
    this.outline = outline;
    this.uploadOutline(outline, outlinePixels());
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(canvas);
    this.render();
  }

  private uploadOutline(texture: WebGLTexture, pixels: Uint8Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FIELD_WIDTH, FIELD_HEIGHT, 0, gl.RED, gl.UNSIGNED_BYTE, pixels);
  }

  setSoleMask(silhouette: HTMLCanvasElement) {
    const texture = this.gl.createTexture();
    if (!texture) return;
    this.uploadOutline(texture, outlinePixels(silhouette));
    if (this.modelOutline) this.gl.deleteTexture(this.modelOutline);
    this.modelOutline = texture;
    this.canvas.dataset.soleOutline = "model";
    this.render();
  }

  stamp(contact: StepContact, product: ProductTread, seed: number,
    options: { shape?: TraceShape; size?: number; edgeLayer3?: boolean } = {}) {
    if (!contact.screen) return;
    this.prints.push({
      screen: contact.screen, product, seed, width: this.canvas.clientWidth, height: this.canvas.clientHeight,
      shape: options.shape ?? "shoe", size: options.size ?? 36, edgeLayer3: options.edgeLayer3 ?? false,
    });
    if (this.prints.length > 48) this.prints.shift();
    this.render();
  }
  setDepth(layer: ImpressionLayer, value: number) {
    this.depth[layer] = Math.max(0, Math.min(25, value)); this.render();
  }
  setShadow(layer: ImpressionLayer, value: number) {
    this.shadow[layer] = Math.max(0, Math.min(2, value)); this.render();
  }
  setNoise(layer: ImpressionLayer, next: Partial<NoiseParams>) {
    this.noise[layer] = { ...this.noise[layer], ...next }; this.render();
  }
  setColor(layer: ImpressionLayer, color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    this.colors[layer] = color; this.render();
  }
  setLightDirection(direction: LightDirection) {
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length < 0.001) return;
    this.lightDirection = direction.map(value => value / length) as LightDirection;
    this.render();
  }
  clear() { this.prints.length = 0; this.render(); }
  get count() { return this.prints.length; }

  private productTexture(product: ProductTread, seed: number) {
    const key = `${product}:${seed}`;
    const cached = this.products.get(key);
    if (cached) return cached;
    const gl = this.gl, texture = gl.createTexture();
    if (!texture) throw new Error("Trace tread allocation failed");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintProduct(product, seed));
    this.products.set(key, texture);
    return texture;
  }

  private render() {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3, Math.sqrt(12_000_000 / (width * height)));
    const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    }
    const gl = this.gl, program = this.program;
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(gl.getUniformLocation(program, "uRatio"), ratio);
    gl.uniform2f(gl.getUniformLocation(program, "uViewport"), width, height);
    gl.uniform3f(gl.getUniformLocation(program, "uDepth"), this.depth.layer1, this.depth.layer2, this.depth.layer3);
    gl.uniform3f(gl.getUniformLocation(program, "uShadow"), this.shadow.layer1, this.shadow.layer2, this.shadow.layer3);
    gl.uniform3f(gl.getUniformLocation(program, "uLight"), ...this.lightDirection);
    for (const [layer, suffix] of [["layer1", "1"], ["layer2", "2"], ["layer3", "3"]] as const) {
      const channels = [1, 3, 5].map(index => parseInt(this.colors[layer].slice(index, index + 2), 16) / 255);
      gl.uniform3f(gl.getUniformLocation(program, `uColor${suffix}`), channels[0], channels[1], channels[2]);
    }
    const a = this.noise.layer1, b = this.noise.layer2, c = this.noise.layer3;
    gl.uniform3f(gl.getUniformLocation(program, "uScale"), a.scale, b.scale, c.scale);
    gl.uniform3i(gl.getUniformLocation(program, "uOctaves"), a.octaves, b.octaves, c.octaves);
    gl.uniform3f(gl.getUniformLocation(program, "uRoughness"), a.roughness, b.roughness, c.roughness);
    gl.uniform3f(gl.getUniformLocation(program, "uRelief"), a.relief, b.relief, c.relief);
    gl.uniform3f(gl.getUniformLocation(program, "uSeeds"), a.seed, b.seed, c.seed);
    gl.uniform1f(gl.getUniformLocation(program, "uSeed"), DEFAULT_INSIDE_NOISE.seed);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.modelOutline ?? this.outline);
    gl.uniform1i(gl.getUniformLocation(program, "uOutline"), 0);
    for (const print of this.prints) {
      const sx = width / print.width, sy = height / print.height, s = print.screen;
      const x = s.x * sx, y = s.y * sy;
      // Trace's texture orientation is opposite the shoe decal's lateral axis.
      // A shoe impression must stay at the model's measured sole dimensions.
      // The size control belongs only to the optional geometric studies.
      const sizeScale = print.shape === "shoe" ? 1 : print.size / 36;
      const sideX = -s.sideX * sx * sizeScale, sideY = -s.sideY * sy * sizeScale;
      const heelX = s.heelX * sx * sizeScale, heelY = s.heelY * sy * sizeScale;
      const det = sideX * heelY - sideY * heelX;
      if (Math.abs(det) < 1) continue;
      gl.uniform2f(gl.getUniformLocation(program, "uCenter"), x, y);
      gl.uniform2f(gl.getUniformLocation(program, "uSide"), sideX, sideY);
      gl.uniform2f(gl.getUniformLocation(program, "uHeel"), heelX, heelY);
      const widthScale = Math.abs(det) / Math.hypot(heelX, heelY) / (SOLE_WIDTH * SCALE);
      const heightScale = Math.abs(det) / Math.hypot(sideX, sideY) / (SOLE_HEIGHT * SCALE);
      gl.uniform1f(gl.getUniformLocation(program, "uDistanceScale"), Math.min(widthScale, heightScale));
      const impressionScale = Math.max(0.35, Math.hypot(sideX, sideY) / 400);
      gl.uniform1f(gl.getUniformLocation(program, "uImpressionScale"), impressionScale);
      gl.uniform1i(gl.getUniformLocation(program, "uShape"), ["shoe", "circle", "square", "triangle"].indexOf(print.shape));
      gl.uniform1f(gl.getUniformLocation(program, "uEdgeLayer3"), print.edgeLayer3 ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.productTexture(print.product, print.seed));
      gl.uniform1i(gl.getUniformLocation(program, "uTread"), 1);
      const corners = [-1, 1].flatMap(a => [-1, 1].map(b => [x + (a * sideX + b * heelX) / 2, y + (a * sideY + b * heelY) / 2]));
      const margin = 40 * impressionScale;
      const left = Math.max(0, Math.floor((Math.min(...corners.map(c => c[0])) - margin) * ratio));
      const right = Math.min(pixelWidth, Math.ceil((Math.max(...corners.map(c => c[0])) + margin) * ratio));
      const bottom = Math.max(0, Math.floor((height - Math.max(...corners.map(c => c[1])) - margin) * ratio));
      const top = Math.min(pixelHeight, Math.ceil((height - Math.min(...corners.map(c => c[1])) + margin) * ratio));
      if (right <= left || top <= bottom) continue;
      gl.enable(gl.SCISSOR_TEST); gl.scissor(left, bottom, right - left, top - bottom);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.disable(gl.BLEND);
  }

  destroy() {
    this.observer.disconnect(); this.prints.length = 0;
    for (const texture of this.products.values()) this.gl.deleteTexture(texture);
    this.products.clear();
    this.gl.deleteTexture(this.outline);
    if (this.modelOutline) this.gl.deleteTexture(this.modelOutline);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program); this.gl.deleteShader(this.vertex); this.gl.deleteShader(this.fragment);
  }
}
