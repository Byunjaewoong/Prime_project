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

    // 🌌 새 행성이 기존 행성 + 위성 공전 범위를 침범하는지 체크
  private canPlacePlanet(candidate: Planet): boolean {
    const newX = candidate.spaceX;
    const newY = candidate.spaceY;
    const newR = candidate.windowRadius;
    const newOrbitRange =
      newR * Planet.MAX_SATELLITE_ORBIT_FACTOR;
    const margin = 10; // 살짝 여유

    for (const obj of this.planetGroup.array) {
      const p = obj;
      if (!(p instanceof Planet)) continue; // 태양 더미는 무시

      const existing = p as Planet;
      const exX = existing.spaceX;
      const exY = existing.spaceY;
      const exR = existing.windowRadius;
      const exOrbitRange =
        exR * Planet.MAX_SATELLITE_ORBIT_FACTOR;

      const dx = newX - exX;
      const dy = newY - exY;
      const dist = Math.hypot(dx, dy);

      const minDist =
        newR + newOrbitRange + exR + exOrbitRange + margin;

      if (dist < minDist) {
        console.log(
          "⚠ 새 행성 위치가 기존 행성/위성 궤도와 충돌해서 생성하지 않음"
        );
        return false;
      }
    }

    return true;
  }


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

    // 마우스 이동 → 태양 위치
    this.mouseMoveHandler = (e: MouseEvent) => {
      this.sunx = e.clientX;
      this.suny = e.clientY;
    };
    window.addEventListener("mousemove", this.mouseMoveHandler);

    // 클릭 → 행성 생성 (단, UI 위 클릭은 무시)
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;

      if (
        target &&
        (target.closest(".orbit-fab") || target.closest(".orbit-side-panel"))
      ) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }

      // ⭐ 새 행성 생성 (일단 만들어 보고)
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

      // // 🌌 기존 행성/위성 궤도와 충돌 체크
      // if (!this.canPlacePlanet(planet)) {
      //   return; // 생성 취소
      // }

      // 🌕 충돌 없으면 위성 생성하고 그룹에 추가
      // planet.createDefaultSatellite();
      planet.logPosition();
      this.planetGroup.pushing(planet);
    };
    window.addEventListener("click", this.clickHandler);

    // 태양 더미
    this.planetGroup.pushing({ spaceZ: 0, genSun: 1 });

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
      const planet = this.planetGroup.array[i];
      if (planet instanceof Planet && typeof planet.resize === "function") {
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
      const planet = this.planetGroup.array[i];

      if (!(planet instanceof Planet)) {
        this.landScape.genSunCore(this.sunx, this.suny);

        for (let j = 0; j < this.planetGroup.array.length; j++) {
          const p = this.planetGroup.array[j];
          if (p instanceof Planet && p.spaceZ > 0) {
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
        const p = planet as Planet;

        p.renderingPlanet(
          this.sunx,
          this.suny,
          this.canvas.width,
          this.canvas.height
        );

        // 위성도 렌더링
        for (const s of p.satellites) {
          s.updateOrbit();     // 공전
          s.renderingSatellite(this.sunx, this.suny);
        }


        //         // 위성 렌더
        // if (p.satellites && p.satellites.length > 0) {
        //   p.renderSatellites(this.sunx, this.suny);
        // }
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
  }
}
