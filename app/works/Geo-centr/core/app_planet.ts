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
      Math.pow(expo_x, 2) + Math.pow(expo_y, 2) + Math.pow(expo_z, 2);
    const denom =
      Math.pow(x_polar, 2) + Math.pow(y_polar, 2) + Math.pow(z_polar, 2);

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
    const z1 = -vz;
    const squrt = Math.sqrt(x1 ** 2 + y1 ** 2 + z1 ** 2);

    return {
      x: (x1 / squrt) * windowRadius,
      y: (y1 / squrt) * windowRadius,
      z: (z1 / squrt) * windowRadius,
    };
  }
}

export type PlanetLike = Planet | { spaceZ: number; genSun: 1 };

export class PlanetGroup {
  array: PlanetLike[];

  constructor() {
    this.array = [];
  }

  pushing(planet: PlanetLike) {
    this.array.push(planet);
    this.sorting(this.array);
  }

  sorting(array: PlanetLike[]) {
    array.sort((a, b) => a.spaceZ - b.spaceZ);
  }
}


export class Planet {
  

  // 🌕 위성 최대 궤도 범위 계수 (행성 반지름의 몇 배까지 궤도 사용?)
  static readonly MAX_SATELLITE_ORBIT_FACTOR = 3.0;

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

  shadePolor: { x: number; y: number; z: number };

  colorRed: number;
  colorGreen: number;
  colorBlue: number;

  polarX: number;
  polarY: number;
  polarZ: number;

  portionX: number;
  portionY: number;

  orbitDirectionVector: { x: number; y: number; z: number };
  renderingPixel: number;

    // ⭐ 이 행성의 위성들
  satellites: Satellite[] = [];


  constructor(
    canvas: HTMLCanvasElement,
    event: MouseEvent,
    spaceRadius: number,
    planetR: number,
    sunx: number,
    suny: number,
    _stageWidth: number,
    _stageHeight: number
  ) {
    this.canvas = canvas;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context를 가져올 수 없습니다.");
    }
    this.ctx = ctx;

    this.planetR = planetR;
    this.sunx = sunx;
    this.suny = suny;

    this.renderingPixel = 1 / Math.max(1, this.canvas.width / Math.max(1, _stageWidth));
    this.portionX = event.clientX / _stageWidth;
    this.portionY = event.clientY / _stageHeight;

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

    // 기본 windowRadius 초기값
    this.windowRadius =
      ((spaceRadius * 2 + this.spaceZ) / (spaceRadius * 4)) * this.planetR;

    this.spacePosition(event.clientX, event.clientY);

    // spaceZ를 활용해서 화면에 보이는 실제 크기 조정
    const minRadius = 10; // 최소 크기
    const maxRadius = 70; // 최대 크기
    const t = (this.spaceZ + spaceRadius) / (2 * spaceRadius);
    this.windowRadius = minRadius + t * (maxRadius - minRadius);

    this.generatePolar();
    this.colorSet();

    this.windowX = this.spaceX;
    this.windowY = this.spaceY;

    this.orbitDirectionVector = { x: 0, y: 0, z: 0 };

