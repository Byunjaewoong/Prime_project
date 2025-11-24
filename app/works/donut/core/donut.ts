// app/works/donut/core/donut.ts
import { Calculate } from "./tool";

export class Donut {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  stageWidth: number;
  stageHeight: number;

  fontsize: number;
  r1: number;
  r2: number;
  k1: number; // eye → screen scale
  k2: number; // eye → donut distance
  xp: number;
  yp: number;

  anglestep: number;
  anglestep2: number;
  septa: number;
  delta: number;

  dotStack: number[][][] = [];
  luminStack: number[][][] = [];
  comboStack: any[] = [];

  xAngle: number;
  yAngle: number;
  zAngle: number;

  mode: number;

  asciiWidth: number;
  asciiHeight: number;
  asciiWidthXp: number;
  asciiWidthYp: number;
  asciiIndex: string[];

  asciiScreenArr: number[][][] = []; // [x][y][2]

  xaxisMatrix!: number[][];
  yaxisMatrix!: number[][];
  zaxisMatrix!: number[][];

  // 🔦 light direction
  lightX: number;
  lightY: number;
  lightZ: number;

  // 🎨 글자 컬러 모드 관련
  private colorMode = false;
  private colorSeed = 0;
  private colorMap: Record<string, string> = {};

  constructor(
    mode: number,
    fontsize: number,
    canvas: HTMLCanvasElement,
    stageWidth: number,
    stageHeight: number,
    _event: unknown,
    r1: number,
    r2: number,
    xp: number,
    yp: number,
    k1: number,
    k2: number,
    anglestep: number,
    anglestep2: number,
    xAngle: number,
    yAngle: number,
    zAngle: number
  ) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;

    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;

    this.fontsize = fontsize || 10;
    this.r1 = r1;
    this.r2 = r2;
    this.k1 = k1;
    this.k2 = k2;
    this.xp = xp;
    this.yp = yp;

    this.anglestep = anglestep;
    this.anglestep2 = anglestep2;
    this.septa = (2 * Math.PI) / this.anglestep;
    this.delta = (2 * Math.PI) / this.anglestep2;

    this.xAngle = xAngle;
    this.yAngle = yAngle;
    this.zAngle = zAngle;

    // 기본 빛 방향 (원래 하드코딩 값)
    const base = 1 / Math.sqrt(3);
    this.lightX = -base;
    this.lightY = -base;
    this.lightZ = base;

    this.mode = mode;

    // ASCII 관련
    this.asciiWidth = Math.round(this.stageWidth / this.fontsize);
    this.asciiHeight = Math.round(this.stageHeight / this.fontsize);
    this.asciiWidthXp = Math.round(this.xp / this.fontsize);
    this.asciiWidthYp = Math.round(this.yp / this.fontsize);

    this.asciiIndex = [
      " ",
      ".",
      ",",
      "-",
      "~",
      ":",
      ";",
      "=",
      "!",
      "*",
      "#",
      "$",
      "@",
    ];

