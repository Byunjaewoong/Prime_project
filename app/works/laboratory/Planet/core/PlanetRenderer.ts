type Vec3 = { x: number; y: number; z: number };
type Palette = { red: number; green: number; blue: number };

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function randomAxis(): Vec3 {
  const z = Math.random() * 2 - 1;
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  return normalize({ x: radius * Math.cos(angle), y: radius * Math.sin(angle), z });
}

function randomChannel() {
  const magnitude = 0.55 + Math.random() * 1.45;
  return Math.random() < 0.5 ? magnitude : -magnitude;
}

function randomPalette(): Palette {
  const red = randomChannel();
  const green = randomChannel();
  let blue = randomChannel();

  if (Math.sign(red) === Math.sign(green)) {
    blue = Math.sign(red) > 0 ? -Math.abs(blue) : Math.abs(blue);
  }

  return { red, green, blue };
}

function channelFromDistance(distance: number, coefficient: number) {
  const value = coefficient > 0
    ? (distance / coefficient) * 255
    : 255 + (distance / coefficient) * 255;
  return Math.max(0, Math.min(255, value));
}

export class PlanetRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private axis: Vec3 = randomAxis();
  private palette: Palette = randomPalette();
  private renderFrame: number | null = null;
  private resizeFrame: number | null = null;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("2D canvas is unavailable");
    this.context = context;

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
  }

  regenerate() {
    this.axis = randomAxis();
    this.palette = randomPalette();
    this.scheduleRender();
  }

  private resize() {
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
      const height = Math.max(1, Math.round(window.innerHeight * pixelRatio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.scheduleRender();
    });
  }

  private scheduleRender() {
    if (this.renderFrame !== null) cancelAnimationFrame(this.renderFrame);
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      this.render();
    });
  }

  private render() {
    if (this.destroyed) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const image = this.context.createImageData(width, height);
    const pixels = image.data;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Math.min(width * 0.405, height * 0.455);
    const radiusSquared = radius * radius;
    const minimumX = Math.max(0, Math.floor(centerX - radius - 1));
    const maximumX = Math.min(width - 1, Math.ceil(centerX + radius + 1));
    const minimumY = Math.max(0, Math.floor(centerY - radius - 1));
    const maximumY = Math.min(height - 1, Math.ceil(centerY + radius + 1));
    const light = normalize({ x: -0.46, y: -0.38, z: 0.8 });

    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 0;
      pixels[index + 1] = 0;
      pixels[index + 2] = 0;
      pixels[index + 3] = 255;
    }

    for (let y = minimumY; y <= maximumY; y += 1) {
      const normalizedY = (y + 0.5 - centerY) / radius;
      for (let x = minimumX; x <= maximumX; x += 1) {
        const offsetX = x + 0.5 - centerX;
        const offsetY = y + 0.5 - centerY;
        const distanceSquared = offsetX * offsetX + offsetY * offsetY;
        if (distanceSquared > radiusSquared + radius) continue;

        const normalizedX = offsetX / radius;
        const surfaceSquared = normalizedX * normalizedX + normalizedY * normalizedY;
        const normalizedZ = Math.sqrt(Math.max(0, 1 - Math.min(1, surfaceSquared)));
        const axisDot = normalizedX * this.axis.x
          + normalizedY * this.axis.y
          + normalizedZ * this.axis.z;
        const distanceFromAxis = Math.sqrt(Math.max(0, 1 - axisDot * axisDot));

        let red = channelFromDistance(distanceFromAxis, this.palette.red);
        let green = channelFromDistance(distanceFromAxis, this.palette.green);
        let blue = channelFromDistance(distanceFromAxis, this.palette.blue);

        const lambert = Math.max(0, normalizedX * light.x + normalizedY * light.y + normalizedZ * light.z);
        const lightLevel = 0.055 + Math.pow(lambert, 1.18) * 0.945;
        const rim = Math.pow(Math.max(0, 1 - normalizedZ), 2.4) * 0.14;
        const illumination = Math.min(1, lightLevel + rim);
        red *= illumination;
        green *= illumination;
        blue *= illumination;

        const edgeDistance = radius - Math.sqrt(distanceSquared);
        const coverage = Math.max(0, Math.min(1, edgeDistance + 0.5));
        const pixelIndex = (y * width + x) * 4;
        pixels[pixelIndex] = Math.round(red * coverage);
        pixels[pixelIndex + 1] = Math.round(green * coverage);
        pixels[pixelIndex + 2] = Math.round(blue * coverage);
      }
    }

    this.context.putImageData(image, 0, 0);
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("resize", this.resize);
    if (this.renderFrame !== null) cancelAnimationFrame(this.renderFrame);
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.renderFrame = null;
    this.resizeFrame = null;
  }
}