    // 위성 0~3개 랜덤
    const count = Math.floor(Math.random() * 4);
    this.createSatellites(count);

  }

  logPosition() {
    console.log(
      `Planet Position -> X: ${this.spaceX.toFixed(2)}, Y: ${this.spaceY.toFixed(
        2
      )}, Z: ${this.spaceZ.toFixed(2)}`
    );
  }

  resize(stageWidth: number, stageHeight: number) {
    this.renderingPixel = 1 / Math.max(1, this.canvas.width / Math.max(1, stageWidth));
    this.spaceX = stageWidth * this.portionX;
    this.spaceY = stageHeight * this.portionY;
    this.windowX = this.spaceX;
    this.windowY = this.spaceY;
  }

  generatePolar() {
    const polar_r = this.windowRadius * Math.random();
    const radian = Math.PI * 2 * Math.random();

    this.polarX = Math.round(polar_r * Math.cos(radian));
    this.polarY = Math.round(polar_r * Math.sin(radian));
    this.polarZ = Math.sqrt(
      Math.pow(this.windowRadius, 2) -
        Math.pow(this.polarX, 2) -
        Math.pow(this.polarY, 2)
    );
  }

  colorSet() {
    this.colorRed =
      Math.random() < 0.5
        ? 2 * Math.random() + 0.1
        : -2 * Math.random() + 0.1;

    this.colorGreen =
      Math.random() < 0.5
        ? 2 * Math.random() + 0.1
        : -2 * Math.random() + 0.1;

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

  // colorSet() {
  //   // 🎨 준비해 둔 프리셋 중 하나 랜덤 선택
  //   const preset =
  //     PLANET_COLOR_PRESETS[
  //       Math.floor(Math.random() * PLANET_COLOR_PRESETS.length)
  //     ];

  //   this.colorRed = preset.r;
  //   this.colorGreen = preset.g;
  //   this.colorBlue = preset.b;
  // }


  spacePosition(clientX: number, clientY: number) {
    this.spaceX = clientX;
    this.spaceY = clientY;

    const minZ = this.windowRadius; // 최소 절댓값
    const maxZ = this.windowRadius * 20; // 최대 절댓값
    const sign = Math.random() < 0.5 ? -1 : 1; // 음/양 결정

    this.spaceZ = sign * (minZ + Math.random() * (maxZ - minZ));

    console.log("windowRadius:", this.windowRadius, "=> spaceZ:", this.spaceZ);
  }

  renderingPlanet(
    sunx: number,
    suny: number,
    _stageWidth: number,
    _stageHeight: number
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
        const pos = Math.pow(i - this.windowX, 2) + Math.pow(j - this.windowY, 2);
        const circle = Math.pow(this.windowRadius, 2);

        if (pos <= circle) {
          const x3 = i - this.windowX;
          const y3 = j - this.windowY;
          const z3 = Math.sqrt(
            Math.pow(this.windowRadius, 2) -
              Math.pow(x3, 2) -
              Math.pow(y3, 2)
          );

          const decisionHalfSphere = Calculate.distancePointToPoint(
            this.shadePolor.x,
            this.shadePolor.y,
            this.shadePolor.z,
            x3,
            y3,
            z3
          );

          const d = Calculate.distanceLineToPoint(
            x3,
            y3,
            Math.abs(z3),
            this.polarX,
            this.polarY,
            this.polarZ
          );

          let r_c: number;
          let g_c: number;
          let b_c: number;

          const colorCalc = (base: number) =>
            base > 0
              ? Math.round((d / (base * this.windowRadius)) * 255)
              : Math.round(
                  255 + (d / (base * this.windowRadius)) * 255
                );

          if (decisionHalfSphere >= Math.sqrt(2) * this.windowRadius) {
            const d_shade = Calculate.distanceLineToPoint(
              x3,
              y3,
              z3,
              this.shadePolor.x,
              this.shadePolor.y,
              this.shadePolor.z
            );

            r_c = colorCalc(this.colorRed);
            g_c = colorCalc(this.colorGreen);
            b_c = colorCalc(this.colorBlue);

            const shadow_radian = (Math.PI * 2) / 30;
            const boundryD = this.windowRadius * Math.cos(shadow_radian);

            if (d_shade < boundryD) {
              r_c = 0;
              g_c = 0;
              b_c = 0;
            } else {
              const ratio_shade =
                (d_shade - boundryD) /
                (this.windowRadius - boundryD);

              r_c *= ratio_shade;
              g_c *= ratio_shade;
              b_c *= ratio_shade;
            }
          } else {
            r_c = colorCalc(this.colorRed);
            g_c = colorCalc(this.colorGreen);
            b_c = colorCalc(this.colorBlue);
          }

          this.ctx.fillStyle = `rgb(${r_c},${g_c},${b_c})`;
          this.ctx.fillRect(i, j, this.renderingPixel, this.renderingPixel);
        }
      }
    }
  }

  genOrbit() {
    this.orbitDirectionVector = { x: 0, y: 0, z: 0 };
  }

// 🌕 위성 n개 생성
createSatellites(n: number) {
  // 기존 위성 비우기
  this.satellites = [];

  if (n <= 0) return;

  for (let i = 0; i < n; i++) {
    const satellite = new Satellite(this); // ✅ 행성 자기 자신만 넘김
    this.satellites.push(satellite);
  }

  console.log("🛰 satellites created:", this.satellites.length);
}



  // 🌕 위성들 궤도 업데이트 + 렌더
  renderSatellites(sunx: number, suny: number) {
    for (const sat of this.satellites) {
      sat.updateOrbit();
      sat.renderingSatellite(sunx, suny);
    }
  }

}


