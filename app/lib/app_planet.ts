export class Calculate {
  static distanceLineToPoint(x3: number, y3: number, z3: number, x_polar: number, y_polar: number, z_polar: number) {
    const expo_x = y_polar * z3 - z_polar * y3;
    const expo_y = x_polar * z3 - z_polar * x3;
    const expo_z = x_polar * y3 - y_polar * x3;

    const numer = Math.pow(expo_x, 2) + Math.pow(expo_y, 2) + Math.pow(expo_z, 2);
    const denom = Math.pow(x_polar, 2) + Math.pow(y_polar, 2) + Math.pow(z_polar, 2);
    return Math.sqrt(numer / denom);
  }

  static distancePointToPoint(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2) + Math.pow(z1 - z2, 2));
  }

  static directionVectorPlanetToSun(vx: number, vy: number, vz: number, windowRadius: number, sunx: number, suny: number) {
    const x1 = sunx - vx;
    const y1 = suny - vy;
    const z1 = -vz;
    const squrt = Math.sqrt(x1 ** 2 + y1 ** 2 + z1 ** 2);
    return {
      x: (x1 / squrt) * windowRadius,
      y: (y1 / squrt) * windowRadius,
      z: (z1 / squrt) * windowRadius,
    };
  }
}

export class PlanetGroup {
  array: any[];
  constructor() {
    this.array = [];
  }
  pushing(planet: any) {
    this.array.push(planet);
    this.sorting(this.array);
  }
  sorting(array: any[]) {
    array.sort((a, b) => a.spaceZ - b.spaceZ);
  }
}

