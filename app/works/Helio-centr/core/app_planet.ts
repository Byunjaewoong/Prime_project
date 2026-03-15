// app/works/orbit2/core/app_planet.ts

export class Calculate {
  static distanceLineToPoint(
    x3: number,
    y3: number,
    z3: number,
    x_polar: number,
    y_polar: number,
    z_polar: number
  ) {
    const expo_x = y_polar * z3 - z_polar * y3;
    const expo_y = x_polar * z3 - z_polar * x3;
    const expo_z = x_polar * y3 - y_polar * x3;

    const numer =
      Math.pow(expo_x, 2) +
      Math.pow(expo_y, 2) +
      Math.pow(expo_z, 2);
    const denom =
      Math.pow(x_polar, 2) +
      Math.pow(y_polar, 2) +
      Math.pow(z_polar, 2);
    const d = Math.sqrt(numer / denom);

    return d;
  }

  static distancePointToPoint(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ) {
    const d = Math.sqrt(
      Math.pow(x1 - x2, 2) +
        Math.pow(y1 - y2, 2) +
        Math.pow(z1 - z2, 2)
    );
    return d;
  }

  static directionVectorPlanetToSun(
    vx: number,
    vy: number,
    vz: number,
    windowRadius: number,
    sunx: number,
    suny: number
  ) {
    const x1 = sunx - vx;
    const y1 = suny - vy;
    const z1 = -1 * vz;

    const squrt = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);

    const xp = (x1 / squrt) * windowRadius;
    const yp = (y1 / squrt) * windowRadius;
    const zp = (z1 / squrt) * windowRadius;