export class Satellite {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  parent: Planet;

  spaceX: number;
  spaceY: number;
  spaceZ: number;

  windowX: number;
  windowY: number;
  windowRadius: number; // 위성 화면 반지름

  // 궤도 관련
  orbitRadius: number;
  angle: number;
  angularSpeed: number; // 공전 속도 (+/- : 방향)

    // 🔁 궤도 평면 기울기 (3D)
  tiltX: number;
  tiltY: number;

  // 색/표면 관련 (행성과 거의 동일 구조)
  colorRed!: number;
  colorGreen!: number;
  colorBlue!: number;

  polarX: number;
  polarY: number;
  polarZ: number;

  shadePolor: { x: number; y: number; z: number };

  constructor(parent: Planet) {
    this.parent = parent;
    this.canvas = parent.canvas;
    this.ctx = parent.ctx;

    // 🌕 위성 크기: 행성 반지름의 1/6 이하 랜덤
    const ratioMin = 0.1;
    const ratioMax = 0.3;
    const rRatio = ratioMin + Math.random() * (ratioMax - ratioMin);
    this.windowRadius = parent.windowRadius * rRatio;

    // 🌕 위성 궤도 반경: 행성 반지름의 1.5 ~ MAX_SATELLITE_ORBIT_FACTOR 배 사이 랜덤
    const orbitMin = 1.5;
    const orbitMax = Planet.MAX_SATELLITE_ORBIT_FACTOR;
    const orbitFactor = orbitMin + Math.random() * (orbitMax - orbitMin);
    this.orbitRadius = parent.windowRadius * orbitFactor;

    // 궤도 시작 각도 + 속도 (시계/반시계 랜덤)
    this.angle = Math.random() * Math.PI * 2;
    const baseSpeed = 0.002; // 너무 빠르면 어지러우니 낮게
    const speedJitter = 0.004;
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.angularSpeed = dir * (baseSpeed + Math.random() * speedJitter);

        // 🔁 궤도 평면 기울기 (대략 ±30도 정도 랜덤)
    this.tiltX = (Math.random() - 0.5) * (Math.PI );
    this.tiltY = (Math.random() - 0.5) * (Math.PI );

    // Z는 행성 근처에 두되, 살짝 앞/뒤로
    // this.spaceZ = parent.spaceZ + this.windowRadius * 0.2;

    // 색은 행성과 비슷하게
    // this.colorRed = parent.colorRed;
    // this.colorGreen = parent.colorGreen;
    // this.colorBlue = parent.colorBlue;

        // 🎨 위성은 행성과 독립된 팔레트에서 색 선택
    // const preset =
    //   SATELLITE_COLOR_PRESETS[
    //     Math.floor(Math.random() * SATELLITE_COLOR_PRESETS.length)
    //   ];
    // this.colorRed = preset.r;
    // this.colorGreen = preset.g;
    // this.colorBlue = preset.b;

    this.spaceX = 0;
    this.spaceY = 0;
    this.spaceZ = 0;

    this.windowX = 0;
    this.windowY = 0;

    this.colorSet();

    this.polarX = 0;
    this.polarY = 0;
    this.polarZ = 0;

    this.shadePolor = { x: 0, y: 0, z: 0 };

    // 최초 위치 계산
    this.updatePositionFromAngle();
    this.generatePolar();

  }

  // private updatePositionFromAngle() {
  //   this.spaceX = this.parent.spaceX + this.orbitRadius * Math.cos(this.angle);
  //   this.spaceY = this.parent.spaceY + this.orbitRadius * Math.sin(this.angle);

  //   this.windowX = this.spaceX;
  //   this.windowY = this.spaceY;
  // }

  // Satellite 클래스 내부에 추가
  private overlapsSunCore(sunx: number, suny: number): boolean {
    // 태양 중심과 위성 중심의 거리
    const dx = this.spaceX - sunx;
    const dy = this.spaceY - suny;
    const dist = Math.hypot(dx, dy);

    // LandScape.genSunCore 에서 쓴 코어 반지름과 맞춰주기
    const SUN_CORE_RADIUS = 30; // app_landScape.genSunCore 에서 사용한 값

    // 코어 원(태양) + 위성 원 겹치는지만 체크
    return dist < SUN_CORE_RADIUS + this.windowRadius;
  }

