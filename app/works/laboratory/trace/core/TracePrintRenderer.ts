import { DEFAULT_INSIDE_NOISE, DEFAULT_LAYER2_NOISE, DEFAULT_LAYER_DEPTH, DEFAULT_LAYER_SHADOW } from "../../Foot-print/core/FootPrintRenderer";
import { DEFAULT_COLOR, DEFAULT_LIGHT_DIRECTION } from "../../Painted/core/PaintedRenderer";
import { PAINTED_PERLIN_GLSL } from "../../Painted/core/paintedNoise";
import { generateSole, SOLE_OUTLINE } from "../../sole/core/generateSole";
import type { ProductTread } from "../../sole/core/productTreads";
import type { StepContact } from "../../to-step-on/core/StepPrints";

type ScreenPrint = NonNullable<StepContact["screen"]>;
type Print = { screen: ScreenPrint; product: ProductTread; seed: number; width: number; height: number };
const SOLE_WIDTH = 420, SOLE_HEIGHT = 1000, SCALE = 2, PAD = 56;
const FIELD_WIDTH = SOLE_WIDTH * SCALE + PAD * 2;
const FIELD_HEIGHT = SOLE_HEIGHT * SCALE + PAD * 2;
const VERTEX = `#version 300 es
layout(location = 0) in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform float uRatio, uDistanceScale, uSeed;
uniform vec2 uViewport, uCenter, uSide, uHeel, uDepth, uShadow;
uniform vec3 uLight, uColor;
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
  float base = (texture(uOutline, fieldUv).r - 0.5) * 128.0 * uDistanceScale;
  vec2 world = (pixel - uViewport * 0.5) * 2.0 + uViewport * 0.5;
  float fine = perlin(world / 6.0 + vec2(41.3));
  float broad = perlin(world / 17.0 + vec2(7.1));
  float d = base + fine * 2.2 + broad * 3.8;
  float wall = clamp(min(length(uSide), length(uHeel)) * 0.11, 5.0, 12.0)
    * clamp(1.0 + fine * 0.32 + broad * 0.42, 0.7, 1.3);
  vec4 tread = texture(uTread, uv);
  float black = clamp((1.0 - tread.r) * tread.a, 0.0, 1.0);
  return Field(d, wall, black, mix(uDepth.x, uDepth.y, black));
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
  float grain1 = interiorNoise(pixel, ${DEFAULT_INSIDE_NOISE.scale}.0, ${DEFAULT_INSIDE_NOISE.octaves},
    ${DEFAULT_INSIDE_NOISE.roughness}, ${DEFAULT_INSIDE_NOISE.seed}.0);
  float grain2 = interiorNoise(pixel, ${DEFAULT_LAYER2_NOISE.scale}.0, ${DEFAULT_LAYER2_NOISE.octaves},
    ${DEFAULT_LAYER2_NOISE.roughness}, ${DEFAULT_LAYER2_NOISE.seed}.0);
  float grain = mix(grain1, grain2, f.black);
  float texturedSurface = 1.0 - smoothstep(-wallWidth * 2.0, 2.0, d);
  float height = -f.depth * (1.0 - smoothstep(-wallWidth, 2.0, d))
    + grain * ${DEFAULT_INSIDE_NOISE.relief}.0 * 0.5 * texturedSurface;
  vec3 normal = normalize(vec3(-dFdx(height) * uRatio, -dFdy(height) * uRatio, 1.0));
  vec3 light = normalize(uLight);
  vec2 travelDirection = normalize(vec2(light.x, -light.y) + vec2(0.00001));
  float lightRise = max(light.z, 0.03) / max(length(light.xy), 0.03);
  float wallShadow = 0.0;
  if (d > -40.0) for (int i = 1; i <= 10; i++) {
    float travel = float(i) * 4.0;
    float obstruction = wallHeight(pixel + travelDirection * travel) - (height + travel * lightRise);
    wallShadow = max(wallShadow, smoothstep(0.2, 2.0, obstruction) * (1.0 - travel / 70.0));
  }
  float shadowDepth = mix(uShadow.x, uShadow.y, f.black);
  float bottom = 1.0 - smoothstep(-wallWidth * 1.5, -wallWidth * 0.45, d);
  float wall = smoothstep(-wallWidth, 2.0, d);
  vec3 snow = uColor * mix(0.82 + grain * 0.18, 0.98, wall * 0.72);
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

function outlinePixels() {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD_WIDTH; canvas.height = FIELD_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.translate(PAD, PAD);
  context.scale(SCALE, SCALE);
  context.fill(new Path2D(SOLE_OUTLINE));
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
  const outline = new Path2D(SOLE_OUTLINE);
  ctx.fillStyle = "#fff";
  ctx.fill(outline);
  ctx.clip(outline);
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
  private readonly products = new Map<string, WebGLTexture>();
  private readonly prints: Print[] = [];
  private readonly depth = { layer1: DEFAULT_LAYER_DEPTH.layer1, layer2: DEFAULT_LAYER_DEPTH.layer2 };
  private readonly shadow = { layer1: DEFAULT_LAYER_SHADOW.layer1, layer2: DEFAULT_LAYER_SHADOW.layer2 };
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
    gl.bindTexture(gl.TEXTURE_2D, outline);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FIELD_WIDTH, FIELD_HEIGHT, 0, gl.RED, gl.UNSIGNED_BYTE, outlinePixels());
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(canvas);
    this.render();
  }

  stamp(contact: StepContact, product: ProductTread, seed: number) {
    if (!contact.screen) return;
    this.prints.push({ screen: contact.screen, product, seed, width: this.canvas.clientWidth, height: this.canvas.clientHeight });
    if (this.prints.length > 48) this.prints.shift();
    this.render();
  }
  setDepth(layer: "layer1" | "layer2", value: number) {
    this.depth[layer] = Math.max(0, Math.min(25, value)); this.render();
  }
  setShadow(layer: "layer1" | "layer2", value: number) {
    this.shadow[layer] = Math.max(0, Math.min(2, value)); this.render();
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
    gl.uniform2f(gl.getUniformLocation(program, "uDepth"), this.depth.layer1, this.depth.layer2);
    gl.uniform2f(gl.getUniformLocation(program, "uShadow"), this.shadow.layer1, this.shadow.layer2);
    gl.uniform3f(gl.getUniformLocation(program, "uLight"), ...DEFAULT_LIGHT_DIRECTION);
    const color = [1, 3, 5].map(index => parseInt(DEFAULT_COLOR.slice(index, index + 2), 16) / 255);
    gl.uniform3f(gl.getUniformLocation(program, "uColor"), color[0], color[1], color[2]);
    gl.uniform1f(gl.getUniformLocation(program, "uSeed"), DEFAULT_INSIDE_NOISE.seed);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.outline);
    gl.uniform1i(gl.getUniformLocation(program, "uOutline"), 0);
    for (const print of this.prints) {
      const sx = width / print.width, sy = height / print.height, s = print.screen;
      const x = s.x * sx, y = s.y * sy;
      // Trace's texture orientation is opposite the shoe decal's lateral axis.
      const sideX = -s.sideX * sx, sideY = -s.sideY * sy;
      const heelX = s.heelX * sx, heelY = s.heelY * sy;
      const det = sideX * heelY - sideY * heelX;
      if (Math.abs(det) < 1) continue;
      gl.uniform2f(gl.getUniformLocation(program, "uCenter"), x, y);
      gl.uniform2f(gl.getUniformLocation(program, "uSide"), sideX, sideY);
      gl.uniform2f(gl.getUniformLocation(program, "uHeel"), heelX, heelY);
      const widthScale = Math.abs(det) / Math.hypot(heelX, heelY) / (SOLE_WIDTH * SCALE);
      const heightScale = Math.abs(det) / Math.hypot(sideX, sideY) / (SOLE_HEIGHT * SCALE);
      gl.uniform1f(gl.getUniformLocation(program, "uDistanceScale"), Math.min(widthScale, heightScale));
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.productTexture(print.product, print.seed));
      gl.uniform1i(gl.getUniformLocation(program, "uTread"), 1);
      const corners = [-1, 1].flatMap(a => [-1, 1].map(b => [x + (a * sideX + b * heelX) / 2, y + (a * sideY + b * heelY) / 2]));
      const margin = 40;
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
    this.gl.deleteTexture(this.outline); this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program); this.gl.deleteShader(this.vertex); this.gl.deleteShader(this.fragment);
  }
}