export class Planet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  spaceX: number;
  spaceY: number;
  spaceZ: number;
  windowX: number;
  windowY: number;
  windowRadius: number;
  planetR: number;
  sunx: number;
  suny: number;
  shadePolor: any;
  colorRed: number;
  colorGreen: number;
  colorBlue: number;
  polarX: number;
  polarY: number;
  polarZ: number;
  portionX: number;
  portionY: number;
  orbitDirectionVector: { x: number; y: number; z: number };

  logPosition() {
      console.log(
        `Planet Position -> X: ${this.spaceX.toFixed(2)}, Y: ${this.spaceY.toFixed(2)}, Z: ${this.spaceZ.toFixed(2)}`
      );
    }

  constructor(
    canvas: HTMLCanvasElement,
    event: MouseEvent,
    spaceRadius: number,
    planetR: number,
    sunx: number,
    suny: number,
    stageWidth: number,
    stageHeight: number
  ) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext('2d')!;
    this.planetR = planetR;
    this.sunx = sunx;
    this.suny = suny;

    this.portionX = event.clientX / this.canvas.width;
    this.portionY = event.clientY / this.canvas.height;

    this.spaceX = 0;
    this.spaceY = 0;
    this.spaceZ = 0;
    this.windowX = 0;
    this.windowY = 0;
    this.windowRadius = 0;

    this.colorRed = 0;
    this.colorGreen = 0;
    this.colorBlue = 0;
    this.polarX = 0;
    this.polarY = 0;
    this.polarZ = 0;

    this.shadePolor = { x: 0, y: 0, z: 0 };
    this.windowRadius = (spaceRadius * 2 + this.spaceZ) / (spaceRadius * 4) * this.planetR;

    this.spacePosition(event.clientX, event.clientY);
    const minRadius = 10;  // 최소 크기
    const maxRadius = 70; // 최대 크기
    const t = (this.spaceZ + spaceRadius) / (2 * spaceRadius);
    this.windowRadius = minRadius + t * (maxRadius - minRadius);
    // console.log(this.windowRadius);
    this.generatePolar();
    this.colorSet();

    this.windowX = this.spaceX;
    this.windowY = this.spaceY;
    this.orbitDirectionVector = { x: 0, y: 0, z: 0 };
  }

  resize() {
    this.spaceX = this.canvas.width * this.portionX;
    this.spaceY = this.canvas.height * this.portionY;
    this.windowX = this.spaceX;
    this.windowY = this.spaceY;
  }

  generatePolar() {
    const polar_r = this.windowRadius * Math.random();
    const radian = Math.PI * 2 * Math.random();
    this.polarX = Math.round(polar_r * Math.cos(radian));
    this.polarY = Math.round(polar_r * Math.sin(radian));
    this.polarZ = Math.sqrt(Math.pow(this.windowRadius, 2) - Math.pow(this.polarX, 2) - Math.pow(this.polarY, 2));
  }

  colorSet() {
    this.colorRed = Math.random() < 0.5 ? 2 * Math.random() + 0.1 : -2 * Math.random() + 0.1;
    this.colorGreen = Math.random() < 0.5 ? 2 * Math.random() + 0.1 : -2 * Math.random() + 0.1;
    if (Math.sign(this.colorRed) * Math.sign(this.colorGreen) == -1) {
      this.colorBlue = Math.random() < 0.5 ? 2 * Math.random() + 0.1 : -2 * Math.random() + 0.1;
    } else {
      this.colorBlue = Math.sign(this.colorRed) < 0 ? 2 * Math.random() + 0.1 : -2 * Math.random() + 0.1;
    }
  }

  spacePosition(clientX: number, clientY: number) {
    this.spaceX = clientX;
    this.spaceY = clientY;
    const minZ = this.windowRadius;       // 최소 절댓값
    const maxZ = this.windowRadius * 20;  // 최대 절댓값
    const sign = Math.random() < 0.5 ? -1 : 1; // 음수 또는 양수 결정
    this.spaceZ = sign * (minZ + Math.random() * (maxZ - minZ));

    console.log("windowRadius:", this.windowRadius, "=> spaceZ:", this.spaceZ);
    
  }

  renderingPlanet(sunx: number, suny: number, stageWidth: number, stageHeight: number) {
    this.sunx = sunx;
    this.suny = suny;
    this.shadePolor = Calculate.directionVectorPlanetToSun(
      this.spaceX,
      this.spaceY,
      this.spaceZ,
      this.windowRadius,
      this.sunx,
      this.suny
    );

    for (let i = this.windowX - this.windowRadius; i <= this.windowX + this.windowRadius; i++) {
      for (let j = this.windowY - this.windowRadius; j <= this.windowY + this.windowRadius; j++) {
        const pos = Math.pow(i - this.windowX, 2) + Math.pow(j - this.windowY, 2);
        const circle = Math.pow(this.windowRadius, 2);
        if (pos <= circle) {
          const x3 = i - this.windowX;
          const y3 = j - this.windowY;
          const z3 = Math.sqrt(Math.pow(this.windowRadius, 2) - Math.pow(x3, 2) - Math.pow(y3, 2));

          const decisionHalfSphere = Calculate.distancePointToPoint(
            this.shadePolor.x,
            this.shadePolor.y,
            this.shadePolor.z,
            x3,
            y3,
            z3
          );

          const d = Calculate.distanceLineToPoint(x3, y3, Math.abs(z3), this.polarX, this.polarY, this.polarZ);
          let r_c, g_c, b_c;

          if (decisionHalfSphere >= Math.sqrt(2) * this.windowRadius) {
            const d_shade = Calculate.distanceLineToPoint(x3, y3, z3, this.shadePolor.x, this.shadePolor.y, this.shadePolor.z);

            r_c = this.colorRed > 0 ? Math.round((d / (this.colorRed * this.windowRadius)) * 255) : Math.round(255 + (d / (this.colorRed * this.windowRadius)) * 255);
            g_c = this.colorGreen > 0 ? Math.round((d / (this.colorGreen * this.windowRadius)) * 255) : Math.round(255 + (d / (this.colorGreen * this.windowRadius)) * 255);
            b_c = this.colorBlue > 0 ? Math.round((d / (this.colorBlue * this.windowRadius)) * 255) : Math.round(255 + (d / (this.colorBlue * this.windowRadius)) * 255);

            const shadow_radian = Math.PI * 2 / 30;
            const boundryD = this.windowRadius * Math.cos(shadow_radian);

            if (d_shade < boundryD) {
              r_c = 0;
              g_c = 0;
              b_c = 0;
            } else {
              const ratio_shade = (d_shade - boundryD) / (this.windowRadius - boundryD);
              r_c *= ratio_shade;
              g_c *= ratio_shade;
              b_c *= ratio_shade;
            }
          } else {
            r_c = this.colorRed > 0 ? Math.round((d / (this.colorRed * this.windowRadius)) * 255) : Math.round(255 + (d / (this.colorRed * this.windowRadius)) * 255);
            g_c = this.colorGreen > 0 ? Math.round((d / (this.colorGreen * this.windowRadius)) * 255) : Math.round(255 + (d / (this.colorGreen * this.windowRadius)) * 255);
            b_c = this.colorBlue > 0 ? Math.round((d / (this.colorBlue * this.windowRadius)) * 255) : Math.round(255 + (d / (this.colorBlue * this.windowRadius)) * 255);
          }

          this.ctx.fillStyle = `rgb(${r_c},${g_c},${b_c})`;
          this.ctx.fillRect(i, j, 2, 2);
        }
      }
    }
  }

  genOrbit() {
    this.orbitDirectionVector = { x: 0, y: 0, z: 0 };
  }
}