    // 행성 원과 겹치는지(2D) 체크
  private overlapsParentDisc(): boolean {
    const dx = this.spaceX - this.parent.spaceX;
    const dy = this.spaceY - this.parent.spaceY;
    const dist = Math.hypot(dx, dy);
    return dist < this.windowRadius + this.parent.windowRadius;
  }

  // 태양(원반)과 겹치는지(2D) 체크
  private overlapsSun(sunx: number, suny: number): boolean {
    const dx = this.spaceX - sunx;
    const dy = this.spaceY - suny;
    const dist = Math.hypot(dx, dy);

    const SUN_RADIUS = 150; // LandScape.genSunCore 에서 쓰는 값과 맞춤
    return dist < this.windowRadius + SUN_RADIUS;
  }


    // 🔁 각도에 따라 3D 상에서 위치 갱신
  private updatePositionFromAngle() {
    // 1) 기본적으로 XY 평면에서 도는 원 궤도
    const localX = this.orbitRadius * Math.cos(this.angle);
    const localY = this.orbitRadius * Math.sin(this.angle);
    const localZ = 0;

    // 2) X축 기울기 → YZ 평면 회전
    const cosX = Math.cos(this.tiltX);
    const sinX = Math.sin(this.tiltX);

    const y1 = localY * cosX - localZ * sinX;
    const z1 = localY * sinX + localZ * cosX;
    const x1 = localX;

    // 3) Y축 기울기 → XZ 평면 회전
    const cosY = Math.cos(this.tiltY);
    const sinY = Math.sin(this.tiltY);

    const x2 = x1 * cosY + z1 * sinY;
    const z2 = -x1 * sinY + z1 * cosY;
    const y2 = y1;

    // 4) 부모 행성 기준 3D 위치
    this.spaceX = this.parent.spaceX + x2;
    this.spaceY = this.parent.spaceY + y2;
    this.spaceZ = this.parent.spaceZ + z2; // ✅ 여기서 Z도 같이 움직임

    this.windowX = this.spaceX;
    this.windowY = this.spaceY;
  }

  // 행성과 유사한 polar 벡터 생성
  generatePolar() {
    const polar_r = this.windowRadius * Math.random();
    const radian = Math.PI * 2 * Math.random();

    this.polarX = Math.round(polar_r * Math.cos(radian));
    this.polarY = Math.round(polar_r * Math.sin(radian));
    this.polarZ = Math.sqrt(
      Math.pow(this.windowRadius, 2) -
        Math.pow(this.polarX, 2) -
        Math.pow(this.polarY, 2)
    );
  }

