export class LandScape {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stargroup: number[][];
  density: number;
  size: number;
  starLux: number;
  radianDiv: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context를 가져올 수 없습니다.");
    }
    this.ctx = ctx;

    this.stargroup = [];
    this.density = 0.002;
    this.size = 1;
    this.starLux = 255;

    this.getStar();
  }

  getStar() {
    this.stargroup = []; // 여러 번 호출돼도 중복 안 쌓이게 초기화

    for (let i = 0; i < this.canvas.width; i++) {
      for (let j = 0; j < this.canvas.height; j++) {
        if (Math.random() < this.density) {
          this.stargroup.push([
            i / this.canvas.width,     // x (정규화)
            j / this.canvas.height,    // y (정규화)
            this.size * Math.random(), // 반지름
            this.starLux * Math.random(), // 밝기
          ]);
        }
      }
    }
  }

  genStar() {
    for (let i = 0; i < this.stargroup.length; i++) {
      const [nx, ny, r, lux] = this.stargroup[i];

      this.ctx.fillStyle = `rgb(${lux},${lux},${lux})`;
      this.ctx.beginPath();
      this.ctx.arc(
        nx * this.canvas.width,
        ny * this.canvas.height,
        r,
        0,
        2 * Math.PI
      );
      this.ctx.fill();
    }
  }

  genSun(sunX: number, sunY: number, lightRadius: number) {
    this.genSunCore(sunX, sunY);
    this.genLighting(sunX, sunY, lightRadius);
  }

  genSunCore(sunX: number, sunY: number) {
    const core = this.ctx.createRadialGradient(sunX, sunY, 30, sunX, sunY, 150);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(1, "rgba(5,5,5,0)");

    this.ctx.fillStyle = core;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, 150, 0, 2 * Math.PI);
    this.ctx.fill();
  }

  genLighting(sunX: number, sunY: number, lightRadius: number) {
    this.radianDiv = 90;

    for (let i = 0; i < this.radianDiv; i++) {
      if (Math.random() < 0.03) {
        const lightbuffer = lightRadius * Math.random();
        const luxbuffer = 255;

        const angle = (2 * Math.PI / this.radianDiv) * i;
        const lightEndX = lightbuffer * Math.cos(angle) + sunX;
        const lightEndY = lightbuffer * Math.sin(angle) + sunY;

        this.ctx.beginPath();
        this.ctx.moveTo(sunX, sunY);
        this.ctx.lineTo(lightEndX, lightEndY);
        this.ctx.strokeStyle = `rgb(${luxbuffer},${luxbuffer},${luxbuffer})`;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }
    }
  }
}
