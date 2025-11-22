import { Calculate, PlanetGroup, Planet } from "./app_planet";
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
  stageWidth: number;
  stageHeight: number;

  constructor() {
    this.canvas = document.createElement("canvas");
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.pixelRatio = 1;

    this.sunx = 0;
    this.suny = 0;
    this.spaceRadius = this.canvas.width * 2;
    this.planetGroup = new PlanetGroup();

    window.addEventListener("resize", this.resize.bind(this), false);
    this.resize();

    this.landScape = new LandScape(this.canvas);

    window.addEventListener("mousemove", (e) => {
      this.sunx = e.clientX;
      this.suny = e.clientY;
    });

    window.addEventListener("click", (e) => {
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
    });

    this.planetGroup.pushing({ spaceZ: 0, genSun: 1 });

    window.requestAnimationFrame(this.animate.bind(this));
  }

    resize() {
        this.stageWidth = window.innerWidth;
        this.stageHeight = window.innerHeight;

        this.canvas.width = this.stageWidth * this.pixelRatio;
        this.canvas.height = this.stageHeight * this.pixelRatio;
        this.ctx.scale(this.pixelRatio, this.pixelRatio);

        for (let i = 0; i < this.planetGroup.array.length; i++) {
            if (!this.planetGroup.array[i].genSun) {
                this.planetGroup.array[i].resize();
            }
        }
    }



    animate() {
        window.requestAnimationFrame(this.animate.bind(this));

        // 검은 배경으로 전체 화면 채우기
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.stageWidth, this.stageHeight);

        this.landScape.genStar();

        // for (let i = 0; i < this.planetGroup.array.length; i++) {
        //     if (this.planetGroup.array[i].genSun) {
        //         this.landScape.genSun(this.sunx, this.suny, 100);
        //     } else {
        //         this.planetGroup.array[i].renderingPlanet(this.sunx, this.suny, this.canvas.width, this.canvas.height);
        //     }
        // }
        for (let i = 0; i < this.planetGroup.array.length; i++) {
                const planet = this.planetGroup.array[i];

                if (planet.genSun) {
                    // 태양 전체 코어는 항상 그림
                    this.landScape.genSunCore(this.sunx, this.suny, 100);

                    // genLighting 조건 적용
                    for (let j = 0; j < this.planetGroup.array.length; j++) {
                        const p = this.planetGroup.array[j];
                        if (!p.genSun && p.spaceZ > 0) {
                            const xMin = p.windowX - p.windowRadius;
                            const xMax = p.windowX + p.windowRadius;
                            const yMin = p.windowY - p.windowRadius;
                            const yMax = p.windowY + p.windowRadius;

                            // 행성 영역 안에 태양이 있으면 조명 실행
                            if (this.sunx >= xMin && this.sunx <= xMax && this.suny >= yMin && this.suny <= yMax) {
                                this.landScape.genLighting(this.sunx, this.suny, 100);
                                break; // 한 번만 실행해도 충분
                            }
                        }
                    }

                } else {
                    planet.renderingPlanet(this.sunx, this.suny, this.canvas.width, this.canvas.height);
                }
            }

    }

}
