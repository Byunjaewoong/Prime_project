import { DEFAULT_LAYER_DEPTH, DEFAULT_LAYER_SHADOW } from "../../Foot-print/core/FootPrintRenderer";
import { generateSole, SOLE_OUTLINE } from "../../sole/core/generateSole";
import type { ProductTread } from "../../sole/core/productTreads";
import type { StepContact } from "../../to-step-on/core/StepPrints";

type ScreenPrint = NonNullable<StepContact["screen"]>;
type Print = { screen: ScreenPrint; product: ProductTread; seed: number; viewportWidth: number; viewportHeight: number };
const TEXTURE_WIDTH = 420;
const TEXTURE_HEIGHT = 1000;
const PADDING = 28;
const RASTER_WIDTH = TEXTURE_WIDTH + PADDING * 2;
const RASTER_HEIGHT = TEXTURE_HEIGHT + PADDING * 2;
const MAX_PRINTS = 48;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const smoothstep = (low: number, high: number, value: number) => {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smoothstep(0, 1, x - ix), fy = smoothstep(0, 1, y - iy);
  const hash = (a: number, b: number) => {
    let value = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const top = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx;
  const bottom = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

function paintProduct(product: ProductTread, seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH; canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Trace print canvas is unavailable");
  const outline = new Path2D(SOLE_OUTLINE);
  context.fillStyle = "#fff";
  context.fill(outline);
  context.clip(outline);
  for (const mark of generateSole(seed, product)) {
    context.save();
    if (mark.transform) {
      const values = mark.transform.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      if (values?.length === 3) {
        context.translate(values[1], values[2]);
        context.rotate(values[0] * Math.PI / 180);
        context.translate(-values[1], -values[2]);
      }
    }
    context.fillStyle = context.strokeStyle = mark.tone === "ink" ? "#111" : "#fff";
    const path = new Path2D(mark.d);
    if (mark.strokeWidth) {
      context.lineWidth = mark.strokeWidth;
      context.lineCap = context.lineJoin = "round";
      context.stroke(path);
    } else context.fill(path);
    context.restore();
  }
  return context.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
}

// The same outline and three depth presets as Foot print, with the rasterized
// Sole black/white values choosing layer 2/1 for every pixel of the impression.
let outlineField: { distance: Float32Array; relief: Float32Array } | null = null;

function distanceTo(inside: Uint8Array, targetInside: boolean) {
  const width = RASTER_WIDTH, height = RASTER_HEIGHT;
  const distances = new Float32Array(width * height);
  for (let i = 0; i < distances.length; i++) distances[i] = Boolean(inside[i]) === targetInside ? 0 : 10000;
  for (let y = 1; y < height; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    distances[i] = Math.min(distances[i], distances[i - 1] + 1, distances[i - width] + 1,
      distances[i - width - 1] + 1.414, distances[i - width + 1] + 1.414);
  }
  for (let y = height - 2; y >= 0; y--) for (let x = width - 2; x > 0; x--) {
    const i = y * width + x;
    distances[i] = Math.min(distances[i], distances[i + 1] + 1, distances[i + width] + 1,
      distances[i + width + 1] + 1.414, distances[i + width - 1] + 1.414);
  }
  return distances;
}

function getOutlineField() {
  if (outlineField) return outlineField;
  const width = RASTER_WIDTH, height = RASTER_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.translate(PADDING, PADDING);
  context.fill(new Path2D(SOLE_OUTLINE));
  const source = context.getImageData(0, 0, width, height);
  const inside = new Uint8Array(width * height);
  for (let i = 0; i < inside.length; i++) inside[i] = source.data[i * 4 + 3] >= 128 ? 1 : 0;
  const toOutside = distanceTo(inside, false);
  const toInside = distanceTo(inside, true);
  const distance = new Float32Array(width * height);
  const relief = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const fine = noise(x / 6, y / 6), broad = noise(x / 17, y / 17);
    distance[i] = (inside[i] ? -toOutside[i] : toInside[i]) + fine * 2.2 + broad * 3.8;
    relief[i] = fine * 0.32 + broad * 0.42;
  }
  outlineField = { distance, relief };
  return outlineField;
}

function shadeProduct(source: ImageData, depth: Record<"layer1" | "layer2", number>,
  shadow: Record<"layer1" | "layer2", number>, seed: number) {
  const width = RASTER_WIDTH, height = RASTER_HEIGHT;
  const { distance, relief } = getOutlineField();
  const heights = new Float32Array(width * height);
  const outerHeights = new Float32Array(width * height);
  const layerMix = new Float32Array(width * height);
  for (let y = PADDING; y < height - PADDING; y++) for (let x = PADDING; x < width - PADDING; x++) {
    const i = y * width + x;
    const px = x - PADDING, py = y - PADDING;
    let black = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const sx = clamp(px + ox, 0, TEXTURE_WIDTH - 1);
      const sy = clamp(py + oy, 0, TEXTURE_HEIGHT - 1);
      const index = (sy * TEXTURE_WIDTH + sx) * 4;
      black += source.data[index + 3] < 128 ? 0 : 1 - source.data[index] / 255;
    }
    layerMix[i] = black / 9;
  }
  for (let i = 0; i < heights.length; i++) {
    const wallWidth = clamp(12 * (1 + relief[i]), 7, 16);
    const localDepth = depth.layer1 + layerMix[i] * (depth.layer2 - depth.layer1);
    const impression = 1 - smoothstep(-wallWidth, 2, distance[i]);
    heights[i] = -localDepth * impression;
    outerHeights[i] = -Math.max(depth.layer1, depth.layer2 * 0.6) * impression;
  }
  const image = new ImageData(width, height);
  const values = image.data;
  const light = [-0.05, -0.98, 0.2];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const d = distance[i];
    if (d > 4.5) continue;
    const wallWidth = clamp(12 * (1 + relief[i]), 7, 16);
    const normalX = -(heights[i + 1] - heights[i - 1]) * 0.5;
    const normalY = -(heights[i + width] - heights[i - width]) * 0.5;
    const normalLength = Math.hypot(normalX, normalY, 1);
    const lambert = Math.max(0, (normalX * light[0] + normalY * light[1] + light[2]) / normalLength);
    const localShadow = shadow.layer1 + layerMix[i] * (shadow.layer2 - shadow.layer1);
    const diffuse = 1 - localShadow * (1 - (0.28 + 0.72 * lambert));
    let occlusion = 0;
    if (d > -32 && d < 4) {
      for (let sample = 1; sample <= 10; sample++) {
        const travel = sample * 4;
        const sx = clamp(Math.round(x + light[0] * travel), 0, width - 1);
        const sy = clamp(Math.round(y + light[1] * travel), 0, height - 1);
        const obstruction = outerHeights[sy * width + sx] - (outerHeights[i] + travel * 0.2);
        occlusion = Math.max(occlusion, smoothstep(0.2, 2, obstruction) * (1 - travel / 70));
      }
    }
    const bottom = 1 - smoothstep(-wallWidth * 1.5, -wallWidth * 0.45, d);
    const grain = (Math.sin(x * 0.93 + y * 1.37 + seed) + relief[i] * 1.8) * 2.2;
    const wall = smoothstep(-wallWidth, 2, d);
    const wallBand = smoothstep(-wallWidth * 1.3, -wallWidth * 0.55, d) * (1 - smoothstep(-1, 3, d));
    const snow = (244 + grain) * (1 - wall * 0.02);
    const brightness = clamp(snow * diffuse * (1 - 0.72 * Math.min(localShadow, 1) * occlusion * bottom)
      * (1 - 0.14 * wallBand), 70, 255);
    values[i * 4] = brightness;
    values[i * 4 + 1] = brightness + 1;
    values[i * 4 + 2] = brightness + 3;
    values[i * 4 + 3] = 255 * (1 - smoothstep(-3, 4.5, d));
  }
  const color = document.createElement("canvas");
  color.width = width; color.height = height;
  color.getContext("2d")!.putImageData(image, 0, 0);
  const result = document.createElement("canvas");
  result.width = width; result.height = height;
  const context = result.getContext("2d")!;
  context.save();
  context.translate(PADDING, PADDING);
  context.shadowColor = "rgba(45,49,53,.38)";
  context.shadowBlur = 17;
  context.shadowOffsetX = 5;
  context.shadowOffsetY = 7;
  context.fillStyle = "#ddd";
  context.fill(new Path2D(SOLE_OUTLINE));
  context.restore();
  context.drawImage(color, 0, 0);
  return result;
}

