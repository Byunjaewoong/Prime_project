// app/works/orbit2/core/App.ts

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

  private animationId: number | null = null;
  private resizeHandler: () => void;
  private clickHandler: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context not available");
    }
    this.ctx = ctx;

    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.sunx = 0;
    this.suny = 0;
    this.spaceRadius = this.stageWidth * 2;
    this.planetGroup = new PlanetGroup();

    this.resizeHandler = this.resize.bind(this);
    window.addEventListener("resize", this.resizeHandler, false);
    this.resize();

    this.landScape = new LandScape(this.canvas);

    // 마우스 고정 태양 (화면 중앙)
    this.sunx = this.stageWidth / 2;
    this.suny = this.stageHeight / 2;

    // 🔹 클릭 → 행성 생성 (단, UI 위나 캔버스 밖은 무시)
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;

      // 1) 오른쪽 플로팅 메뉴(.orbit-fab)나 왼쪽 패널(.orbit-side-panel) 안에서의 클릭은 무시
      if (
        target &&
        (target.closest(".orbit-fab") || target.closest(".orbit-side-panel"))
      ) {
        return;
      }

      // 2) 캔버스 영역 밖 클릭도 무시 (필요 없으면 이 블록은 제거해도 됨)
      const rect = this.canvas.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }

      // 🔥 여기까지 왔으면 진짜 "우주 화면 클릭" → 행성 생성
      const planet = new Planet(
        this.canvas,
        e,
        this.spaceRadius,
        10,
        (2 * Math.PI) / 5760,
        this.sunx,
        this.suny,
        this.canvas.width,
        this.canvas.height
      );
      this.planetGroup.pushing(planet);
    };

    window.addEventListener("click", this.clickHandler);

    // 태양 더미
    this.planetGroup.pushing({ spaceZ: 0, genSun: 1 });

    this.animate = this.animate.bind(this);
    this.animationId = window.requestAnimationFrame(this.animate);
  }

  resize() {
    console.log("resize orbit2");
    this.stageWidth = window.innerWidth;
    this.stageHeight = window.innerHeight;

    this.canvas.width = this.stageWidth * this.pixelRatio;
    this.canvas.height = this.stageHeight * this.pixelRatio;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

    this.sunx = this.stageWidth / 2;
    this.suny = this.stageHeight / 2;

    // 행성 위치 리사이즈
    for (let i = 0; i < this.planetGroup.array.length; i++) {
      const planet = this.planetGroup.array[i];
      if (planet instanceof Planet && typeof planet.resize === "function") {
        planet.resize(this.sunx, this.suny, this.stageWidth, this.stageHeight);
      }
    }

    // 별 다시 생성
    this.landScape = new LandScape(this.canvas);
    this.spaceRadius = this.stageWidth * 2;
  }

  animate() {
    this.animationId = window.requestAnimationFrame(this.animate);
    this.ctx.clearRect(0, 0, this.stageWidth, this.stageHeight);

    this.landScape.genStar();

    for (let i = 0; i < this.planetGroup.array.length; i++) {
      const obj = this.planetGroup.array[i];
      if (!(obj instanceof Planet)) {
        this.landScape.genSun(this.sunx, this.suny, 100);
      } else {
        obj.fallPlanet();
        obj.renderingPlanet(
          this.sunx,
          this.suny,
          this.stageWidth,
          this.stageHeight
        );
      }
    }

    this.planetGroup.sorting(this.planetGroup.array);
  }

  destroy() {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("click", this.clickHandler);
  }
}
