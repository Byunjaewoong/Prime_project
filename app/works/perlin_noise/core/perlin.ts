// app/works/perlin_noise/core/perlin.ts
import { Calculate } from "./tool";

export class Perlin {
  ctx: CanvasRenderingContext2D;
  scale: number;
  stageWidth: number;
  stageHeight: number;
  perlinGroup: PerlinGroup;
  amp: number;
  dotAmount!: number;
  interval!: number;
  height = 0;
  mode: number;
  color: { r: number; g: number; b: number };
  vectorColor!: { r: number; g: number; b: number };
  resolution: number;

  constructor(
    canvas: HTMLCanvasElement,
    scale: number,
    stageWidth: number,
    stageHeight: number,
    speed: number,
    amp: number,
    mode: number,
    resolution: number
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context not available");
    }
    this.ctx = ctx;
    this.scale = scale;
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    this.perlinGroup = new PerlinGroup();
    this.amp = amp;
    this.get1DGrid(speed);
    this.getallgroup();
    this.mode = mode;
    this.color = { r: 0, g: 0, b: 0 };
    this.color.r = Math.random() * 255;
    this.color.g = Math.random() * 255;
    this.color.b = Math.random() * 255;
    this.directionColor();
    this.resolution = resolution;
  }

  directionColor() {
    this.vectorColor = { r: 0, g: 0, b: 0 };
    this.vectorColor.r = Calculate.getRandomArbitrary(-1, 1);
    this.vectorColor.g = Calculate.getRandomArbitrary(-1, 1);
    this.vectorColor.b = Calculate.getRandomArbitrary(-1, 1);
  }

  transColor(transSpeed: number) {
    if (this.color.r > 255 || this.color.r < 0) {
      this.vectorColor.r = this.vectorColor.r * -1;
    }
    if (this.color.g > 255 || this.color.g < 0) {
      this.vectorColor.g = this.vectorColor.g * -1;
    }
    if (this.color.b > 255 || this.color.b < 0) {
      this.vectorColor.b = this.vectorColor.b * -1;
    }
    this.color.r = this.color.r + this.vectorColor.r * transSpeed;
    this.color.g = this.color.g + this.vectorColor.g * transSpeed;
    this.color.b = this.color.b + this.vectorColor.b * transSpeed;
  }

  get1DGrid(speed: number) {
    this.dotAmount = this.scale;
    this.interval = Math.round(this.stageWidth / this.scale);

    for (let i = 0; i < this.dotAmount; i++) {
      const dot = new Perlindot(
        this.stageHeight,
        this.interval * i,
        0,
        speed,
        this.amp
      );
      this.perlinGroup.arry[i] = dot;
    }
    this.perlinGroup.arry[this.dotAmount] = new Perlindot(
      this.stageHeight,
      this.interval * this.dotAmount,
      0,
      speed,
      this.amp
    );
    this.perlinGroup.arry[this.dotAmount + 1] = new Perlindot(
      this.stageHeight,
      this.interval * (this.dotAmount + 1),
      0,
      speed,
      this.amp
    );
  }

  cubicInterPolate(
    a: { y: number },
    b: { y: number },
    c: { y: number },
    d: { y: number },
    x: number
  ) {
    const P = d.y - c.y - (a.y - b.y);
    const Q = a.y - b.y - P;
    const R = c.y - a.y;
    const S = b.y;

    return P * x * x * x + Q * x * x + R * x + S;
  }

  getallgroup() {
    for (let i = 0; i < this.stageWidth + this.resolution; i++) {
      const j = Math.floor(i / this.interval);
      if (
        this.perlinGroup.arry[j + 1] &&
        this.perlinGroup.arry[j + 2] &&
        j > 0
      ) {
        this.height = this.cubicInterPolate(
          this.perlinGroup.arry[j - 1],
          this.perlinGroup.arry[j],
          this.perlinGroup.arry[j + 1],
          this.perlinGroup.arry[j + 2],
          (i - j * this.interval) / this.interval
        );
      } else if (j === 0) {
        this.height = this.cubicInterPolate(
          { y: this.stageHeight / 2 },
          this.perlinGroup.arry[j],
          this.perlinGroup.arry[j + 1],
          this.perlinGroup.arry[j + 2],
          (i - j * this.interval) / this.interval
        );
      }

      this.perlinGroup.allarry[i] = this.height;
    }
  }

  lineUpdate() {
    for (let i = 0; i < this.perlinGroup.arry.length; i++) {
      this.perlinGroup.arry[i].update();
    }
  }

  draw1Dperlin(mode: number, strokeStyle: string) {
    this.mode = mode;

    this.getallgroup();
    this.ctx.lineWidth = 1;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.miterLimit = 5;

    this.ctx.strokeStyle = strokeStyle;

    this.ctx.fillStyle = `rgba(${this.color.r},${this.color.g},${this.color.b},0.4)`;
    for (
      let i = 0;
      i < this.stageWidth + this.resolution;
      i += this.resolution
    ) {
      this.height = this.perlinGroup.allarry[i];
      this.ctx.beginPath();
      this.ctx.moveTo(i, this.height);
      this.ctx.quadraticCurveTo(
        i + this.resolution / 2,
        (this.height + this.perlinGroup.allarry[i + this.resolution]) / 2,
        i + this.resolution,
        this.perlinGroup.allarry[i + this.resolution]
      );
      if (this.mode === 0) {
        this.ctx.stroke();
      }
      if (this.mode === 1 || this.mode === 2) {
        this.ctx.lineTo(i + this.resolution, this.stageHeight);
        this.ctx.lineTo(i, this.stageHeight);
        this.ctx.fill();
      }
    }
  }
}

