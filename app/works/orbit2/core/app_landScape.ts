// app/works/orbit2/core/app_landScape.ts

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
    this.ctx = this.canvas.getContext("2d")!;
    this.stargroup = [];
    this.density = 0.002;
    this.size = 1;
    this.starLux = 255;
    this.getStar();
    console.log("stars:", this.stargroup.length);
  }

  getStar() {
    this.stargroup = [];
    for (let i = 0; i < this.canvas.width; i++) {
      for (let j = 0; j < this.canvas.height; j++) {
        if (Math.random() < this.density) {
          this.stargroup.push([
            i / this.canvas.width,
            j / this.canvas.height,
            this.size * Math.random(),
            this.starLux * Math.random(),
          ]);
        }
      }
    }
  }

  genStar() {
    for (let i = 0; i < this.stargroup.length; i++) {
      const lux = this.stargroup[i][3];
      this.ctx.fillStyle = `rgb(${lux},${lux},${lux})`;
      this.ctx.beginPath();
      this.ctx.arc(
        this.stargroup[i][0] * this.canvas.width,
        this.stargroup[i][1] * this.canvas.height,
        this.stargroup[i][2],
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
        const lightEndX =
          lightbuffer * Math.cos((2 * Math.PI * i) / this.radianDiv) + sunX;
        const lightEndY =
          lightbuffer * Math.sin((2 * Math.PI * i) / this.radianDiv) + sunY;

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