    return {
      x: xp,
      y: yp,
      z: zp,
    };
  }

  static orthogonalVector(
    refx: number,
    refy: number,
    refz: number,
    tox: number,
    toy: number,
    toz: number
  ) {
    const sll = { x: 0, y: 0, z: 0 };

    const vv = refx * refx + refy * refy + refz * refz;
    const sv = tox * refx + toy * refy + toz * refz;
    const k = sv / vv;

    sll.x = k * refx;
    sll.y = k * refy;
    sll.z = k * refz;

    const xp = tox - sll.x;
    const yp = toy - sll.y;
    const zp = toz - sll.z;

    const length = Math.sqrt(xp * xp + yp * yp + zp * zp);
    const xp_normal = xp / length;
    const yp_normal = yp / length;
    const zp_normal = zp / length;

    return {
      x: xp_normal,
      y: yp_normal,
      z: zp_normal,
    };
  }

  static axisRotation(
    axisX: number,
    axisY: number,
    axisZ: number,
    x1: number,
    y1: number,
    z1: number,
    angle: number
  ) {
    const arr1 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const arr2 = [[x1], [y1], [z1]];

    arr1[0][0] = Math.cos(angle) + (1 - Math.cos(angle)) * Math.pow(axisX, 2);
    arr1[0][1] =
      (1 - Math.cos(angle)) * axisX * axisY - Math.sin(angle) * axisZ;
    arr1[0][2] =
      (1 - Math.cos(angle)) * axisX * axisZ + Math.sin(angle) * axisY;

    arr1[1][0] =
      (1 - Math.cos(angle)) * axisX * axisY + Math.sin(angle) * axisZ;
    arr1[1][1] =
      Math.cos(angle) + (1 - Math.cos(angle)) * Math.pow(axisY, 2);
    arr1[1][2] =
      (1 - Math.cos(angle)) * axisY * axisZ - Math.sin(angle) * axisX;

    arr1[2][0] =
      (1 - Math.cos(angle)) * axisX * axisZ - Math.sin(angle) * axisY;
    arr1[2][1] =
      (1 - Math.cos(angle)) * axisY * axisZ + Math.sin(angle) * axisX;
    arr1[2][2] =
      Math.cos(angle) + (1 - Math.cos(angle)) * Math.pow(axisZ, 2);

    const answer = this.matrixProduct(arr1, arr2);

    return {
      x: answer[0][0],
      y: answer[1][0],
      z: answer[2][0],
    };
  }

  static matrixProduct(arr1: number[][], arr2: number[][]) {
    const answer: number[][] = [];
    const row1 = arr1.length;
    const col1 = arr1[0].length;
    const col2 = arr2[0].length;

    for (let s = 0; s < row1; s++) {
      answer.push([]);
      for (let n = 0; n < col2; n++) {
        answer[s].push(0);
      }
    }

    for (let i = 0; i < row1; i++) {
      for (let j = 0; j < col2; j++) {
        for (let k = 0; k < col1; k++) {
          answer[i][j] = answer[i][j] + arr1[i][k] * arr2[k][j];
        }
      }
    }

    return answer;
  }

  static perspectiveLength(
    realLength: number,
    massX: number,
    massY: number,
    massZ: number,
    sightPositionX: number,
    sightPositionY: number,
    sightPositionZ: number
  ) {
    let windowLength = 0;
    const distance = this.distancePointToPoint(
      massX,
      massY,
      massZ,
      sightPositionX,
      sightPositionY,
      sightPositionZ
    );
    const sightdistance = this.distancePointToPoint(
      0,
      0,
      0,
      sightPositionX,
      sightPositionY,
      sightPositionZ
    );
    windowLength = (sightdistance / distance) * realLength;

    return windowLength;
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

type Vec3 = { x: number; y: number; z: number };

export class Planet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  stageWidth: number;
  stageHeight: number;
  planetR: number;
  event: MouseEvent;
  portionX: number;
  portionY: number;

  spaceX: number;
  spaceY: number;
  spaceZ: number;
  spaceRadius: number;

  colorRed: number;
  colorGreen: number;
  colorBlue: number;

  polarX: number;
  polarY: number;
  polarZ: number;

  shadePolor: Vec3 | 0;
  sunx: number;
  suny: number;

  au: number;
  angleSpeed: number;

  windowRadius: number;
  windowX: number;
  windowY: number;

  seedVector!: Vec3;
  axisOrbit!: Vec3;
  OrbitStack!: Vec3[];
  OrbitStep!: number;
  counter: number;
  renderingPixel: number = 1;

  constructor(
    canvas: HTMLCanvasElement,
    event: MouseEvent,
    spaceRadius: number,
    planetR: number,
    angleSpeed: number,
    sunx: number,
    suny: number,
    stageWidth: number,
    stageHeight: number
  ) {
    this.stageWidth = stageWidth;
    this.stageHeight = stageHeight;
    this.planetR = planetR * (Math.random() + 0.5);
    this.event = event;
    this.canvas = canvas;

    this.portionX = this.event.clientX / this.canvas.width;
    this.portionY = this.event.clientY / this.canvas.height;

    this.ctx = this.canvas.getContext("2d")!;
    this.spaceX = 0;
    this.spaceY = 0;
    this.spaceZ = 0;
    this.spaceRadius = spaceRadius;
    this.colorRed = 0;
    this.colorGreen = 0;
    this.colorBlue = 0;
    this.polarX = 0;
    this.polarY = 0;
    this.polarZ = 0;

    this.shadePolor = 0;

    this.sunx = sunx;
    this.suny = suny;

    this.spacePosition(this.event.clientX, this.event.clientY);

    this.au = Calculate.distancePointToPoint(
      this.spaceX,
      this.spaceY,
      this.spaceZ,
      this.sunx,
      this.suny,
      0
    );

    this.angleSpeed =
      angleSpeed *
      (Math.pow(this.stageHeight, 2) / Math.pow(this.au, 2)) *
      (this.planetR / planetR);

    this.windowRadius = Calculate.perspectiveLength(
      this.planetR,
      this.spaceX - this.sunx,
      this.spaceY - this.suny,
      this.spaceZ,
      0,
      0,
      this.spaceRadius + 500
    );

    this.generatePolar();
    this.colorSet();

    this.windowX = this.spaceX;
    this.windowY = this.spaceY;

    this.genOrbit();
    this.counter = 0;
  }

  generatePolar() {
    const polar_r = this.windowRadius * Math.random();
    const radian = Math.PI * 2 * Math.random();
    this.polarX = Math.round(polar_r * Math.cos(radian));
    this.polarY = Math.round(polar_r * Math.sin(radian));
    this.polarZ = Math.sqrt(
      Math.abs(
        Math.pow(this.windowRadius, 2) -
          Math.pow(this.polarX, 2) -
          Math.pow(this.polarY, 2)
      )
    );
  }

  colorSet() {
    this.colorRed =
      Math.random() < 0.5 ? 2 * Math.random() + 0.1 : -2 * Math.random() + 0.1;
    this.colorGreen =
      Math.random() < 0.5 ? 2 * Math.random() + 0.1 : -2 * Math.random() + 0.1;

    if (Math.sign(this.colorRed) * Math.sign(this.colorGreen) === -1) {
      this.colorBlue =
        Math.random() < 0.5
          ? 2 * Math.random() + 0.1
          : -2 * Math.random() + 0.1;
    } else {
      this.colorBlue =
        Math.sign(this.colorRed) < 0
          ? 2 * Math.random() + 0.1
          : -2 * Math.random() + 0.1;
    }
  }

  spacePosition(clientX: number, clientY: number) {
    this.spaceX = clientX;
    this.spaceY = clientY;

    while (
      Math.abs(
        Calculate.distancePointToPoint(
          this.spaceX,
          this.spaceY,
          this.spaceZ,
          this.sunx,
          this.suny,
          0
        )
      ) < 300
    ) {
      this.spaceZ = this.spaceRadius * 1.7 * Math.random() - this.spaceRadius;
    }
  }

  renderingPlanet(
    sunx: number,
    suny: number,
    stageWidth: number,
    stageHeight: number
  ) {
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

    this.renderingPixel = 1;

    for (
      let i = this.windowX - this.windowRadius;
      i <= this.windowX + this.windowRadius;
      i += this.renderingPixel
    ) {
      for (
        let j = this.windowY - this.windowRadius;
        j <= this.windowY + this.windowRadius;
        j += this.renderingPixel
      ) {
        const pos = Math.pow(i - this.windowX, 2) +
          Math.pow(j - this.windowY, 2);
        const circle = Math.pow(this.windowRadius, 2);

        if (pos <= circle) {
          const x3 = i - this.windowX;
          const y3 = j - this.windowY;
          const z3 = Math.sqrt(
            Math.pow(this.windowRadius, 2) -
              Math.pow(x3, 2) -
              Math.pow(y3, 2)
          );

          const shade = this.shadePolor as Vec3;

          const decisionHalfSphere = Calculate.distancePointToPoint(
            shade.x,
            shade.y,
            shade.z,
            x3,
            y3,
            z3
          );
          const d = Calculate.distanceLineToPoint(
            x3,
            y3,
            z3,
            this.polarX,
            this.polarY,
            this.polarZ
          );

          let r_c: number;
          let g_c: number;
          let b_c: number;

          if (decisionHalfSphere >= Math.sqrt(2) * this.windowRadius) {
            const d_shade = Calculate.distanceLineToPoint(
              x3,
              y3,
              z3,
              shade.x,
              shade.y,
              shade.z
            );

            if (this.colorRed > 0) {
              r_c = Math.round(
                (d / (this.colorRed * this.windowRadius)) * 255
              );
            } else {
              r_c = Math.round(
                255 + (d / (this.colorRed * this.windowRadius)) * 255
              );
            }

            if (this.colorGreen > 0) {
              g_c = Math.round(
                (d / (this.colorGreen * this.windowRadius)) * 255
              );
            } else {
              g_c = Math.round(
                255 + (d / (this.colorGreen * this.windowRadius)) * 255
              );
            }

            if (this.colorBlue > 0) {
              b_c = Math.round(
                (d / (this.colorBlue * this.windowRadius)) * 255
              );
            } else {
              b_c = Math.round(
                255 + (d / (this.colorBlue * this.windowRadius)) * 255
              );
            }

            const shadow_radian = (Math.PI * 2) / 30;
            const boundryD =
              this.windowRadius * Math.cos(shadow_radian);

            if (d_shade < boundryD) {
              r_c = 0;
              g_c = 0;
              b_c = 0;
            } else {
              const ratio_shade =
                (d_shade - boundryD) /
                (this.windowRadius - boundryD);
              r_c = r_c * ratio_shade;
              g_c = g_c * ratio_shade;
              b_c = b_c * ratio_shade;
            }
          } else {
            if (this.colorRed > 0) {
              r_c = Math.round(
                (d / (this.colorRed * this.windowRadius)) * 255
              );
            } else {
              r_c = Math.round(
                255 + (d / (this.colorRed * this.windowRadius)) * 255
              );
            }

            if (this.colorGreen > 0) {
              g_c = Math.round(
                (d / (this.colorGreen * this.windowRadius)) * 255
              );
            } else {
              g_c = Math.round(
                255 + (d / (this.colorGreen * this.windowRadius)) * 255
              );
            }

            if (this.colorBlue > 0) {
              b_c = Math.round(
                (d / (this.colorBlue * this.windowRadius)) * 255
              );
            } else {
              b_c = Math.round(
                255 + (d / (this.colorBlue * this.windowRadius)) * 255
              );
            }
          }

          this.ctx.fillStyle = `rgba(${r_c},${g_c},${b_c},1)`;
          this.ctx.beginPath();
          this.ctx.arc(
            i,
            j,
            this.renderingPixel,
            0,
            2 * Math.PI
          );
          this.ctx.fill();
        }
      }
    }
  }

  resize(sunx: number, suny: number) {
    this.sunx = sunx;
    this.suny = suny;

    this.spaceX = this.canvas.width * this.portionX;
    this.spaceY = this.canvas.height * this.portionY;
    this.windowX = this.spaceX;
    this.windowY = this.spaceY;

    this.axisOrbit = Calculate.orthogonalVector(
      this.spaceX - this.sunx,
      this.spaceY - this.suny,
      this.spaceZ,
      this.seedVector.x,
      this.seedVector.y,
      this.seedVector.z
    );

    const calx = this.spaceX - this.sunx;
    const caly = this.spaceY - this.suny;

    this.OrbitStack = [{ x: calx, y: caly, z: this.spaceZ }];
    this.OrbitStep = Math.round(
      Math.abs((2 * Math.PI) / this.angleSpeed)
    );

    for (let i = 0; i <= this.OrbitStep; i++) {
      if (i < this.OrbitStep) {
        this.OrbitStack.push(
          Calculate.axisRotation(
            this.axisOrbit.x,
            this.axisOrbit.y,
            this.axisOrbit.z,
            this.OrbitStack[i].x,
            this.OrbitStack[i].y,
            this.OrbitStack[i].z,
            this.angleSpeed
          )
        );
      }
      this.OrbitStack[i].x = this.OrbitStack[i].x + this.sunx;
      this.OrbitStack[i].y = this.OrbitStack[i].y + this.suny;
    }
  }

  genOrbit() {
    this.seedVector = {
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
    };

    this.axisOrbit = Calculate.orthogonalVector(
      this.spaceX - this.sunx,
      this.spaceY - this.suny,
      this.spaceZ,
      this.seedVector.x,
      this.seedVector.y,
      this.seedVector.z
    );

    const calx = this.spaceX - this.sunx;
    const caly = this.spaceY - this.suny;

    this.OrbitStack = [{ x: calx, y: caly, z: this.spaceZ }];

    this.OrbitStep = Math.round(
      Math.abs((2 * Math.PI) / this.angleSpeed)
    );

    for (let i = 0; i <= this.OrbitStep; i++) {
      if (i < this.OrbitStep) {
        this.OrbitStack.push(
          Calculate.axisRotation(
            this.axisOrbit.x,
            this.axisOrbit.y,
            this.axisOrbit.z,
            this.OrbitStack[i].x,
            this.OrbitStack[i].y,
            this.OrbitStack[i].z,
            this.angleSpeed
          )
        );
      }
      this.OrbitStack[i].x = this.OrbitStack[i].x + this.sunx;
      this.OrbitStack[i].y = this.OrbitStack[i].y + this.suny;
    }
  }

  fallPlanet() {
    if (this.counter === this.OrbitStep) {
      this.counter = 0;
    }

    this.spaceX = this.OrbitStack[this.counter].x;
    this.spaceY = this.OrbitStack[this.counter].y;
    this.spaceZ = this.OrbitStack[this.counter].z;
    this.windowX = this.spaceX;
    this.windowY = this.spaceY;
    this.windowRadius = Calculate.perspectiveLength(
      this.planetR,
      this.spaceX - this.sunx,
      this.spaceY - this.suny,
      this.spaceZ,
      0,
      0,
      this.spaceRadius + 500
    );

    this.counter = this.counter + 1;
    // console.log(this.spaceX);
  }
}