export class Perlindot {
  stageHeight: number;
  x: number;
  offset: number;
  amp: number;
  constant: number;
  gradient: number;
  speed: number;
  cur: number;
  y: number = 0;

  constructor(
    stageHeight: number,
    x: number,
    gradient: number,
    speed: number,
    amp: number
  ) {
    this.stageHeight = stageHeight;
    this.x = x;
    this.offset = Calculate.getRandomArbitrary(-1, 1);
    this.amp = amp;
    this.constant = this.stageHeight / 2;
    this.gradient = gradient;
    const negspeed = speed * -1;
    this.speed = Calculate.getRandomArbitrary(negspeed, speed);
    this.cur = 0;
  }

  update() {
    this.cur += this.speed;
    this.y =
      this.constant + this.offset * this.amp * Math.cos(this.cur);
  }
}

export class PerlinGroup {
  arry: Perlindot[];
  allarry: number[];

  constructor() {
    this.arry = [];
    this.allarry = [];
  }
}

export class Lowestline {
  ctx: CanvasRenderingContext2D;
  stageWidth: number;
  stageHeight: number;
  lineArry: Perlin[];
  lowestDot: number[];
  backgroundColor: { r: number; g: number; b: number } | number;
  resolution: number;
  height = 0;

  constructor(
    canvas: HTMLCanvasElement,
    stageWidth: number,
    stageHeight: number,
    lineArry: Perlin[],
    backgroundColor: { r: number; g: number; b: number } | number,
    resolution: number
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available");
    this.ctx = ctx;
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    this.lineArry = lineArry;
    this.lowestDot = [];
    this.backgroundColor = backgroundColor;
    this.resolution = resolution;
  }

  maxReturn(lineArry: Perlin[]) {
    this.lineArry = lineArry;
    for (let i = 0; i < this.stageWidth + this.resolution; i++) {
      this.lowestDot[i] = Math.max.apply(
        Math,
        this.lineArry.map(
          (o) => o.perlinGroup.allarry[i]
        )
      );
    }
  }

  overPaint(backgroundColor: { r: number; g: number; b: number }) {
    this.backgroundColor = backgroundColor;
    this.ctx.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},1)`;
    for (
      let i = 0;
      i < this.stageWidth + this.resolution;
      i += this.resolution
    ) {
      this.height = this.lowestDot[i];
      this.ctx.beginPath();
      this.ctx.moveTo(i, this.height);
      this.ctx.quadraticCurveTo(
        i + this.resolution / 2,
        (this.height + this.lowestDot[i + this.resolution]) / 2,
        i + this.resolution,
        this.lowestDot[i + this.resolution]
      );
      this.ctx.lineTo(i + this.resolution, this.stageHeight);
      this.ctx.lineTo(i, this.stageHeight);
      this.ctx.fill();
    }
  }
}
