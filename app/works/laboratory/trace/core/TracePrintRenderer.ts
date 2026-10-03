import { DEFAULT_LAYER_DEPTH, DEFAULT_LAYER_SHADOW, type ImpressionLayer } from "../../Foot-print/core/FootPrintRenderer";
import { generateSole, SOLE_OUTLINE } from "../../sole/core/generateSole";
import type { ProductTread } from "../../sole/core/productTreads";
import type { StepContact } from "../../to-step-on/core/StepPrints";

type ScreenPrint = NonNullable<StepContact["screen"]>;
type Print = { screen: ScreenPrint; product: ProductTread; seed: number; viewportWidth: number; viewportHeight: number };
const TEXTURE_WIDTH = 420;
const TEXTURE_HEIGHT = 1000;
const MAX_PRINTS = 48;

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
let outlineField: { inside: Uint8Array; distances: Float32Array } | null = null;

function getOutlineField() {
  if (outlineField) return outlineField;
  const width = TEXTURE_WIDTH, height = TEXTURE_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fill(new Path2D(SOLE_OUTLINE));
  const source = context.getImageData(0, 0, width, height);
  const inside = new Uint8Array(width * height);
  const distances = new Float32Array(width * height);
  for (let i = 0; i < inside.length; i++) {
    inside[i] = source.data[i * 4 + 3] >= 128 ? 1 : 0;
    distances[i] = inside[i] ? 1000 : 0;
  }
  // A two-pass chamfer distance gives the pressed outer wall a soft width.
  for (let y = 1; y < height; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    if (!inside[i]) continue;
    distances[i] = Math.min(distances[i], distances[i - 1] + 1, distances[i - width] + 1,
      distances[i - width - 1] + 1.414, distances[i - width + 1] + 1.414);
  }
  for (let y = height - 2; y >= 0; y--) for (let x = width - 2; x > 0; x--) {
    const i = y * width + x;
    if (!inside[i]) continue;
    distances[i] = Math.min(distances[i], distances[i + 1] + 1, distances[i + width] + 1,
      distances[i + width + 1] + 1.414, distances[i + width - 1] + 1.414);
  }
  outlineField = { inside, distances };
  return outlineField;
}

function shadeProduct(source: ImageData, depth: Record<"layer1" | "layer2", number>,
  shadow: Record<"layer1" | "layer2", number>, seed: number) {
  const width = TEXTURE_WIDTH, height = TEXTURE_HEIGHT;
  const { inside, distances } = getOutlineField();

  const image = new ImageData(width, height);
  const values = image.data;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!inside[i]) continue;
    const layer: ImpressionLayer = source.data[i * 4] < 128 ? "layer2" : "layer1";
    const grain = (Math.sin(x * 0.93 + y * 1.37 + seed) + Math.sin(x * 0.17 - y * 0.31)) * 2.3;
    const wall = Math.max(0, 1 - distances[i] / 14);
    const brightness = Math.max(85, Math.min(250, 251 - depth[layer] * 5.8 - shadow[layer] * 25 + grain - wall * 22));
    values[i * 4] = brightness;
    values[i * 4 + 1] = brightness + 1;
    values[i * 4 + 2] = brightness + 3;
    values[i * 4 + 3] = 255;
  }
  const color = document.createElement("canvas");
  color.width = width; color.height = height;
  color.getContext("2d")!.putImageData(image, 0, 0);
  const result = document.createElement("canvas");
  result.width = width; result.height = height;
  const context = result.getContext("2d")!;
  context.save();
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
      context.drawImage(texture, 0, 0);
      context.restore();
    }
  }

  destroy() { this.observer.disconnect(); this.prints.length = 0; this.textures.clear(); this.patterns.clear(); }
}
