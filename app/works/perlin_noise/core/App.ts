// app/works/perlin_noise/core/App.ts
import { Calculate } from "./tool";
import { Lowestline, Perlin } from "./perlin";
import { useIsMobile } from "./useIsMobile"; 

export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pixelRatio: number;
  isMobile: boolean;

  stageWidth = 0;
  stageHeight = 0;

  resolution = 3;
  mode = 0;
  scale = 5;
  speed = 0.01;
  colorTransSpeed = 0.4;
  linecount = 5;

  amp = 0;
  lineArry: Perlin[] = [];
  lowestLine!: Lowestline;

  private animationId: number | null = null;
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.isMobile = window.innerWidth <= 768;
    if (this.isMobile) {
      this.linecount = 5;
      this.scale = 3;
      this.speed = 0.006;
    }
    this.canvas = canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context not available");
    }
    this.ctx = ctx;

    this.pixelRatio = 1;

    this.resizeHandler = this.resize.bind(this);
    window.addEventListener("resize", this.resizeHandler, false);
    this.resize();

    this.lowestLine = new Lowestline(
      this.canvas,
      this.stageWidth,
      this.stageHeight,
      this.lineArry,
      0,
      this.resolution
    );

    // 초기 배경색
    this.canvas.style.backgroundColor = "black";

    window.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;

      // orbit/donut용 UI 같은 다른 FAB 위 클릭은 무시하고 싶다면 여기서 필터링 가능
      if (target && target.closest(".orbit-fab")) return;

      this.mode += 1;
      switch (this.mode) {
        case 0:
          this.canvas.style.backgroundColor = "black";
          break;
        case 1: {
          for (let i = 0; i < this.linecount; i++) {
            this.lineArry[i].color.r = Math.random() * 255;
            this.lineArry[i].color.g = Math.random() * 255;
            this.lineArry[i].color.b = Math.random() * 255;
          }
          const last =
            this.lineArry[this.linecount - 1].color;
          const negColor = {
            r: (255 - last.r) / 3,
            g: (255 - last.g) / 3,
            b: (255 - last.b) / 3,
          };
          this.canvas.style.backgroundColor = `rgba(${negColor.r},${negColor.g},${negColor.b},1)`;
          break;
        }
        case 2:
          this.canvas.style.backgroundColor = "black";
          break;
        default:
          this.mode = 0;
          this.canvas.style.backgroundColor = "black";
          break;
      }
    });

    // 초기 라인 세팅
    for (let i = 0; i < this.linecount; i++) {
      this.amp =
        (this.stageHeight / 3) *
        Calculate.getRandomArbitrary(0.7, 1);
      this.lineArry[i] = new Perlin(
        this.canvas,
        this.scale,
        this.stageWidth,
        this.stageHeight,
        this.speed,
        this.amp,
        this.mode,
        this.resolution
      );
    }

    this.animate = this.animate.bind(this);
    this.animationId = window.requestAnimationFrame(this.animate);
  }

  resize() {
    this.stageWidth = document.body.clientWidth;
    this.stageHeight = document.body.clientHeight;
    this.canvas.width = this.stageWidth * this.pixelRatio;
    this.canvas.height = this.stageHeight * this.pixelRatio;

    if (this.lowestLine) {
      this.lowestLine.stageWidth = this.stageWidth;
      this.lowestLine.stageHeight = this.stageHeight;
    }

    for (let i = 0; i < this.linecount; i++) {
      this.amp =
        (this.stageHeight / 3) *
        Calculate.getRandomArbitrary(0.7, 1);
      this.lineArry[i] = new Perlin(
        this.canvas,
        this.scale,
        this.stageWidth,
        this.stageHeight,
        this.speed,
        this.amp,
        this.mode,
        this.resolution
      );
    }

    if (this.mode === 1) {
      const last =
        this.lineArry[this.linecount - 1].color;
      const negColor = {
        r: (255 - last.r) / 2,
        g: (255 - last.g) / 2,
        b: (255 - last.b) / 2,
      };
      this.canvas.style.backgroundColor = `rgba(${negColor.r},${negColor.g},${negColor.b},0.6)`;
    }
  }

  animate() {
    this.animationId = window.requestAnimationFrame(this.animate);
    this.ctx.clearRect(0, 0, this.stageWidth, this.stageHeight);

    for (let i = 0; i < this.linecount; i++) {
      this.lineArry[i].lineUpdate();
    }

    for (let i = 0; i < this.linecount; i++) {
      if (this.mode === 1 || this.mode === 2) {
        this.lineArry[i].transColor(this.colorTransSpeed);
      }
      this.lineArry[i].draw1Dperlin(this.mode, "white");
    }

    if (this.mode === 1) {
      const last =
        this.lineArry[this.linecount - 1].color;
      const negColor = {
        r: (255 - last.r) / 2,
        g: (255 - last.g) / 2,
        b: (255 - last.b) / 2,
      };
      this.canvas.style.backgroundColor = `rgba(${negColor.r},${negColor.g},${negColor.b},1)`;
    } else if (this.mode === 2) {
      this.canvas.style.backgroundColor = "black";
      const negColor = { r: 0, g: 0, b: 0 };
      this.lowestLine.maxReturn(this.lineArry);
      this.lowestLine.overPaint(negColor);
      for (let i = 0; i < this.linecount; i++) {
        this.lineArry[i].draw1Dperlin(0, "black");
      }
    }
  }

  destroy() {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    window.removeEventListener("resize", this.resizeHandler);
  }
}
