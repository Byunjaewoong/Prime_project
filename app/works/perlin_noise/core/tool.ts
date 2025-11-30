// app/works/perlin_noise/core/tool.ts
export class Calculate {
  // 내적
  static vectorProduct(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ) {
    return x1 * x2 + y1 * y2 + z1 * z2;
  }

  static getRandomArbitrary(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

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
      expo_x * expo_x + expo_y * expo_y + expo_z * expo_z;
    const denom =
      x_polar * x_polar + y_polar * y_polar + z_polar * z_polar;

    return Math.sqrt(numer / denom);
  }

  static distancePointToPoint(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
  ) {
    return Math.sqrt(
      Math.pow(x1 - x2, 2) +
        Math.pow(y1 - y2, 2) +
        Math.pow(z1 - z2, 2)
    );
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
    const vv = refx * refx + refy * refy + refz * refz;
    const sv = tox * refx + toy * refy + toz * refz;
    const k = sv / vv;

    const sllx = k * refx;
    const slly = k * refy;
    const sllz = k * refz;

    const xp = tox - sllx;
    const yp = toy - slly;
    const zp = toz - sllz;

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

    arr1[0][0] = Math.cos(angle) +
      (1 - Math.cos(angle)) * Math.pow(axisX, 2);
    arr1[0][1] =
      (1 - Math.cos(angle)) * axisX * axisY -
      Math.sin(angle) * axisZ;
    arr1[0][2] =
      (1 - Math.cos(angle)) * axisX * axisZ +
      Math.sin(angle) * axisY;

    arr1[1][0] =
      (1 - Math.cos(angle)) * axisX * axisY +
      Math.sin(angle) * axisZ;
    arr1[1][1] =
      Math.cos(angle) +
      (1 - Math.cos(angle)) * Math.pow(axisY, 2);
    arr1[1][2] =
      (1 - Math.cos(angle)) * axisY * axisZ -
      Math.sin(angle) * axisX;

    arr1[2][0] =
      (1 - Math.cos(angle)) * axisX * axisZ -
      Math.sin(angle) * axisY;
    arr1[2][1] =
      (1 - Math.cos(angle)) * axisY * axisZ +
      Math.sin(angle) * axisX;
    arr1[2][2] =
      Math.cos(angle) +
      (1 - Math.cos(angle)) * Math.pow(axisZ, 2);

    const answer = this.matrixProduct(arr1, arr2);

    return {
      x: answer[0][0],
      y: answer[1][0],
      z: answer[2][0],
    };
  }

  static matrixProduct(
    arr1: number[][],
    arr2: number[][]
  ): number[][] {
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
          answer[i][j] += arr1[i][k] * arr2[k][j];
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

  static perspectiveConvert(
    x1: number,
    y1: number,
    z1: number,
    k1: number
  ) {
    const xp = (x1 * k1) / z1;
    const yp = (y1 * k1) / z1;

    return {
      x: xp,
      y: yp,
    };
  }
}
