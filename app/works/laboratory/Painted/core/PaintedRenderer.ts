const COLORS = [
  null, // Keep the supplied blue texture untouched on first load.
  "#7d917d", "#987e72", "#817b96", "#718998", "#9a8b78",
  "#708a83", "#987881", "#788097", "#929173", "#888b86",
];

function hexChannels(hex: string) {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
}

export class PaintedRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly image = new Image();
  private sourcePixels: Uint8ClampedArray | null = null;
  private meanLuminance = 0;
  private paletteIndex = 0;
  private resizeFrame: number | null = null;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D canvas is unavailable");
    this.context = context;

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize, { passive: true });
    this.image.onload = () => {
      if (!this.destroyed) this.resize();
    };
    this.image.src = "/painted-texture.jpg";
    this.resize();
  }

  changeColor() {
    const previous = this.paletteIndex;
    do {
      this.paletteIndex = 1 + Math.floor(Math.random() * (COLORS.length - 1));
    } while (this.paletteIndex === previous);
    this.paintColor();
  }

  private resize() {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      if (this.destroyed) return;
      const area = Math.max(1, this.canvas.clientWidth * this.canvas.clientHeight);
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / area));
      const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.sourcePixels = null;
      }
      if (this.image.complete && this.image.naturalWidth) {
        if (!this.sourcePixels) this.prepareTexture();
        this.paintColor();
      }
    });
  }

  private prepareTexture() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const tileWidth = this.image.naturalWidth;
    const tileHeight = this.image.naturalHeight;
    this.context.setTransform(1, 0, 0, 1, 0, 0);

    // Mirrored tiles meet at identical edge pixels, retaining the photographed
    // paint grain at native resolution without stretched or visible seams.
    for (let row = 0; row < Math.ceil(height / tileHeight); row += 1) {
      for (let column = 0; column < Math.ceil(width / tileWidth); column += 1) {
        const flipX = column % 2 === 1;
        const flipY = row % 2 === 1;
        this.context.save();
        this.context.translate(column * tileWidth + (flipX ? tileWidth : 0), row * tileHeight + (flipY ? tileHeight : 0));
        this.context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        this.context.drawImage(this.image, 0, 0);
        this.context.restore();
      }
    }

    this.sourcePixels = this.context.getImageData(0, 0, width, height).data;
    let luminance = 0;
    for (let index = 0; index < this.sourcePixels.length; index += 4) {
      luminance += this.sourcePixels[index] * 0.2126
        + this.sourcePixels[index + 1] * 0.7152
        + this.sourcePixels[index + 2] * 0.0722;
    }
    this.meanLuminance = luminance / (width * height);
  }

  private paintColor() {
    const source = this.sourcePixels;
    if (!source || this.paletteIndex === 0) return;
    const color = COLORS[this.paletteIndex];
    if (!color) return;
    const [red, green, blue] = hexChannels(color);
    const image = this.context.createImageData(this.canvas.width, this.canvas.height);
    const pixels = image.data;
    for (let index = 0; index < source.length; index += 4) {
      const luminance = source[index] * 0.2126
        + source[index + 1] * 0.7152
        + source[index + 2] * 0.0722;
      const grain = (luminance - this.meanLuminance) * 0.95;
      pixels[index] = red + grain;
      pixels[index + 1] = green + grain;
      pixels[index + 2] = blue + grain;
      pixels[index + 3] = 255;
    }
    this.context.putImageData(image, 0, 0);
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.resize);
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.image.onload = null;
  }
}