    this.calDonut();
  }

  setMode(mode: number) {
    this.mode = mode;
  }

  setLightDirection(x: number, y: number, z: number) {
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-3) return;
    this.lightX = x / len;
    this.lightY = y / len;
    this.lightZ = z / len;
  }

  // 🎨 색 모드 on/off + 팔레트 재생성
  setColorMode(on: boolean, seed: number) {
    this.colorMode = on;
    this.colorSeed = seed;

    if (!on) return;

    this.buildColorPalette();
  }

  // 🎨 문자 → 색 팔레트 한 번만 만들기
  private buildColorPalette() {
    const rng = mulberry32(this.colorSeed);
    const map: Record<string, string> = {};

    for (const ch of this.asciiIndex) {
      if (ch === " ") {
        // 공백은 안 보이게
        map[ch] = "rgba(0,0,0,0)";
        continue;
      }

      const h = rng() * 360;     // 0 ~ 360
      const s = 70 + rng() * 30; // 70 ~ 100 %
      const l = 45 + rng() * 10; // 45 ~ 55 %

      const { r, g, b } = hslToRgb(h / 360, s / 100, l / 100);
      map[ch] = `rgb(${r},${g},${b})`;
    }

    this.colorMap = map;
  }

  calDonut() {
    this.dotStack = [];
    this.luminStack = [];
    this.comboStack = [];

    for (let i = 0; i < this.anglestep; i++) {
      for (let j = 0; j < this.anglestep2; j++) {
        this.dotStack.push([
          [
            (this.r2 + this.r1 * Math.cos(this.septa * i)) *
              Math.cos(this.delta * j),
            this.r1 * Math.sin(this.septa * i),
            -(
              this.r2 +
              this.r1 * Math.cos(this.septa * i)
            ) * Math.sin(this.delta * j),
          ],
        ]);
      }
    }

    this.luminance();

    for (let i = 0; i < this.dotStack.length; i++) {
      this.comboStack.push([this.dotStack[i], this.luminStack[i]]);
    }

    this.sorting();

    this.asciiScreenArr = new Array(this.asciiWidth);
    for (let i = 0; i < this.asciiWidth; i++) {
      this.asciiScreenArr[i] = new Array(this.asciiHeight);
      for (let j = 0; j < this.asciiHeight; j++) {
        this.asciiScreenArr[i][j] = [-1, 0];
      }
    }
  }

  luminance() {
    this.luminStack = [];
    for (let i = 0; i < this.anglestep; i++) {
      for (let j = 0; j < this.anglestep2; j++) {
        this.luminStack.push([
          [
            Math.cos(this.septa * i) * Math.cos(this.delta * j),
            Math.sin(this.septa * i),
            Math.cos(this.septa * i) * Math.sin(this.delta * j),
          ],
        ]);
      }
    }
  }

  sorting() {
    this.comboStack.sort((a, b) => b[0][0][1] - a[0][0][1]);
  }

  rotation() {
    this.xaxisMatrix = [
      [1, 0, 0],
      [0, Math.cos(this.xAngle), Math.sin(this.xAngle)],
      [0, -Math.sin(this.xAngle), Math.cos(this.xAngle)],
    ];
    this.yaxisMatrix = [
      [Math.cos(this.yAngle), Math.sin(this.yAngle), 0],
      [-Math.sin(this.yAngle), Math.cos(this.yAngle), 0],
      [0, 0, 1],
    ];
    this.zaxisMatrix = [
      [Math.cos(this.zAngle), 0, Math.sin(this.zAngle)],
      [0, 1, 0],
      [-Math.sin(this.zAngle), 0, Math.cos(this.zAngle)],
    ];

    for (let i = 0; i < this.dotStack.length; i++) {
      const matrix_buf = Calculate.matrixProduct(
        this.dotStack[i],
        this.xaxisMatrix
      );
      const matrix_buf2 = Calculate.matrixProduct(matrix_buf, this.zaxisMatrix);
      this.dotStack[i] = Calculate.matrixProduct(matrix_buf2, this.yaxisMatrix);

      const matrix_buf_lu = Calculate.matrixProduct(
        this.luminStack[i],
        this.xaxisMatrix
      );
      const matrix_buf_lu2 = Calculate.matrixProduct(
        matrix_buf_lu,
        this.zaxisMatrix
      );
      this.luminStack[i] = Calculate.matrixProduct(
        matrix_buf_lu2,
        this.yaxisMatrix
      );

      this.comboStack[i][0] = this.dotStack[i];
      this.comboStack[i][1] = this.luminStack[i];
    }

    this.sorting();
  }

  drawDonut() {
    if (this.mode === 0) {
      this.drawAsDots();
    } else {
      this.drawAsAscii();
    }
  }

  private drawAsDots() {
    for (let i = 0; i < this.comboStack.length; i++) {
      const p = this.comboStack[i][0][0]; // [x, y, z]
      const n = this.comboStack[i][1][0];

      const x_persp = (p[0] * this.k1) / (this.k2 + p[1]);
      const y_persp = (p[2] * this.k1) / (this.k2 + p[1]);
      const xscreen = x_persp + this.xp;
      const yscreen = y_persp + this.yp;

      let L = Calculate.vectorProduct(
        n[0],
        n[1],
        n[2],
        this.lightX,
        this.lightY,
        this.lightZ
      );

      const orr = 1 / (this.k2 + p[1]);
      const radius = 20 * orr;

      if (L > 0) {
        L = L * L;
        const colorindex = 255 * L;
        this.ctx.fillStyle = `rgba(${colorindex},${colorindex},${colorindex},1)`;
      } else {
        this.ctx.fillStyle = "rgba(0,0,0,1)";
      }

      this.ctx.beginPath();
      this.ctx.arc(xscreen, yscreen, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawAsAscii() {
    // z-buffer + 문자 선택
    for (let i = 0; i < this.comboStack.length; i++) {
      const p = this.comboStack[i][0][0];
      const n = this.comboStack[i][1][0];

      const x_persp = Math.round(
        ((p[0] * this.k1) / (this.k2 + p[1])) / this.fontsize
      );
      const y_persp = Math.round(
        ((p[2] * this.k1) / (this.k2 + p[1])) / this.fontsize
      );
      const zbuff = 1 / (this.k2 + p[1]);

      const xscreen = x_persp + this.asciiWidthXp;
      const yscreen = y_persp + this.asciiWidthYp;

      if (
        xscreen < 0 ||
        xscreen >= this.asciiWidth ||
        yscreen < 0 ||
        yscreen >= this.asciiHeight
      ) {
        continue;
      }

      let L = Calculate.vectorProduct(
        n[0],
        n[1],
        n[2],
        this.lightX,
        this.lightY,
        this.lightZ
      );

      if (L > 0) {
        const idx = Math.min(
          this.asciiIndex.length - 1,
          Math.max(0, Math.round(L * 10) + 2)
        );
        if (this.asciiScreenArr[xscreen][yscreen][0] < zbuff) {
          this.asciiScreenArr[xscreen][yscreen][0] = zbuff;
          this.asciiScreenArr[xscreen][yscreen][1] = idx;
        }
      } else {
        this.asciiScreenArr[xscreen][yscreen][1] = 1;
      }
    }

    // 실제 그리기
    for (let i = 0; i < this.asciiWidth; i++) {
      for (let j = 0; j < this.asciiHeight; j++) {
        const xscreen = i * this.fontsize;
        const yscreen = j * this.fontsize;
        const num = this.asciiScreenArr[i][j][1];

        const ch = this.asciiIndex[num] ?? " ";

        // 🎨 컬러 모드면 팔레트에서 색 꺼내기, 아니면 흰색
        const color = this.colorMode
          ? this.colorMap[ch] || "rgb(255,255,255)"
          : "rgb(255,255,255)";

        this.filltext(xscreen, yscreen, ch, this.fontsize, color);

        this.asciiScreenArr[i][j][0] = -1;
        this.asciiScreenArr[i][j][1] = 0;
      }
    }
  }

  filltext(
    x: number,
    y: number,
    lumicode: string,
    fontsize: number,
    color?: string
  ) {
    this.ctx.font = `${fontsize}px serif`;
    this.ctx.fillStyle = color ?? `rgba(255,255,255,1)`;
    this.ctx.fillText(lumicode, x, y);
  }

  setRotationAngles(xAngle: number, yAngle: number, zAngle: number) {
    this.xAngle = xAngle;
    this.yAngle = yAngle;
    this.zAngle = zAngle;
  }

  setProjectionParams(k1: number, k2: number) {
    this.k1 = k1;
    this.k2 = k2;
  }
}

// 🎲 deterministic RNG
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// 🎨 HSL(0~1) → RGB(0~255)
function hslToRgb(h: number, s: number, l: number) {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}