  colorSet() {
    this.colorRed =
      Math.random() < 0.5
        ? 2 * Math.random() + 0.1
        : -2 * Math.random() + 0.1;

    this.colorGreen =
      Math.random() < 0.5
        ? 2 * Math.random() + 0.1
        : -2 * Math.random() + 0.1;

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

  // 공전 업데이트
  updateOrbit() {
    this.angle += this.angularSpeed;
    this.updatePositionFromAngle();
  }

  // 🌑 행성 그림자 영역 안에 있는지 체크
  private isInPlanetShadow(sunx: number, suny: number): boolean {
    const px = this.parent.spaceX;
    const py = this.parent.spaceY;
    const sx = this.spaceX;
    const sy = this.spaceY;

    const vpx = px - sunx;
    const vpy = py - suny;
    const vsx = sx - sunx;
    const vsy = sy - suny;

    const lenP = Math.hypot(vpx, vpy);
    const lenS = Math.hypot(vsx, vsy);

    if (lenP < 1e-3 || lenS < 1e-3) return false;

    // 위성이 행성보다 태양에서 더 가까우면, 행성 그림자 뒤에 있진 않음
    if (lenS <= lenP) return false;

    const dot = (vpx * vsx + vpy * vsy) / (lenP * lenS);
    const clamped = Math.max(-1, Math.min(1, dot));
    const angle = Math.acos(clamped); // 두 벡터 사이 각도

    // 태양에서 본 행성의 각 반지름
    const thetaP = Math.asin(Math.min(1, this.parent.windowRadius / lenP));

    // 각도 차이가 행성 각 반지름보다 작으면 "행성 뒤쪽 콘 안"에 있다고 가정
    return angle < thetaP;
  }

  // 위성 렌더링 (행성과 거의 동일한 알고리즘 + 행성 그림자 보정)
  renderingSatellite(sunx: number, suny: number) {

        // 🌑 Z-정렬 기반 가림 처리
    const sunZ = 0; // 태양은 z=0 평면에 있다고 가정

    const hiddenByPlanet =
      this.spaceZ <= this.parent.spaceZ && this.overlapsParentDisc();

    const hiddenBySun =
      this.spaceZ <= sunZ && this.overlapsSunCore(sunx, suny);

    if (hiddenByPlanet || hiddenBySun) {
      return; // ✅ 행성/태양 뒤에 가려졌다고 판단되면 통째로 렌더링 스킵
    }

    this.shadePolor = Calculate.directionVectorPlanetToSun(
      this.spaceX,
      this.spaceY,
      this.spaceZ,
      this.windowRadius,
      sunx,
      suny
    );

    const inUmbra = this.isInPlanetShadow(sunx, suny);

    for (
      let i = this.windowX - this.windowRadius;
      i <= this.windowX + this.windowRadius;
      i += this.parent.renderingPixel
    ) {
      for (
        let j = this.windowY - this.windowRadius;
        j <= this.windowY + this.windowRadius;
        j += this.parent.renderingPixel
      ) {
        const pos =
          Math.pow(i - this.windowX, 2) + Math.pow(j - this.windowY, 2);
        const circle = Math.pow(this.windowRadius, 2);

        if (pos <= circle) {
          const x3 = i - this.windowX;
          const y3 = j - this.windowY;
          const z3 = Math.sqrt(
            Math.pow(this.windowRadius, 2) -
              Math.pow(x3, 2) -
              Math.pow(y3, 2)
          );

          const decisionHalfSphere = Calculate.distancePointToPoint(
            this.shadePolor.x,
            this.shadePolor.y,
            this.shadePolor.z,
            x3,
            y3,
            z3
          );

          const d = Calculate.distanceLineToPoint(
            x3,
            y3,
            Math.abs(z3),
            this.polarX,
            this.polarY,
            this.polarZ
          );

          const colorCalc = (base: number) =>
            base > 0
              ? Math.round((d / (base * this.windowRadius)) * 255)
              : Math.round(
                  255 + (d / (base * this.windowRadius)) * 255
                );

          let r_c: number;
          let g_c: number;
          let b_c: number;

          if (decisionHalfSphere >= Math.sqrt(2) * this.windowRadius) {
            const d_shade = Calculate.distanceLineToPoint(
              x3,
              y3,
              z3,
              this.shadePolor.x,
              this.shadePolor.y,
              this.shadePolor.z
            );

            r_c = colorCalc(this.colorRed);
            g_c = colorCalc(this.colorGreen);
            b_c = colorCalc(this.colorBlue);

            const shadow_radian = (Math.PI * 2) / 30;
            const boundryD = this.windowRadius * Math.cos(shadow_radian);

            if (d_shade < boundryD) {
              r_c = 0;
              g_c = 0;
              b_c = 0;
            } else {
              const ratio_shade =
                (d_shade - boundryD) /
                (this.windowRadius - boundryD);

              r_c *= ratio_shade;
              g_c *= ratio_shade;
              b_c *= ratio_shade;
            }
          } else {
            r_c = colorCalc(this.colorRed);
            g_c = colorCalc(this.colorGreen);
            b_c = colorCalc(this.colorBlue);
          }

          // 🌑 행성 그림자 뒤면 전체 밝기 줄이기
          if (inUmbra) {
            const factor = 0.1; // 0 = 완전 암흑, 1 = 그대로
            r_c *= factor;
            g_c *= factor;
            b_c *= factor;
          }

          this.ctx.fillStyle = `rgb(${r_c},${g_c},${b_c})`;
          this.ctx.fillRect(i, j, this.parent.renderingPixel, this.parent.renderingPixel);
        }
      }
    }
  }
}