export class TracePrintRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly prints: Print[] = [];
  private readonly textures = new Map<string, HTMLCanvasElement>();
  private readonly patterns = new Map<string, ImageData>();
  private readonly depth = { layer1: DEFAULT_LAYER_DEPTH.layer1, layer2: DEFAULT_LAYER_DEPTH.layer2 };
  private readonly shadow = { layer1: DEFAULT_LAYER_SHADOW.layer1, layer2: DEFAULT_LAYER_SHADOW.layer2 };
  private readonly observer: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Trace canvas is unavailable");
    this.context = context;
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(canvas);
    this.render();
  }

  stamp(contact: StepContact, product: ProductTread, seed: number) {
    if (!contact.screen) return;
    this.prints.push({ screen: contact.screen, product, seed, viewportWidth: this.canvas.clientWidth, viewportHeight: this.canvas.clientHeight });
    if (this.prints.length > MAX_PRINTS) this.prints.shift();
    this.render();
  }

  setDepth(layer: "layer1" | "layer2", value: number) {
    this.depth[layer] = Math.max(0, Math.min(25, value));
    this.textures.clear(); this.render();
  }

  setShadow(layer: "layer1" | "layer2", value: number) {
    this.shadow[layer] = Math.max(0, Math.min(2, value));
    this.textures.clear(); this.render();
  }

  clear() { this.prints.length = 0; this.render(); }
  get count() { return this.prints.length; }

  private render() {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
    }
    const context = this.context;
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    for (const print of this.prints) {
      const scaleX = width / print.viewportWidth;
      const scaleY = height / print.viewportHeight;
      const { screen } = print;
      const x = screen.x * scaleX, y = screen.y * scaleY;
      const sideX = screen.sideX * scaleX, sideY = screen.sideY * scaleY;
      const heelX = screen.heelX * scaleX, heelY = screen.heelY * scaleY;
      const key = `${print.product}:${print.seed}`;
      let texture = this.textures.get(key);
      if (!texture) {
        let pattern = this.patterns.get(key);
        if (!pattern) { pattern = paintProduct(print.product, print.seed); this.patterns.set(key, pattern); }
        texture = shadeProduct(pattern, this.depth, this.shadow, print.seed);
        this.textures.set(key, texture);
      }
      context.save();
      context.setTransform(ratio * sideX / TEXTURE_WIDTH, ratio * sideY / TEXTURE_WIDTH,
        ratio * heelX / TEXTURE_HEIGHT, ratio * heelY / TEXTURE_HEIGHT,
        ratio * (x - (sideX + heelX) / 2), ratio * (y - (sideY + heelY) / 2));
      context.drawImage(texture, -PADDING, -PADDING);
      context.restore();
    }
  }

  destroy() { this.observer.disconnect(); this.prints.length = 0; this.textures.clear(); this.patterns.clear(); }
}
