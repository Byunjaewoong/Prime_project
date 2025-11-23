// app/lib/App.ts
import { PlanetGroup, Planet } from "./app_planet";
import { LandScape } from "./app_landScape";

export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pixelRatio: number;
  sunx: number;
  suny: number;
  spaceRadius: number;
  planetGroup: PlanetGroup;
  landScape: LandScape;
  stageWidth: number = 0;
  stageHeight: number = 0;

  private resizeHandler: () => void;
  private mouseMoveHandler: (e: MouseEvent) => void;
  private clickHandler: (e: MouseEvent) => void;
  private animationId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context를 가져올 수 없습니다.");
    }
    this.ctx = ctx;

    this.pixelRatio = window.devicePixelRatio || 1;

    this.sunx = 0;
    this.suny = 0;
    this.spaceRadius = this.canvas.width * 2;
    this.planetGroup = new PlanetGroup();

    // 리사이즈 핸들러
    this.resize = this.resize.bind(this);
    this.resizeHandler = this.resize;
    window.addEventListener("resize", this.resizeHandler, false);
    this.resize();

    // resize 후 다시 spaceRadius 계산
    this.spaceRadius = this.canvas.width * 2;

    this.landScape = new LandScape(this.canvas);

    // 마우스 이동
    this.mouseMoveHandler = (e: MouseEvent) => {
      this.sunx = e.clientX;
      this.suny = e.clientY;
    };
    window.addEventListener("mousemove", this.mouseMoveHandler);

    // 클릭 → 행성 생성
    this.clickHandler = (e: MouseEvent) => {
      const planet = new Planet(
        this.canvas,
        e,
        this.spaceRadius,
        70,
        this.sunx,
        this.suny,
        this.canvas.width,
        this.canvas.height
      );

      planet.logPosition();
      this.planetGroup.pushing(planet);
    };
    window.addEventListener("click", this.clickHandler);

    // 태양 더미
    this.planetGroup.pushing({ spaceZ: 0, genSun: 1 } as any);

    // 애니메이션 시작
    this.animate = this.animate.bind(this);
    this.animationId = window.requestAnimationFrame(this.animate);
  }

  resize() {
    // canvas를 화면 전체로 쓰고 싶으니 viewport 기준
    this.stageWidth = window.innerWidth;
    this.stageHeight = window.innerHeight;

    this.canvas.width = this.stageWidth * this.pixelRatio;
    this.canvas.height = this.stageHeight * this.pixelRatio;

    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

    for (let i = 0; i < this.planetGroup.array.length; i++) {
      const planet = this.planetGroup.array[i] as any;
      if (!planet.genSun && typeof planet.resize === "function") {
        planet.resize();
      }
    }

    this.spaceRadius = this.canvas.width * 2;
  }

  animate() {
    this.animationId = window.requestAnimationFrame(this.animate);

    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.stageWidth, this.stageHeight);

    this.landScape.genStar();

    for (let i = 0; i < this.planetGroup.array.length; i++) {
      const planet = this.planetGroup.array[i] as any;

      if (planet.genSun) {
        this.landScape.genSunCore(this.sunx, this.suny);

        for (let j = 0; j < this.planetGroup.array.length; j++) {
          const p = this.planetGroup.array[j] as any;
          if (!p.genSun && p.spaceZ > 0) {
            const xMin = p.windowX - p.windowRadius;
            const xMax = p.windowX + p.windowRadius;
            const yMin = p.windowY - p.windowRadius;
            const yMax = p.windowY + p.windowRadius;

            if (
              this.sunx >= xMin &&
              this.sunx <= xMax &&
              this.suny >= yMin &&
              this.suny <= yMax
            ) {
              this.landScape.genLighting(this.sunx, this.suny, 100);
              break;
            }
          }
        }
      } else {
        planet.renderingPlanet(
          this.sunx,
          this.suny,
          this.canvas.width,
          this.canvas.height
        );
      }
    }
  }

  destroy() {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("mousemove", this.mouseMoveHandler);
    window.removeEventListener("click", this.clickHandler);

    // canvas DOM 제거는 React가 담당하므로 여기서는 안 없앰
  }
}
